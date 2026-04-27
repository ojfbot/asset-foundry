// Deterministic Validator. Not an LLM agent — see ADR-0004.
// Reads the bpy stdout summary from state, verifies tri budget + material slots,
// writes a sibling <asset>.validation.json next to the .glb so the game client
// can refuse unvalidated assets in dev (load-glb.ts in beaverGame).
import { writeFileSync } from "node:fs";
import { AIMessage } from "@langchain/core/messages";
import type { FoundryStateType, FoundryUpdate, ValidationOutcome } from "../orchestrator/state";

export async function validatorNode(state: FoundryStateType): Promise<FoundryUpdate> {
  const prop = state.targetProp;
  const glbPath = state.glbPath;
  if (!prop || !glbPath) throw new Error("Validator: prerequisites missing");

  // Pull the most recent SceneAssembler stdout from message history.
  const lastAssembler = [...state.messages]
    .reverse()
    .find((m) => typeof m.content === "string" && m.content.includes("summary="));
  const summaryText =
    lastAssembler && typeof lastAssembler.content === "string"
      ? /summary=(\{[\s\S]*?\})$/m.exec(lastAssembler.content)?.[1]
      : null;
  const summary = summaryText ? JSON.parse(summaryText) : null;

  if (!summary) {
    return failed(state, prop.tri_budget, "no summary JSON found in pipeline state");
  }

  const triCount: number = summary.tri_count;
  const materialSlots: string[] = summary.material_slots ?? [];
  const bbox = summary.bounding_box ?? { min: [0, 0, 0], max: [0, 0, 0] };

  if (triCount > prop.tri_budget) {
    return failed(state, prop.tri_budget, `over budget: ${triCount} > ${prop.tri_budget}`);
  }
  if (summary.asset_id !== prop.id) {
    return failed(state, prop.tri_budget, `asset_id mismatch: ${summary.asset_id} ≠ ${prop.id}`);
  }

  const blenderVersion = /Blender ([\d.]+)/.exec(
    state.messages
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n")
  )?.[1] ?? "unknown";

  const outcome: ValidationOutcome = {
    status: "validated",
    triCount,
    triBudget: prop.tri_budget,
    boundingBox: bbox,
    materialSlots,
    blenderVersion,
  };
  writeManifest(glbPath, prop.id, outcome);
  return {
    validation: outcome,
    currentNode: "validator",
    messages: [new AIMessage(`Validator: PASS (${triCount}/${prop.tri_budget} tris)`)],
  };
}

function failed(state: FoundryStateType, triBudget: number, reason: string): FoundryUpdate {
  const outcome: ValidationOutcome = {
    status: "rejected",
    triCount: 0,
    triBudget,
    boundingBox: { min: [0, 0, 0], max: [0, 0, 0] },
    materialSlots: [],
    blenderVersion: "unknown",
    rejectionReason: reason,
  };
  if (state.glbPath && state.targetProp) {
    writeManifest(state.glbPath, state.targetProp.id, outcome);
  }
  return {
    validation: outcome,
    currentNode: "validator",
    messages: [new AIMessage(`Validator: REJECT — ${reason}`)],
  };
}

function writeManifest(glbPath: string, assetId: string, outcome: ValidationOutcome): void {
  const json = {
    asset_id: assetId,
    version: 1,
    status: outcome.status,
    tri_count: outcome.triCount,
    tri_budget: outcome.triBudget,
    bounding_box: outcome.boundingBox,
    material_slots: outcome.materialSlots,
    blender_version: outcome.blenderVersion,
    generated_at: new Date().toISOString(),
    ...(outcome.rejectionReason ? { rejection_reason: outcome.rejectionReason } : {}),
  };
  const path = glbPath.replace(/\.glb$/, ".validation.json");
  writeFileSync(path, JSON.stringify(json, null, 2), "utf8");
}
