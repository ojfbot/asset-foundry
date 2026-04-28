import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStateStore, type StateStore } from "./checkpointer";

describe("StateStore (ADR-0008)", () => {
  let tmp: string;
  let store: StateStore;
  let prev: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "foundry-test-"));
    prev = process.env["FOUNDRY_STATE_DIR"];
    process.env["FOUNDRY_STATE_DIR"] = tmp;
    store = createStateStore();
  });

  afterEach(() => {
    store.close();
    if (prev === undefined) delete process.env["FOUNDRY_STATE_DIR"];
    else process.env["FOUNDRY_STATE_DIR"] = prev;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("creates the DB at $FOUNDRY_STATE_DIR/runs.sqlite", () => {
    expect(store.dbPath).toBe(join(tmp, "runs.sqlite"));
  });

  it("inserts a pending run and lists it", () => {
    store.runs.insertPending({
      run_id: "test-run-1",
      target_path: "/path/to/target",
      prop_id: "test_cube",
      started_at: "2026-04-28T00:00:00Z",
    });
    const rows = store.runs.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("pending");
    expect(rows[0]!.prop_id).toBe("test_cube");
    expect(rows[0]!.tri_count).toBeNull();
  });

  it("transitions pending → validated and exposes tri counts", () => {
    store.runs.insertPending({
      run_id: "test-run-2",
      target_path: "/path/to/target",
      prop_id: "test_cube",
      started_at: "2026-04-28T00:00:00Z",
    });
    store.runs.updateValidated("test-run-2", "/dist/test_cube_v1.glb", 12, 50);
    const row = store.runs.get("test-run-2");
    expect(row?.status).toBe("validated");
    expect(row?.tri_count).toBe(12);
    expect(row?.tri_budget).toBe(50);
    expect(row?.glb_path).toBe("/dist/test_cube_v1.glb");
    expect(row?.ended_at).not.toBeNull();
  });

  it("transitions pending → rejected with reason", () => {
    store.runs.insertPending({
      run_id: "test-run-3",
      target_path: "/path/to/target",
      prop_id: "test_cube",
      started_at: "2026-04-28T00:00:00Z",
    });
    store.runs.updateRejected("test-run-3", "over budget");
    const row = store.runs.get("test-run-3");
    expect(row?.status).toBe("rejected");
    expect(row?.rejection).toBe("over budget");
  });

  it("filters list by target and status", () => {
    store.runs.insertPending({
      run_id: "a",
      target_path: "/t1",
      prop_id: "p1",
      started_at: "2026-04-28T00:00:00Z",
    });
    store.runs.insertPending({
      run_id: "b",
      target_path: "/t2",
      prop_id: "p2",
      started_at: "2026-04-28T00:00:01Z",
    });
    store.runs.updateValidated("b", "/g.glb", 10, 50);
    expect(store.runs.list({ target: "/t1" })).toHaveLength(1);
    expect(store.runs.list({ status: "validated" })).toHaveLength(1);
    expect(store.runs.list({ status: "pending" })).toHaveLength(1);
  });

  it("returns null for unknown run_id", () => {
    expect(store.runs.get("nonexistent")).toBeNull();
  });
});
