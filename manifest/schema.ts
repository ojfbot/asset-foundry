import { z } from "zod";

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be #rrggbb");

export const PaletteSchema = z.object({
  hex: HexColor,
  role: z.enum(["foliage", "highlight", "shadow", "neutral", "accent"]),
});

export const BiomeSchema = z.object({
  id: z.string().min(1),
  palette: z.array(z.string().min(1)).min(1),
  fog: z.object({ color: HexColor, density: z.number().min(0).max(1) }),
  ambient_props: z.array(z.string()).default([]),
});

export const PropSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/, "snake_case"),
  category: z.enum([
    "vegetation",
    "building",
    "rock",
    "water",
    "decoration",
    "terrain",
    "character",
    "sky",
  ]),
  tri_budget: z.number().int().positive(),
  variants: z.number().int().min(1).default(1),
  biomes: z.array(z.string()).min(1),
  style_anchors: z.array(z.string()).min(1),
  materials: z.array(z.string()).default([]),
  interaction: z.enum(["none", "stackable", "carryable", "edible"]).default("none"),
});

export const CharacterSchema = z.object({
  id: z.string().min(1),
  rig: z.string().min(1),
  states: z.array(z.string()).min(1),
});

export const WorldManifestSchema = z.object({
  version: z.literal(1),
  biomes: z.array(BiomeSchema),
  palettes: z.record(PaletteSchema),
  props: z.array(PropSchema),
  characters: z.array(CharacterSchema).default([]),
}).refine(
  (m) => m.props.every((p) => p.biomes.every((b) => m.biomes.find((x) => x.id === b))),
  { message: "every prop must reference a defined biome" },
).refine(
  (m) => m.biomes.every((b) => b.palette.every((c) => m.palettes[c])),
  { message: "every biome palette colour must be defined in palettes/" },
);

export type WorldManifest = z.infer<typeof WorldManifestSchema>;
export type Prop = z.infer<typeof PropSchema>;
export type Biome = z.infer<typeof BiomeSchema>;
