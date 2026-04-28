import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gateValidation, writeManifest, type SummaryShape } from "./index";
import type { Prop } from "../../manifest/schema";
import type { ValidationOutcome } from "../orchestrator/state";

// Minimal valid prop fixture for the gate tests. `category` and the rest
// don't matter — the gate only inspects id and tri_budget.
const prop: Prop = {
  id: "birch_sapling",
  category: "vegetation",
  tri_budget: 600,
  variants: 1,
  biomes: ["pond_meadow"],
  style_anchors: ["test"],
  materials: [],
  interaction: "none",
};

const validSummary: SummaryShape = {
  asset_id: "birch_sapling",
  tri_count: 80,
  bounding_box: { min: [0, 0, 0], max: [1, 1, 1] },
  material_slots: ["bark"],
};

describe("gateValidation", () => {
  it("validates a well-formed summary that matches the prop entry", () => {
    const outcome = gateValidation(validSummary, prop, "4.2.3");
    expect(outcome.status).toBe("validated");
    expect(outcome.triCount).toBe(80);
    expect(outcome.triBudget).toBe(600);
    expect(outcome.materialSlots).toEqual(["bark"]);
    expect(outcome.blenderVersion).toBe("4.2.3");
    expect(outcome.boundingBox.min).toEqual([0, 0, 0]);
  });

  it("rejects when null summary (no FOUNDRY_SUMMARY in stdout)", () => {
    const outcome = gateValidation(null, prop, "4.2.3");
    expect(outcome.status).toBe("rejected");
    expect(outcome.rejectionReason).toMatch(/no summary/);
  });

  it("rejects when undefined summary", () => {
    const outcome = gateValidation(undefined, prop, "4.2.3");
    expect(outcome.status).toBe("rejected");
  });

  it("rejects when tri_count exceeds tri_budget", () => {
    const over: SummaryShape = { ...validSummary, tri_count: 1000 };
    const outcome = gateValidation(over, prop, "4.2.3");
    expect(outcome.status).toBe("rejected");
    expect(outcome.rejectionReason).toMatch(/1000/);
    expect(outcome.rejectionReason).toMatch(/600/);
  });

  it("rejects when asset_id mismatches the prop entry", () => {
    const wrong: SummaryShape = { ...validSummary, asset_id: "wrong_id" };
    const outcome = gateValidation(wrong, prop, "4.2.3");
    expect(outcome.status).toBe("rejected");
    expect(outcome.rejectionReason).toMatch(/wrong_id/);
    expect(outcome.rejectionReason).toMatch(/birch_sapling/);
  });

  it("rejects when tri_count is non-numeric (catches malformed bpy summaries)", () => {
    const bad: SummaryShape = { ...validSummary, tri_count: "lots" as unknown as number };
    const outcome = gateValidation(bad, prop, "4.2.3");
    expect(outcome.status).toBe("rejected");
    expect(outcome.rejectionReason).toMatch(/invalid tri_count/);
  });

  it("defaults missing material_slots to empty array (still validates)", () => {
    const noSlots: SummaryShape = { ...validSummary, material_slots: undefined };
    const outcome = gateValidation(noSlots, prop, "4.2.3");
    expect(outcome.status).toBe("validated");
    expect(outcome.materialSlots).toEqual([]);
  });

  it("defaults non-array material_slots to empty array (charitable parsing)", () => {
    const wrongType: SummaryShape = { ...validSummary, material_slots: "bark" as unknown as string[] };
    const outcome = gateValidation(wrongType, prop, "4.2.3");
    expect(outcome.materialSlots).toEqual([]);
  });

  it("defaults malformed bounding_box to {0,0,0} but still validates", () => {
    const noBbox: SummaryShape = { ...validSummary, bounding_box: { min: [0, 0] as unknown as [number, number, number] } };
    const outcome = gateValidation(noBbox, prop, "4.2.3");
    expect(outcome.status).toBe("validated");
    expect(outcome.boundingBox.min).toEqual([0, 0, 0]);
  });

  it("preserves the supplied blenderVersion string verbatim", () => {
    const outcome = gateValidation(validSummary, prop, "4.0.2-rc1");
    expect(outcome.blenderVersion).toBe("4.0.2-rc1");
  });
});

describe("writeManifest", () => {
  function withTmp<T>(fn: (dir: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), "asset-foundry-test-"));
    try {
      return fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("writes a validated outcome next to the .glb path", () => {
    withTmp((dir) => {
      const glb = join(dir, "birch_sapling_v1.glb");
      const outcome: ValidationOutcome = {
        status: "validated",
        triCount: 80,
        triBudget: 600,
        boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
        materialSlots: ["bark"],
        blenderVersion: "4.2.3",
      };
      const written = writeManifest(glb, "birch_sapling", outcome);
      expect(written).toBe(join(dir, "birch_sapling_v1.validation.json"));
      const parsed = JSON.parse(readFileSync(written, "utf8"));
      expect(parsed.asset_id).toBe("birch_sapling");
      expect(parsed.status).toBe("validated");
      expect(parsed.tri_count).toBe(80);
      expect(parsed.material_slots).toEqual(["bark"]);
      expect(parsed.rejection_reason).toBeUndefined();
    });
  });

  it("writes a rejected outcome with rejection_reason embedded", () => {
    withTmp((dir) => {
      const glb = join(dir, "out.glb");
      const outcome: ValidationOutcome = {
        status: "rejected",
        triCount: 0,
        triBudget: 600,
        boundingBox: { min: [0, 0, 0], max: [0, 0, 0] },
        materialSlots: [],
        blenderVersion: "4.2.3",
        rejectionReason: "over budget: 700 > 600",
      };
      writeManifest(glb, "thing", outcome);
      const parsed = JSON.parse(readFileSync(join(dir, "out.validation.json"), "utf8"));
      expect(parsed.status).toBe("rejected");
      expect(parsed.rejection_reason).toBe("over budget: 700 > 600");
    });
  });
});
