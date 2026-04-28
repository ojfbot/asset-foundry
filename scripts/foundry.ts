// CLI: pnpm foundry <subcommand> [...args]
//
// Phase 2 dispatcher (ADR-0006/0007/0008). Subcommands share one dispatch
// surface so the Phase 3 MCP server can wrap the same handlers without
// duplicating logic.
//
// Subcommands:
//   asset:generate <prop_id>    generate an asset (or resume one with --resume)
//   asset:list                  list generated assets in a target's dist/
//   target:list                 enumerate sibling repos with asset-foundry/ dirs
//   target:scaffold <name>      scaffold a new <path>/<name>/asset-foundry/
//   run:list                    list recent runs from the state DB
//   run:status <run_id>         show one run's details
//   run:resume <run_id>         resume a crashed or pending run
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { HumanMessage } from "@langchain/core/messages";
import { loadTarget, resolveTargetPath } from "../src/targets/loader";
import { buildGraph } from "../src/orchestrator/graph";
import { createStateStore, type RunStatus } from "../src/state/checkpointer";

const program = new Command();
program
  .name("foundry")
  .description("Asset-foundry platform CLI (ADR-0006/0007/0008).")
  .version("0.2.0");

// Core "generate or resume" logic shared by asset:generate and run:resume.
async function runGenerate(args: {
  propId?: string;
  targetPath?: string;
  resumeRunId?: string;
}): Promise<void> {
  const store = createStateStore();
  try {
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
      console.log(`▶ resuming run ${runId} (${propId} → ${target.targetRepoPath})`);
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
      console.log(`▶ run ${runId}: generating ${propId} (target: ${target.targetRepoPath})`);
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
      console.error(`✗ run ${runId}: rejected — ${reason}`);
      process.exit(1);
    }

    const glbPath = final.glbPath as string;
    store.runs.updateValidated(
      runId,
      glbPath,
      final.validation.triCount,
      final.validation.triBudget,
    );
    console.log(
      `✓ run ${runId}: ${glbPath} validated (${final.validation.triCount}/${final.validation.triBudget} tris)`,
    );

    if (existsSync(target.targetRepoPath)) {
      mkdirSync(target.publicAssetsDir, { recursive: true });
      const json = glbPath.replace(/\.glb$/, ".validation.json");
      copyFileSync(glbPath, join(target.publicAssetsDir, basename(glbPath)));
      copyFileSync(json, join(target.publicAssetsDir, basename(json)));
      console.log(`→ synced to ${target.publicAssetsDir}/`);
    }
  } finally {
    store.close();
  }
}

// ─── asset:generate ────────────────────────────────────────────────────────

program
  .command("asset:generate")
  .description("Generate an asset for a prop in the target's manifest.")
  .argument("<prop_id>")
  .option("-t, --target <path>", "consumer game repo path (or set $FOUNDRY_TARGET)")
  .option("--resume <run_id>", "resume a crashed run instead of starting fresh")
  .action(async (propId: string, opts: { target?: string; resume?: string }) => {
    await runGenerate({ propId, targetPath: opts.target, resumeRunId: opts.resume });
  });

// ─── asset:list ────────────────────────────────────────────────────────────

program
  .command("asset:list")
  .description("List generated assets in a target's dist/ directory.")
  .option("-t, --target <path>", "consumer game repo path")
  .action((opts: { target?: string }) => {
    const target = loadTarget(opts.target);
    if (!existsSync(target.outputDir)) {
      console.log(`(no dist/ at ${target.outputDir} — nothing generated yet)`);
      return;
    }
    const reports = readdirSync(target.outputDir).filter((f) => f.endsWith(".validation.json"));
    if (reports.length === 0) {
      console.log("(no .validation.json files)");
      return;
    }
    console.log(`assets in ${target.outputDir}:`);
    for (const r of reports.sort()) {
      const data = JSON.parse(readFileSync(join(target.outputDir, r), "utf8"));
      const status = data.status === "validated" ? "✓" : "✗";
      console.log(
        `  ${status}  ${data.asset_id.padEnd(28)}  ${data.tri_count}/${data.tri_budget} tris  ${data.status}`,
      );
    }
  });

// ─── target:list ───────────────────────────────────────────────────────────

program
  .command("target:list")
  .description("Enumerate sibling repos that look like targets (have an asset-foundry/ dir).")
  .option("--root <path>", "directory to scan for siblings (default: parent of cwd)")
  .action((opts: { root?: string }) => {
    const root = resolve(opts.root ?? join(process.cwd(), ".."));
    if (!existsSync(root)) {
      console.error(`✗ scan root not found: ${root}`);
      process.exit(1);
    }
    const found: string[] = [];
    for (const e of readdirSync(root)) {
      const p = join(root, e);
      try {
        if (!statSync(p).isDirectory()) continue;
      } catch {
        continue;
      }
      if (existsSync(join(p, "asset-foundry", "world.yaml"))) found.push(p);
    }
    if (found.length === 0) {
      console.log(`(no targets found under ${root})`);
      return;
    }
    console.log(`targets under ${root}:`);
    for (const p of found.sort()) {
      try {
        const t = loadTarget(p);
        console.log(`  ${p}  (${t.manifest.props.length} props, ${t.manifest.biomes.length} biomes)`);
      } catch (err) {
        console.log(`  ${p}  (invalid: ${err instanceof Error ? err.message : err})`);
      }
    }
  });

// ─── target:scaffold ───────────────────────────────────────────────────────

program
  .command("target:scaffold")
  .description("Scaffold a new <path>/asset-foundry/ from templates/.")
  .argument("<name>", "target name (becomes the directory name when --path is omitted)")
  .option("-p, --path <path>", "absolute or relative directory to scaffold into (default: ../<name>)")
  .action((name: string, opts: { path?: string }) => {
    const repoRoot = process.cwd();
    const targetRoot = resolve(opts.path ?? join(repoRoot, "..", name));
    const dest = join(targetRoot, "asset-foundry");
    if (existsSync(dest)) {
      console.error(`✗ refuse to overwrite existing ${dest}`);
      process.exit(1);
    }
    const templatesDir = join(repoRoot, "templates", "asset-foundry");
    if (!existsSync(templatesDir)) {
      console.error(`✗ templates/ missing at ${templatesDir}`);
      process.exit(1);
    }
    mkdirSync(join(dest, "fixtures"), { recursive: true });
    // Substitute the literal token __TARGET_NAME__ in template files.
    const subst = (s: string) => s.replaceAll("__TARGET_NAME__", name);
    for (const f of ["world.yaml", "palettes.yaml"]) {
      const src = join(templatesDir, f);
      writeFileSync(join(dest, f), subst(readFileSync(src, "utf8")));
    }
    for (const f of readdirSync(join(templatesDir, "fixtures"))) {
      copyFileSync(join(templatesDir, "fixtures", f), join(dest, "fixtures", f));
    }
    console.log(`✓ scaffolded ${dest}`);
    console.log(`  next: edit ${join(dest, "world.yaml")} and add real props`);
    console.log(`  then: pnpm foundry asset:generate <prop_id> --target ${targetRoot}`);
  });

// ─── run:list ──────────────────────────────────────────────────────────────

program
  .command("run:list")
  .description("List recent runs from the state DB.")
  .option("-t, --target <path>", "filter by target path (resolved to absolute)")
  .option("-s, --status <status>", "filter by status (pending|validated|rejected)")
  .option("-l, --limit <n>", "limit rows (default 20)", "20")
  .action((opts: { target?: string; status?: string; limit?: string }) => {
    const store = createStateStore();
    try {
      const targetPath = opts.target ? resolveTargetPath(opts.target) : undefined;
      const rows = store.runs.list({
        target: targetPath,
        status: opts.status as RunStatus | undefined,
        limit: parseInt(opts.limit ?? "20", 10),
      });
      if (rows.length === 0) {
        console.log("(no runs)");
        return;
      }
      for (const r of rows) {
        const tris = r.tri_count != null ? `${r.tri_count}/${r.tri_budget}` : "—";
        console.log(
          `${r.run_id}  ${r.status.padEnd(10)}  ${r.prop_id.padEnd(20)}  ${tris.padEnd(10)}  ${r.started_at}  ${r.target_path}`,
        );
      }
    } finally {
      store.close();
    }
  });

// ─── run:status ────────────────────────────────────────────────────────────

program
  .command("run:status")
  .description("Show details for one run, including the latest checkpoint's currentNode.")
  .argument("<run_id>")
  .action(async (runId: string) => {
    const store = createStateStore();
    try {
      const row = store.runs.get(runId);
      if (!row) {
        console.error(`✗ run ${runId} not found in ${store.dbPath}`);
        process.exit(1);
      }
      console.log(`run_id:      ${row.run_id}`);
      console.log(`status:      ${row.status}`);
      console.log(`target:      ${row.target_path}`);
      console.log(`prop_id:     ${row.prop_id}`);
      console.log(`started_at:  ${row.started_at}`);
      if (row.ended_at) console.log(`ended_at:    ${row.ended_at}`);
      if (row.tri_count != null) console.log(`tris:        ${row.tri_count}/${row.tri_budget}`);
      if (row.glb_path) console.log(`glb_path:    ${row.glb_path}`);
      if (row.rejection) console.log(`rejection:   ${row.rejection}`);
      const tuple = await store.checkpointer.getTuple({ configurable: { thread_id: runId } });
      if (tuple) {
        const cv = tuple.checkpoint.channel_values as Record<string, unknown>;
        console.log(`last_node:   ${(cv["currentNode"] as string) ?? "?"}`);
        console.log(`last_ts:     ${tuple.config.configurable?.["thread_ts"] ?? "?"}`);
      } else {
        console.log("(no checkpoint yet)");
      }
    } finally {
      store.close();
    }
  });

// ─── run:resume ────────────────────────────────────────────────────────────

program
  .command("run:resume")
  .description("Re-invoke the graph for a run from its latest checkpoint.")
  .argument("<run_id>")
  .action(async (runId: string) => {
    await runGenerate({ resumeRunId: runId });
  });

await program.parseAsync(process.argv);
