// MaterialArtist — applies the biome palette to sculpted asset's material slots.
// For Phase 0 we deterministically map prop.materials → slot-palette hints loaded
// from the target's `palettes.yaml` (see ADR-0006 / ADR-0007). Slots without a hint
// fall back to #888888. The LLM-driven texture-pull-from-Poly-Haven path is Phase 2+.
import { AIMessage } from "@langchain/core/messages";
import type { FoundryStateType, FoundryUpdate, MaterialPlan } from "../state";

export async function materialArtistNode(state: FoundryStateType): Promise<FoundryUpdate> {
  const prop = state.targetProp;
  if (!prop) throw new Error("MaterialArtist: state.targetProp is null");
  if (!state.target) throw new Error("MaterialArtist: state.target is null");
  const hints = state.target.palettes;
  const plans: MaterialPlan[] = prop.materials.map((slot) => ({
    slotName: slot,
    hex: hints[slot] ?? "#888888",
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
