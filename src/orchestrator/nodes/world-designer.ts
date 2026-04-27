// WorldDesigner — the only sub-agent that may write to manifest/world.yaml.
// For Phase 0 the manifest is hand-authored; this node simply selects the
// requested prop entry and populates state. Real LLM-driven manifest editing
// arrives in Phase 2 once the contract surface is exercised.
import { AIMessage } from "@langchain/core/messages";
import type { FoundryStateType, FoundryUpdate } from "../state";
import { findProp } from "../../../manifest/load";

export interface WorldDesignerOptions {
  propId: string;
}

export function worldDesignerNode(opts: WorldDesignerOptions) {
  return async (state: FoundryStateType): Promise<FoundryUpdate> => {
    if (!state.manifest) throw new Error("WorldDesigner: manifest not loaded");
    const prop = findProp(state.manifest, opts.propId);
    return {
      targetProp: prop,
      currentNode: "world_designer",
      messages: [new AIMessage(`WorldDesigner selected ${prop.id} (${prop.category})`)],
    };
  };
}
