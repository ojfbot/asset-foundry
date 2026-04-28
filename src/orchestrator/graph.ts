// LangGraph state machine that wires the four sub-agents and the deterministic
// Validator. Pattern adapted from cv-builder/packages/agent-graph (ADR-0005).
//
// Edges:
//   START → world_designer → asset_sculptor → material_artist → scene_assembler → validator → END
//
// Validator is deterministic TypeScript, not an LLM agent (ADR-0004).
//
// Optional checkpointer (ADR-0008): when provided, graph state is persisted at
// every node transition so a killed run can resume via `foundry run:resume`.
import { StateGraph, START, END } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { FoundryState } from "./state";
import { worldDesignerNode, type WorldDesignerOptions } from "./nodes/world-designer";
import { assetSculptorNode } from "./nodes/asset-sculptor";
import { materialArtistNode } from "./nodes/material-artist";
import { sceneAssemblerNode } from "./nodes/scene-assembler";
import { validatorNode } from "../validator";

export interface BuildGraphOptions extends WorldDesignerOptions {
  checkpointer?: BaseCheckpointSaver;
}

export function buildGraph(opts: BuildGraphOptions) {
  const g = new StateGraph(FoundryState)
    .addNode("world_designer", worldDesignerNode(opts))
    .addNode("asset_sculptor", assetSculptorNode)
    .addNode("material_artist", materialArtistNode)
    .addNode("scene_assembler", sceneAssemblerNode)
    .addNode("validator", validatorNode)
    .addEdge(START, "world_designer")
    .addEdge("world_designer", "asset_sculptor")
    .addEdge("asset_sculptor", "material_artist")
    .addEdge("material_artist", "scene_assembler")
    .addEdge("scene_assembler", "validator")
    .addEdge("validator", END);
  return opts.checkpointer ? g.compile({ checkpointer: opts.checkpointer }) : g.compile();
}
