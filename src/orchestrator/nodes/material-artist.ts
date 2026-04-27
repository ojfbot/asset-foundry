// MaterialArtist — applies the biome palette to sculpted asset's material slots.
// For Phase 0 we deterministically map prop.materials → palette colours from the
// manifest. The LLM-driven texture-pull-from-Poly-Haven path is Phase 2+.
import { AIMessage } from "@langchain/core/messages";
import type { FoundryStateType, FoundryUpdate, MaterialPlan } from "../state";

const SLOT_COLOR_HINTS: Record<string, string> = {
  bark_white: "#e9e6df",
  bark_dark: "#3a2f25",
  leaf_green: "#4a8a4a",
  leaf_gold: "#d8a64f",
  stone_grey: "#8a8a8c",
};

export async function materialArtistNode(state: FoundryStateType): Promise<FoundryUpdate> {
  const prop = state.targetProp;
  if (!prop) throw new Error("MaterialArtist: state.targetProp is null");
  const plans: MaterialPlan[] = prop.materials.map((slot) => ({
    slotName: slot,
    hex: SLOT_COLOR_HINTS[slot] ?? "#888888",
    unlit: true,
  }));
  return {
    materials: plans,
    currentNode: "material_artist",
    messages: [
      new AIMessage(`MaterialArtist planned ${plans.length} unlit slot(s): ${plans.map((p) => p.slotName).join(", ")}`),
    ],
  };
}
