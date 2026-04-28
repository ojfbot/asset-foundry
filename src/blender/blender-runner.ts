// Blender subprocess runner. Spawns `blender --background --python <script> -- <out>`,
// gates the runtime version against `.blender-version` (ADR-0002), and returns the
// captured stdout for downstream parsers (FOUNDRY_SUMMARY line, etc.).
//
// Note on naming: this file used to be `mcp-bridge.ts` but is *not* an MCP bridge —
// the real MCP service surface lives at the orchestrator layer (ADR-0009). A future
// blender-daemon mode that talks to a long-lived Blender process is still possible,
// but it would be a separate transport, not an MCP server.
import { spawn } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

const BLENDER_BIN = process.env.BLENDER_BIN ?? "blender";

export async function runBlenderScript(opts: RunOptions): Promise<RunResult> {
  const expected = readPin();
  const matsTmp = join(opts.scriptsDir, "_materials.json");
  writeFileSync(matsTmp, JSON.stringify(opts.materials), "utf8");

  const args = [
    "--background",
    "--python",
    opts.scriptPath,
    "--",
    opts.outPath,
    matsTmp,
  ];

  const result = await spawnCollect(BLENDER_BIN, args);
  const versionLine = /Blender (\d+\.\d+\.\d+)/.exec(result.stdout)?.[1] ?? "unknown";
  if (versionLine !== expected) {
    throw new Error(
      `Blender version mismatch: pinned ${expected}, runtime ${versionLine}. See ADR-0002 in asset-foundry.`
    );
  }
  if (!existsSync(opts.outPath)) {
    throw new Error(`Blender did not write ${opts.outPath}\nstderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
  }
  return { stdout: result.stdout, blenderVersion: versionLine };
}

function readPin(): string {
  const path = join(process.cwd(), ".blender-version");
  if (!existsSync(path)) throw new Error(".blender-version missing — see ADR-0002");
  return readFileSync(path, "utf8").trim();
}

interface SpawnResult { stdout: string; stderr: string; code: number }

function spawnCollect(cmd: string, args: string[]): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => { stdout += b.toString(); });
    child.stderr.on("data", (b) => { stderr += b.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`${cmd} exited ${code}\n${stderr}`));
      else resolve({ stdout, stderr, code });
    });
  });
}
