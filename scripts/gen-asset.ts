// CLI: pnpm gen-asset <prop_id>
// Loads the world manifest, builds the LangGraph, runs it, copies the validated
// .glb (and its sibling .validation.json) into beaverGame/public/assets/.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { HumanMessage } from "@langchain/core/messages";
import { loadManifest } from "../manifest/load";
import { buildGraph } from "../src/orchestrator/graph";

const propId = process.argv[2];
if (!propId) {
  console.error("usage: pnpm gen-asset <prop_id>   (e.g. birch_sapling)");
  process.exit(2);
}

const manifest = loadManifest();
const graph = buildGraph({ propId });

const initial = {
  manifest,
  messages: [new HumanMessage(`generate ${propId}`)],
  currentNode: "start",
};

console.log(`▶ generating ${propId} via foundry pipeline …`);
const final = await graph.invoke(initial);

if (final.validation?.status !== "validated") {
  console.error("✗ pipeline rejected the asset:", final.validation?.rejectionReason);
  process.exit(1);
}

console.log(`✓ ${final.glbPath} validated (${final.validation.triCount}/${final.validation.triBudget} tris)`);

// Sync into the game client's public assets dir (per ADR-0007).
const targetDir = resolve(process.cwd(), "..", "beaverGame", "public", "assets");
if (existsSync(dirname(targetDir))) {
  mkdirSync(targetDir, { recursive: true });
  const glb = final.glbPath!;
  const json = glb.replace(/\.glb$/, ".validation.json");
  copyFileSync(glb, join(targetDir, glb.split("/").pop()!));
  copyFileSync(json, join(targetDir, json.split("/").pop()!));
  console.log(`→ synced to ${targetDir}/`);
}
