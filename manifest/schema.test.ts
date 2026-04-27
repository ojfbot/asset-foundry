import { describe, it, expect } from "vitest";
import { WorldManifestSchema } from "./schema";
import { loadManifest } from "./load";

describe("WorldManifestSchema", () => {
  it("parses the committed world.yaml", () => {
    const m = loadManifest();
    expect(m.version).toBe(1);
    expect(m.props.find((p) => p.id === "birch_sapling")?.tri_budget).toBe(600);
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
