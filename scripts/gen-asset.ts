// CLI: pnpm gen-asset <prop_id> [--target <path>]
//
// Resolves a target (ADR-0006: external sibling repo with an asset-foundry/ dir),
// loads its manifest + palettes + fixtures, runs the LangGraph, writes outputs
// into <target>/asset-foundry/dist/, then syncs the .glb + .validation.json into
// <target>/public/assets/ for the consumer game to load.
//
// Phase 0: when no --target / $FOUNDRY_TARGET is provided, falls back to ../beaverGame.
// Phase 1 drops the fallback once a second target proves the abstraction.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { HumanMessage } from "@langchain/core/messages";
import { loadTarget } from "../src/targets/loader";
import { buildGraph } from "../src/orchestrator/graph";

const argv = process.argv.slice(2);
let propId: string | undefined;
let targetPath: string | undefined;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (a === "--target") {
    targetPath = argv[++i];
  } else if (!a.startsWith("-") && !propId) {
    propId = a;
  }
}

if (!propId) {
  console.error("usage: pnpm gen-asset <prop_id> [--target <path>]");
  console.error("       prop_id must match a prop entry in <target>/asset-foundry/world.yaml");
  process.exit(2);
}

const target = loadTarget(targetPath);
const graph = buildGraph({ propId });

const initial = {
  target,
  manifest: target.manifest,
  messages: [new HumanMessage(`generate ${propId}`)],
  currentNode: "start",
};

console.log(`▶ generating ${propId} via foundry pipeline (target: ${target.targetRepoPath}) …`);
const final = await graph.invoke(initial);

if (final.validation?.status !== "validated") {
  console.error("✗ pipeline rejected the asset:", final.validation?.rejectionReason);
  process.exit(1);
}

console.log(`✓ ${final.glbPath} validated (${final.validation.triCount}/${final.validation.triBudget} tris)`);

// Sync into the consumer game's public assets dir.
if (existsSync(target.targetRepoPath)) {
  mkdirSync(target.publicAssetsDir, { recursive: true });
  const glb = final.glbPath!;
  const json = glb.replace(/\.glb$/, ".validation.json");
  copyFileSync(glb, join(target.publicAssetsDir, basename(glb)));
  copyFileSync(json, join(target.publicAssetsDir, basename(json)));
  console.log(`→ synced to ${target.publicAssetsDir}/`);
}
