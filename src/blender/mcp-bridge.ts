// Blender bridge. Two execution paths:
//  1. Subprocess: spawn `blender --background --python <script> -- <out>`.
//     Reliable, no daemon required, slow startup (~1.5s).
//  2. MCP/TCP 9876: blender-mcp addon listens; we send {script, args} and stream
//     back stdout. Faster for repeated runs.
//
// Phase 0 ships path #1 because it works as long as `blender` is on PATH.
// Path #2 lives behind FOUNDRY_USE_MCP=1 and falls back to subprocess on connect failure.
import { spawn } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MaterialPlan } from "../orchestrator/state";

export interface RunOptions {
  scriptPath: string;
  outPath: string;
  materials: MaterialPlan[];
}

export interface RunResult {
  stdout: string;
  blenderVersion: string;
}

const BLENDER_BIN = process.env.BLENDER_BIN ?? "blender";

export async function runBlenderScript(opts: RunOptions): Promise<RunResult> {
  const expected = readPin();
  const matsTmp = join(process.cwd(), "dist", "scripts", "_materials.json");
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
