import { describe, it, expect } from "vitest";
import { extractFencedPython, extractSummaryJson } from "./parsing";

describe("extractFencedPython", () => {
  it("returns the inner block when fenced with python tag", () => {
    const reply = "Here is the script:\n```python\nimport bpy\nbpy.ops.foo()\n```\nDone.";
    expect(extractFencedPython(reply)).toBe("import bpy\nbpy.ops.foo()");
  });

  it("returns the inner block when fenced with py tag", () => {
    const reply = "```py\nimport bpy\nx = 1\n```";
    expect(extractFencedPython(reply)).toBe("import bpy\nx = 1");
  });

  it("returns the inner block when fenced with no language tag", () => {
    const reply = "```\nimport bpy\n```";
    expect(extractFencedPython(reply)).toBe("import bpy");
  });

  it("returns the FIRST fenced block when multiple fences are present", () => {
    // Documenting current behaviour — the regex `m` flag with non-greedy
    // capture grabs the first match.
    const reply = "```python\nimport bpy\nfirst()\n```\nThen:\n```python\nsecond()\n```";
    expect(extractFencedPython(reply)).toBe("import bpy\nfirst()");
  });

  it("falls back to whole text when no fence but bpy import present", () => {
    const reply = "import bpy\nbpy.ops.export_scene.gltf(filepath='out.glb')";
    expect(extractFencedPython(reply)).toBe(reply);
  });

  it("falls back to whole text when no fence but bpy.ops present", () => {
    const reply = "bpy.ops.wm.read_factory_settings(use_empty=True)";
    expect(extractFencedPython(reply)).toBe(reply);
  });

  it("trims surrounding whitespace from the fenced block", () => {
    const reply = "```python\n\n  import bpy  \n\n```";
    expect(extractFencedPython(reply)).toBe("import bpy");
  });

  it("throws a structured error when no fence and no bpy markers", () => {
    expect(() => extractFencedPython("Sorry I cannot help with that.")).toThrow(
      /AssetSculptor reply did not contain a python script/
    );
  });

  it("throws on empty input", () => {
    expect(() => extractFencedPython("")).toThrow(/python script/);
  });
});

describe("extractSummaryJson", () => {
  const valid = `FOUNDRY_SUMMARY {"asset_id":"birch_sapling","tri_count":80,"bounding_box":{"min":[0,0,0],"max":[1,1,1]},"material_slots":[]}`;

  it("parses a single FOUNDRY_SUMMARY line in stdout", () => {
    const result = extractSummaryJson(valid) as Record<string, unknown>;
    expect(result.asset_id).toBe("birch_sapling");
    expect(result.tri_count).toBe(80);
    expect(result.material_slots).toEqual([]);
  });

  it("parses when the summary line is buried in chatty stdout", () => {
    const stdout =
      `Blender 4.0.2 starting...\n` +
      `INFO: Reading factory settings\n` +
      `${valid}\n` +
      `Blender quit\n`;
    const result = extractSummaryJson(stdout) as Record<string, unknown>;
    expect(result.asset_id).toBe("birch_sapling");
  });

  it("returns the FIRST FOUNDRY_SUMMARY when multiple lines exist", () => {
    const stdout =
      `FOUNDRY_SUMMARY {"asset_id":"first","tri_count":1,"bounding_box":{"min":[0,0,0],"max":[0,0,0]},"material_slots":[]}\n` +
      `FOUNDRY_SUMMARY {"asset_id":"second","tri_count":2,"bounding_box":{"min":[0,0,0],"max":[0,0,0]},"material_slots":[]}`;
    const result = extractSummaryJson(stdout) as Record<string, unknown>;
    expect(result.asset_id).toBe("first");
  });

  it("falls back to a JSON_LINE_FALLBACK match when no FOUNDRY_SUMMARY prefix is present", () => {
    // Legacy / partial output: a JSON object with asset_id but no prefix.
    const stdout = `{"asset_id":"legacy","tri_count":42,"material_slots":[]}`;
    const result = extractSummaryJson(stdout) as Record<string, unknown>;
    expect(result.asset_id).toBe("legacy");
    expect(result.tri_count).toBe(42);
  });

  it("parses unicode in field values", () => {
    const stdout = `FOUNDRY_SUMMARY {"asset_id":"树","tri_count":1,"bounding_box":{"min":[0,0,0],"max":[0,0,0]},"material_slots":["木"]}`;
    const result = extractSummaryJson(stdout) as Record<string, unknown>;
    expect(result.asset_id).toBe("树");
    expect((result.material_slots as string[])[0]).toBe("木");
  });

  it("parses tri_count: 0 (validator gates this; parser stays charitable)", () => {
    const stdout = `FOUNDRY_SUMMARY {"asset_id":"empty","tri_count":0,"bounding_box":{"min":[0,0,0],"max":[0,0,0]},"material_slots":[]}`;
    const result = extractSummaryJson(stdout) as Record<string, unknown>;
    expect(result.tri_count).toBe(0);
  });

  it("throws a structured error when no summary line is present, including the stdout", () => {
    const stdout = "Blender 4.0.2 quit without producing output.";
    expect(() => extractSummaryJson(stdout)).toThrow(/missing JSON summary line/);
    expect(() => extractSummaryJson(stdout)).toThrow(/Blender 4.0.2 quit/);
  });

  it("throws a SyntaxError when the JSON is malformed", () => {
    const stdout = `FOUNDRY_SUMMARY {asset_id: "no quotes"}`;
    expect(() => extractSummaryJson(stdout)).toThrow(SyntaxError);
  });
});
