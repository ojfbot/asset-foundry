// Blender runner — selects between peer transports per ADR-0011 and enforces
// the version pin (ADR-0002) + output-file invariants. The transports under
// `transports/` are interchangeable; this module is the single seam where
// `FOUNDRY_BLENDER_TRANSPORT` decides which one runs.
//
// History note: this file used to spawn Blender directly. The subprocess body
// has moved into `transports/subprocess.ts` and lives alongside a kernel-MCP
// peer. The public export `runBlenderScript` keeps its signature so the
// orchestrator (scene-assembler) is unchanged.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BlenderTransport, RunOptions, RunResult } from "./transport";
import { SubprocessTransport } from "./transports/subprocess";
import { KernelMcpTransport } from "./transports/kernel-mcp";

export type { RunOptions, RunResult } from "./transport";

const TRANSPORT_NAME = (process.env.FOUNDRY_BLENDER_TRANSPORT ?? "subprocess").toLowerCase();

export async function runBlenderScript(opts: RunOptions): Promise<RunResult> {
  const expected = readPin();
  const transport = createTransport(TRANSPORT_NAME);

  const result = await transport.run(opts);

  if (result.blenderVersion !== expected) {
    throw new Error(
      `Blender version mismatch: pinned ${expected}, runtime ${result.blenderVersion} ` +
      `(transport=${TRANSPORT_NAME}). See ADR-0002 in asset-foundry.`
    );
  }
  if (!existsSync(opts.outPath)) {
    throw new Error(
      `Blender did not write ${opts.outPath} (transport=${TRANSPORT_NAME}).\n` +
      `stdout:\n${result.stdout}`
    );
  }
  return result;
}

function createTransport(name: string): BlenderTransport {
  switch (name) {
    case "subprocess": return new SubprocessTransport();
    case "kernel": return new KernelMcpTransport();
    default:
      throw new Error(
        `Unknown FOUNDRY_BLENDER_TRANSPORT=${name}. Use 'subprocess' (headless) or 'kernel' (live Blender via ahujasid/blender-mcp). See ADR-0011.`
      );
  }
}

function readPin(): string {
  const path = join(process.cwd(), ".blender-version");
  if (!existsSync(path)) throw new Error(".blender-version missing — see ADR-0002");
  return readFileSync(path, "utf8").trim();
}
