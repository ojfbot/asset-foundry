// SceneAssembler — invokes Blender to run the AssetSculptor's bpy script,
// applies the MaterialArtist's palette as a small post-script, and exports the .glb.
// For Phase 0 we collapse "execute the bpy" and "export glTF" into one Blender run
// because the script's last line is already an export call.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { AIMessage } from "@langchain/core/messages";
import type { FoundryStateType, FoundryUpdate } from "../state";
import { runBlenderScript } from "../../blender/mcp-bridge";
import { extractSummaryJson } from "../parsing";

export async function sceneAssemblerNode(state: FoundryStateType): Promise<FoundryUpdate> {
  const sculpt = state.sculpt;
  const prop = state.targetProp;
  if (!sculpt || !prop) throw new Error("SceneAssembler: prerequisites missing");

  const distDir = join(process.cwd(), "dist");
  mkdirSync(distDir, { recursive: true });
  const glbPath = join(distDir, `${prop.id}_v1.glb`);

  const result = await runBlenderScript({
    scriptPath: sculpt.bpyScript,
    outPath: glbPath,
    materials: state.materials ?? [],
  });

  // Validate that the bpy script honoured the contract.
  const summary = extractSummaryJson(result.stdout);

  return {
    glbPath,
    currentNode: "scene_assembler",
    messages: [
      new AIMessage(
        `SceneAssembler exported ${glbPath} via Blender ${result.blenderVersion}. summary=${JSON.stringify(summary)}`
      ),
    ],
  };
}
