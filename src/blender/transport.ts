// Blender transport interface (ADR-0011). Two peer implementations live under
// `transports/`: subprocess (headless / CI) and kernel-mcp (live Blender via
// ahujasid/blender-mcp). The selector lives in `blender-runner.ts` and is
// driven by `FOUNDRY_BLENDER_TRANSPORT`.
import type { MaterialPlan } from "../orchestrator/state";

export interface RunOptions {
  scriptPath: string;
  outPath: string;
  materials: MaterialPlan[];
  /** Directory to write the per-run _materials.json temp file. Per ADR-0006 this
   *  is target-rooted: <target>/asset-foundry/dist/scripts/. */
  scriptsDir: string;
}

export interface RunResult {
  stdout: string;
  blenderVersion: string;
}

export interface BlenderTransport {
  /** Execute a bpy script. Implementation must:
   *  - Make `outPath` and the materials json path reachable as sys.argv[-2:]
   *  - Preserve `__file__` semantics so fixtures can import sibling `_lib.py`
   *  - Capture Blender's stdout (FOUNDRY_SUMMARY parsing is downstream)
   *  - Report the runtime Blender version it observed
   *  Pin enforcement (ADR-0002) and outPath existence are checked by the
   *  caller in `blender-runner.ts`, not by transports. */
  run(opts: RunOptions): Promise<RunResult>;
}
