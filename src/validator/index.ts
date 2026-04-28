// Deterministic Validator. Not an LLM agent — see ADR-0004.
// Reads the bpy stdout summary from state, gates against the manifest entry,
// writes a sibling <asset>.validation.json next to the .glb so the game client
// can refuse unvalidated assets in dev (load-glb.ts in beaverGame).
//
// `gateValidation` is the pure decision function — no I/O, no state lookup,
// just (summary, prop, blenderVersion) → outcome. Exhaustively tested in
// validator/index.test.ts. The async node wrapper handles the impure parts
// (extracting summary from message history, writing the JSON file).
import { writeFileSync } from "node:fs";
import { AIMessage } from "@langchain/core/messages";
import type { Prop } from "../../manifest/schema";
import type { FoundryStateType, FoundryUpdate, ValidationOutcome } from "../orchestrator/state";

const ZERO_BBOX = { min: [0, 0, 0] as [number, number, number], max: [0, 0, 0] as [number, number, number] };

export interface SummaryShape {
  asset_id?: unknown;
  tri_count?: unknown;
  material_slots?: unknown;
  bounding_box?: unknown;
}

// Pure: takes a parsed summary blob, the manifest prop entry, and a Blender
// version string. Returns the outcome that the validator records. Does not
// touch the filesystem and does not read FoundryState.
export function gateValidation(
  summary: SummaryShape | null | undefined,
  prop: Prop,
  blenderVersion: string
): ValidationOutcome {
  const reject = (reason: string): ValidationOutcome => ({
    status: "rejected",
    triCount: 0,
    triBudget: prop.tri_budget,
    boundingBox: ZERO_BBOX,
    materialSlots: [],
    blenderVersion,
    rejectionReason: reason,
  });

  if (summary === null || summary === undefined) {
    return reject("no summary JSON found in pipeline state");
  }

  const triCount = typeof summary.tri_count === "number" ? summary.tri_count : NaN;
  const materialSlots = Array.isArray(summary.material_slots) ? (summary.material_slots as string[]) : [];
  const bbox = isValidBbox(summary.bounding_box) ? summary.bounding_box : ZERO_BBOX;

  if (!Number.isFinite(triCount)) {
    return reject(`invalid tri_count: ${summary.tri_count}`);
  }
  if (triCount > prop.tri_budget) {
    return reject(`over budget: ${triCount} > ${prop.tri_budget}`);
  }
  if (summary.asset_id !== prop.id) {
    return reject(`asset_id mismatch: ${summary.asset_id} ≠ ${prop.id}`);
  }

  return {
    status: "validated",
    triCount,
    triBudget: prop.tri_budget,
    boundingBox: bbox,
    materialSlots,
    blenderVersion,
  };
}

function isValidBbox(b: unknown): b is { min: [number, number, number]; max: [number, number, number] } {
  if (b === null || typeof b !== "object") return false;
  const o = b as { min?: unknown; max?: unknown };
  return (
    Array.isArray(o.min) && o.min.length === 3 && o.min.every((v) => typeof v === "number") &&
    Array.isArray(o.max) && o.max.length === 3 && o.max.every((v) => typeof v === "number")
  );
}

// Impure: writes the .validation.json next to the .glb. Exported for tests.
export function writeManifest(glbPath: string, assetId: string, outcome: ValidationOutcome): string {
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
  return path;
}

// LangGraph node — orchestrates the impure bits and delegates the gate to
// the pure function. The node remains async so the graph signature is
// preserved.
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
  const summary = summaryText ? (JSON.parse(summaryText) as SummaryShape) : null;

  const blenderVersion = /Blender ([\d.]+)/.exec(
    state.messages
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n")
  )?.[1] ?? "unknown";

  const outcome = gateValidation(summary, prop, blenderVersion);
  writeManifest(glbPath, prop.id, outcome);

  const message =
    outcome.status === "validated"
      ? `Validator: PASS (${outcome.triCount}/${outcome.triBudget} tris)`
      : `Validator: REJECT — ${outcome.rejectionReason}`;
  return {
    validation: outcome,
    currentNode: "validator",
    messages: [new AIMessage(message)],
  };
}
