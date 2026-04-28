// AssetSculptor — reads one prop entry, produces a Blender Python script.
// Tool surface: Anthropic API + write to <target>/asset-foundry/dist/scripts/.
// Forbidden: writing to manifest, picking final material colours, scene assembly.
// See decisions/adr/0004-narrow-subagent-boundaries.md.
//
// Offline fallback: when ANTHROPIC_API_KEY is unset and `<target>/asset-foundry/
// fixtures/<prop_id>.py` exists, the script is sourced from disk. This lets CI
// exercise the full pipeline without an API key. The runtime contract on the bpy
// script is identical either way.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AIMessage } from "@langchain/core/messages";
import type { FoundryStateType, FoundryUpdate, SculptResult } from "../state";
import { callClaude } from "../llm";
import { extractFencedPython } from "../parsing";

const SYSTEM_PROMPT = `You are AssetSculptor, a Blender Python (bpy) expert who produces
geometry for stylized low-poly game assets.

Hard contract — every script you emit must:
1. Open with a deterministic seed (\`random.seed(prop_id_hash)\`).
2. Operate on a fresh empty scene: \`bpy.ops.wm.read_factory_settings(use_empty=True)\`.
3. Produce exactly one named root Empty (or Mesh) object whose name is the prop_id.
4. Stay at or under the tri_budget. Use mesh.calc_loop_triangles() to verify.
5. End with \`bpy.ops.export_scene.gltf(filepath=OUT_PATH, ...)\` where OUT_PATH is
   read from \`sys.argv\` (after \`--\` separator).
6. Print a single line to stdout in EXACTLY this form (the literal prefix matters):
   FOUNDRY_SUMMARY {"asset_id": str, "tri_count": int, "bounding_box": {"min":[x,y,z],"max":[x,y,z]}, "material_slots": [str]}

Stylization constraints:
- Flat-shaded silhouette. No subdivision surfaces. No bevels above 0.02 units.
- Vertex colors only — no UV-texture sampling. Material slots stay empty (the
  MaterialArtist sub-agent fills them later).
- Style anchors are ABSOLUTE. If asked for a "firewatch_silhouette" tree, the trunk
  is a single tapered cylinder, foliage is 3-5 broad triangular planes.

Output exactly one Python code block in your response, nothing else. No commentary.`;

const userPromptFor = (state: FoundryStateType): string => {
  const p = state.targetProp;
  if (!p) throw new Error("AssetSculptor: state.targetProp is null");
  return `Generate a bpy script for this prop:

prop_id: ${p.id}
category: ${p.category}
tri_budget: ${p.tri_budget}  (HARD MAX)
style_anchors: ${p.style_anchors.join(", ")}
material_slots_to_create: ${p.materials.join(", ") || "(none)"}

Remember: deterministic seed (use hash("${p.id}") & 0xffff), fresh scene, named root,
JSON summary to stdout, glTF export to OUT_PATH from sys.argv.`;
};

export async function assetSculptorNode(state: FoundryStateType): Promise<FoundryUpdate> {
  const prop = state.targetProp;
  if (!prop) throw new Error("AssetSculptor: state.targetProp is null");
  if (!state.target) throw new Error("AssetSculptor: state.target is null");

  const outDir = state.target.scriptsDir;
  mkdirSync(outDir, { recursive: true });

  let modelId = "claude-sonnet-4-6";
  const fixturePath = join(state.target.fixturesDir, `${prop.id}.py`);
  const offline = !process.env.ANTHROPIC_API_KEY;

  // Where Blender will actually run the script from. In offline mode we keep
  // the fixture in place so its `_lib.py` sibling stays importable; in live
  // mode we write the LLM's output into dist/scripts/.
  let scriptPath: string;

  if (offline && existsSync(fixturePath)) {
    scriptPath = fixturePath;
    modelId = "fixture";
    console.log(`  AssetSculptor: offline mode, using ${fixturePath}`);
  } else if (offline) {
    throw new Error(
      `AssetSculptor: ANTHROPIC_API_KEY unset and no fixture at ${fixturePath}. ` +
        `Set the env var or add a fixture (see fixtures/birch_sapling.py for the contract).`
    );
  } else {
    const text = await callClaude({ system: SYSTEM_PROMPT, user: userPromptFor(state) });
    const bpy = extractFencedPython(text);
    scriptPath = join(outDir, `${prop.id}_v1.py`);
    writeFileSync(scriptPath, bpy, "utf8");
  }

  const sculpt: SculptResult = {
    bpyScript: scriptPath,
    generatedAt: new Date().toISOString(),
    modelId,
  };
  return {
    sculpt,
    currentNode: "asset_sculptor",
    messages: [new AIMessage(`AssetSculptor produced ${scriptPath} (model=${modelId})`)],
  };
}
