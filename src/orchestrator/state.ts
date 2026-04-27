// State schema for the asset-pipeline orchestrator.
// Pattern adapted from cv-builder/packages/agent-graph/src/state/schema.ts
// (Annotation.Root + reducers). See ADR-0005.
import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import type { Prop, WorldManifest } from "../../manifest/schema";

function messagesReducer(
  state: BaseMessage[] | undefined,
  update: BaseMessage[] | BaseMessage
): BaseMessage[] {
  const existing = state ?? [];
  const next = Array.isArray(update) ? update : [update];
  return existing.concat(next);
}

export interface SculptResult {
  bpyScript: string;
  generatedAt: string;
  modelId: string;
}

export interface MaterialPlan {
  slotName: string;
  hex: string;
  unlit: boolean;
}

export interface ValidationOutcome {
  status: "validated" | "rejected" | "pending";
  triCount: number;
  triBudget: number;
  boundingBox: { min: [number, number, number]; max: [number, number, number] };
  materialSlots: string[];
  blenderVersion: string;
  rejectionReason?: string;
}

export const FoundryState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: messagesReducer }),
  manifest: Annotation<WorldManifest | null>(),
  targetProp: Annotation<Prop | null>(),
  sculpt: Annotation<SculptResult | null>(),
  materials: Annotation<MaterialPlan[] | null>(),
  glbPath: Annotation<string | null>(),
  validation: Annotation<ValidationOutcome | null>(),
  currentNode: Annotation<string>(),
});

export type FoundryStateType = typeof FoundryState.State;
export type FoundryUpdate = Partial<FoundryStateType>;
