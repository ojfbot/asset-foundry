import { describe, it, expect } from "vitest";
import { WorldManifestSchema } from "./schema";
import { loadTarget } from "../src/targets/loader";

describe("WorldManifestSchema", () => {
  it("parses the committed test-fixtures target via loadTarget (integration check)", () => {
    // Self-contained test target — checked into this repo so CI can validate the
    // schema + loader without depending on any consumer game's checkout.
    // foundry-agnostic-disable-next-line: test-fixtures/ is a contract artefact, not platform code
    const target = loadTarget("./test-fixtures");
    const m = target.manifest;
    expect(m.version).toBe(1);
    expect(m.props).toHaveLength(1);
    expect(m.props[0]!.tri_budget).toBe(12);
    expect(target.palettes["debug_grey"]).toBe("#888888");
  });

  it("rejects a prop referencing an unknown biome", () => {
    expect(() =>
      WorldManifestSchema.parse({
        version: 1,
        biomes: [{ id: "real", palette: ["c"], fog: { color: "#ffffff", density: 0 }, ambient_props: [] }],
        palettes: { c: { hex: "#000000", role: "neutral" } },
        props: [{
          id: "thing",
          category: "vegetation",
          tri_budget: 100,
          variants: 1,
          biomes: ["nope"],
          style_anchors: ["x"],
          materials: [],
          interaction: "none",
        }],
        characters: [],
      })
    ).toThrow(/biome/);
  });

  it("rejects a biome palette colour not in palettes/", () => {
    expect(() =>
      WorldManifestSchema.parse({
        version: 1,
        biomes: [{ id: "b", palette: ["missing"], fog: { color: "#ffffff", density: 0 }, ambient_props: [] }],
        palettes: { other: { hex: "#000000", role: "neutral" } },
        props: [],
        characters: [],
      })
    ).toThrow(/palette/);
  });

  it("rejects a non-snake_case prop id", () => {
    const result = WorldManifestSchema.safeParse({
      version: 1,
      biomes: [{ id: "b", palette: ["c"], fog: { color: "#ffffff", density: 0 }, ambient_props: [] }],
      palettes: { c: { hex: "#000000", role: "neutral" } },
      props: [{
        id: "BadName",
        category: "vegetation",
        tri_budget: 100,
        variants: 1,
        biomes: ["b"],
        style_anchors: ["x"],
        materials: [],
        interaction: "none",
      }],
      characters: [],
    });
    expect(result.success).toBe(false);
  });
});
