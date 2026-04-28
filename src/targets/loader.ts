// Target workspace loader (ADR-0006). Asset-foundry owns no game data; a "target"
// is a path to an external sibling repo that owns its own manifest, fixtures,
// palette hints, and asset output directory.
//
// Resolution order:
//   1. explicit `targetPath` argument
//   2. $FOUNDRY_TARGET environment variable
//   3. error — no implicit default. Phase 0's ../beaverGame fallback was dropped
//      in Phase 1 once a second target (carrier-pigeon) proved the abstraction.
//
// Layout convention (per target):
//   <target>/asset-foundry/world.yaml       ← Zod-validated manifest
//   <target>/asset-foundry/palettes.yaml    ← slot-name → hex hints (MaterialArtist)
//   <target>/asset-foundry/fixtures/        ← target-specific bpy fallbacks
//   <target>/asset-foundry/dist/            ← generation outputs (.glb + .validation.json)
//   <target>/asset-foundry/dist/scripts/    ← LLM-produced bpy + per-run temp files
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import yaml from "js-yaml";
import { WorldManifestSchema, type WorldManifest } from "../../manifest/schema";

export interface TargetContext {
  /** absolute path to <target>/asset-foundry/ */
  rootPath: string;
  /** absolute path to <target>/ — the consumer game repo */
  targetRepoPath: string;
  /** parsed + Zod-validated manifest */
  manifest: WorldManifest;
  /** absolute path to <target>/asset-foundry/world.yaml */
  manifestPath: string;
  /** absolute path to <target>/asset-foundry/fixtures/ */
  fixturesDir: string;
  /** absolute path to <target>/asset-foundry/dist/ — final .glb + .validation.json */
  outputDir: string;
  /** absolute path to <target>/asset-foundry/dist/scripts/ — LLM bpy + temp files */
  scriptsDir: string;
  /** slot-name → hex hints (MaterialArtist's deterministic Phase 0 mapping) */
  palettes: Record<string, string>;
  /** absolute path to <target>/public/assets/ — optional consumer-side sync target */
  publicAssetsDir: string;
}

export function resolveTargetPath(explicit?: string): string {
  const raw = explicit ?? process.env.FOUNDRY_TARGET;
  if (!raw) {
    throw new Error(
      "no target specified. Pass --target <path> or set $FOUNDRY_TARGET to a repo " +
        "containing an asset-foundry/ directory (per ADR-0006)."
    );
  }
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

export function loadTarget(targetPath?: string): TargetContext {
  const targetRepoPath = resolveTargetPath(targetPath);
  const rootPath = join(targetRepoPath, "asset-foundry");
  if (!existsSync(rootPath)) {
    throw new Error(
      `target not found: expected ${rootPath} to exist (per ADR-0006 layout). ` +
        `Set --target / $FOUNDRY_TARGET to a repo containing an asset-foundry/ directory.`
    );
  }

  const manifestPath = join(rootPath, "world.yaml");
  if (!existsSync(manifestPath)) {
    throw new Error(`target missing world.yaml: ${manifestPath}`);
  }
  const manifest = WorldManifestSchema.parse(yaml.load(readFileSync(manifestPath, "utf8")));

  const palettesPath = join(rootPath, "palettes.yaml");
  const palettes: Record<string, string> = existsSync(palettesPath)
    ? (yaml.load(readFileSync(palettesPath, "utf8")) as Record<string, string>) ?? {}
    : {};

  return {
    rootPath,
    targetRepoPath,
    manifest,
    manifestPath,
    fixturesDir: join(rootPath, "fixtures"),
    outputDir: join(rootPath, "dist"),
    scriptsDir: join(rootPath, "dist", "scripts"),
    palettes,
    publicAssetsDir: join(targetRepoPath, "public", "assets"),
  };
}
