// Pure handler functions consumed by both the CLI dispatcher (scripts/foundry.ts)
// and the MCP server (src/mcp/server.ts). Per ADR-0009: one tool registry, one
// implementation, two transports.
//
// Convention:
//   - Handlers that need persistent state take a StateStore as the first arg.
//   - Pure handlers (filesystem-only) take only args.
//   - Handlers throw on errors. The caller (CLI or MCP) decides how to render them.
//   - Returns are JSON-serialisable plain objects — the MCP transport hands them
//     straight to the client.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { HumanMessage } from "@langchain/core/messages";
import { loadTarget, resolveTargetPath } from "./targets/loader";
import { buildGraph } from "./orchestrator/graph";
import type { StateStore, RunRow, RunStatus } from "./state/checkpointer";
import type { WorldManifest } from "../manifest/schema";

// ─── asset.generate / run.resume ───────────────────────────────────────────

export interface AssetGenerateArgs {
  propId?: string;
  targetPath?: string;
  resumeRunId?: string;
}

export interface AssetGenerateResult {
  runId: string;
  status: "validated" | "rejected";
  propId: string;
  targetPath: string;
  glbPath?: string;
  validationPath?: string;
  triCount?: number;
  triBudget?: number;
  rejection?: string;
  syncedTo?: string;
  resumed: boolean;
}

export async function assetGenerate(
  store: StateStore,
  args: AssetGenerateArgs,
): Promise<AssetGenerateResult> {
  let runId: string;
  let target;
  let propId: string;
  let isResume = false;

  if (args.resumeRunId) {
    const existing = store.runs.get(args.resumeRunId);
    if (!existing) throw new Error(`run ${args.resumeRunId} not found in ${store.dbPath}`);
    runId = existing.run_id;
    target = loadTarget(existing.target_path);
    propId = existing.prop_id;
    isResume = true;
  } else {
    if (!args.propId) throw new Error("propId required when not resuming");
    target = loadTarget(args.targetPath);
    propId = args.propId;
    runId = randomUUID();
    store.runs.insertPending({
      run_id: runId,
      target_path: target.targetRepoPath,
      prop_id: propId,
      started_at: new Date().toISOString(),
    });
  }

  const graph = buildGraph({ propId, checkpointer: store.checkpointer });
  const initial = isResume
    ? null
    : {
        target,
        manifest: target.manifest,
        messages: [new HumanMessage(`generate ${propId}`)],
        currentNode: "start",
      };
  const config = { configurable: { thread_id: runId } };
  const final = await graph.invoke(initial as never, config);

  if (final.validation?.status !== "validated") {
    const reason = final.validation?.rejectionReason ?? "unknown";
    store.runs.updateRejected(runId, reason);
    return {
      runId,
      status: "rejected",
      propId,
      targetPath: target.targetRepoPath,
      rejection: reason,
      resumed: isResume,
    };
  }

  const glbPath = final.glbPath as string;
  const validationPath = glbPath.replace(/\.glb$/, ".validation.json");
  store.runs.updateValidated(runId, glbPath, final.validation.triCount, final.validation.triBudget);

  let syncedTo: string | undefined;
  if (existsSync(target.targetRepoPath)) {
    mkdirSync(target.publicAssetsDir, { recursive: true });
    copyFileSync(glbPath, join(target.publicAssetsDir, basename(glbPath)));
    copyFileSync(validationPath, join(target.publicAssetsDir, basename(validationPath)));
    syncedTo = target.publicAssetsDir;
  }

  return {
    runId,
    status: "validated",
    propId,
    targetPath: target.targetRepoPath,
    glbPath,
    validationPath,
    triCount: final.validation.triCount,
    triBudget: final.validation.triBudget,
    syncedTo,
    resumed: isResume,
  };
}

// ─── asset.list ────────────────────────────────────────────────────────────

export interface AssetListArgs {
  targetPath?: string;
}

export interface AssetSummary {
  assetId: string;
  status: string;
  triCount: number;
  triBudget: number;
  glbPath: string;
  validationPath: string;
  rejection?: string;
}

export interface AssetListResult {
  outputDir: string;
  assets: AssetSummary[];
}

export function assetList(args: AssetListArgs): AssetListResult {
  const target = loadTarget(args.targetPath);
  if (!existsSync(target.outputDir)) return { outputDir: target.outputDir, assets: [] };
  const reports = readdirSync(target.outputDir)
    .filter((f) => f.endsWith(".validation.json"))
    .sort();
  const assets: AssetSummary[] = reports.map((r) => {
    const validationPath = join(target.outputDir, r);
    const data = JSON.parse(readFileSync(validationPath, "utf8"));
    return {
      assetId: data.asset_id,
      status: data.status,
      triCount: data.tri_count,
      triBudget: data.tri_budget,
      glbPath: validationPath.replace(/\.validation\.json$/, ".glb"),
      validationPath,
      rejection: data.rejection_reason,
    };
  });
  return { outputDir: target.outputDir, assets };
}

// ─── target.list ───────────────────────────────────────────────────────────

export interface TargetListArgs {
  rootPath?: string;
}

export interface TargetInfo {
  path: string;
  valid: boolean;
  propCount?: number;
  biomeCount?: number;
  error?: string;
}

export interface TargetListResult {
  rootPath: string;
  targets: TargetInfo[];
}

export function targetList(args: TargetListArgs): TargetListResult {
  const rootPath = resolve(args.rootPath ?? join(process.cwd(), ".."));
  if (!existsSync(rootPath)) {
    throw new Error(`scan root not found: ${rootPath}`);
  }
  const targets: TargetInfo[] = [];
  for (const e of readdirSync(rootPath)) {
    const p = join(rootPath, e);
    try {
      if (!statSync(p).isDirectory()) continue;
    } catch {
      continue;
    }
    if (!existsSync(join(p, "asset-foundry", "world.yaml"))) continue;
    try {
      const t = loadTarget(p);
      targets.push({
        path: p,
        valid: true,
        propCount: t.manifest.props.length,
        biomeCount: t.manifest.biomes.length,
      });
    } catch (err) {
      targets.push({ path: p, valid: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  targets.sort((a, b) => a.path.localeCompare(b.path));
  return { rootPath, targets };
}

// ─── target.scaffold ───────────────────────────────────────────────────────

export interface TargetScaffoldArgs {
  name: string;
  path?: string;
}

export interface TargetScaffoldResult {
  destPath: string;
  filesWritten: string[];
}

export function targetScaffold(args: TargetScaffoldArgs): TargetScaffoldResult {
  const repoRoot = process.cwd();
  const targetRoot = resolve(args.path ?? join(repoRoot, "..", args.name));
  const dest = join(targetRoot, "asset-foundry");
  if (existsSync(dest)) {
    throw new Error(`refuse to overwrite existing ${dest}`);
  }
  const templatesDir = join(repoRoot, "templates", "asset-foundry");
  if (!existsSync(templatesDir)) {
    throw new Error(`templates/ missing at ${templatesDir}`);
  }
  mkdirSync(join(dest, "fixtures"), { recursive: true });
  const subst = (s: string) => s.replaceAll("__TARGET_NAME__", args.name);
  const written: string[] = [];
  for (const f of ["world.yaml", "palettes.yaml"]) {
    const out = join(dest, f);
    writeFileSync(out, subst(readFileSync(join(templatesDir, f), "utf8")));
    written.push(out);
  }
  for (const f of readdirSync(join(templatesDir, "fixtures"))) {
    const out = join(dest, "fixtures", f);
    copyFileSync(join(templatesDir, "fixtures", f), out);
    written.push(out);
  }
  return { destPath: dest, filesWritten: written };
}

// ─── target.validate ───────────────────────────────────────────────────────

export interface TargetValidateArgs {
  targetPath?: string;
}

export interface TargetValidateResult {
  valid: boolean;
  manifestPath?: string;
  propCount?: number;
  biomeCount?: number;
  error?: string;
}

export function targetValidate(args: TargetValidateArgs): TargetValidateResult {
  try {
    const target = loadTarget(args.targetPath);
    return {
      valid: true,
      manifestPath: target.manifestPath,
      propCount: target.manifest.props.length,
      biomeCount: target.manifest.biomes.length,
    };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── manifest.read ─────────────────────────────────────────────────────────

export interface ManifestReadArgs {
  targetPath?: string;
}

export interface ManifestReadResult {
  manifestPath: string;
  manifest: WorldManifest;
}

export function manifestRead(args: ManifestReadArgs): ManifestReadResult {
  const target = loadTarget(args.targetPath);
  return { manifestPath: target.manifestPath, manifest: target.manifest };
}

// ─── run.list ──────────────────────────────────────────────────────────────

export interface RunListArgs {
  targetPath?: string;
  status?: RunStatus;
  limit?: number;
}

export function runList(store: StateStore, args: RunListArgs): RunRow[] {
  const targetAbs = args.targetPath ? resolveTargetPath(args.targetPath) : undefined;
  return store.runs.list({
    target: targetAbs,
    status: args.status,
    limit: args.limit ?? 20,
  });
}

// ─── run.status ────────────────────────────────────────────────────────────

export interface RunStatusArgs {
  runId: string;
}

export interface RunStatusResult extends RunRow {
  lastNode?: string;
  lastTimestamp?: string;
}

export async function runStatus(store: StateStore, args: RunStatusArgs): Promise<RunStatusResult> {
  const row = store.runs.get(args.runId);
  if (!row) throw new Error(`run ${args.runId} not found in ${store.dbPath}`);
  const tuple = await store.checkpointer.getTuple({ configurable: { thread_id: args.runId } });
  if (tuple) {
    const cv = tuple.checkpoint.channel_values as Record<string, unknown>;
    return {
      ...row,
      lastNode: (cv["currentNode"] as string | undefined) ?? undefined,
      lastTimestamp: tuple.config.configurable?.["thread_ts"] as string | undefined,
    };
  }
  return row;
}
