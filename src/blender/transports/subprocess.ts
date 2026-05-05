// SubprocessTransport — peer transport per ADR-0011. Runs
// `blender --background --python <script> -- <out> <materials>` as a fresh
// process. This is the headless path: works with no GUI Blender open,
// always available, used by CI and offline runs.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BlenderTransport, RunOptions, RunResult } from "../transport";

const BLENDER_BIN = process.env.BLENDER_BIN ?? "blender";

export class SubprocessTransport implements BlenderTransport {
  async run(opts: RunOptions): Promise<RunResult> {
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
    const blenderVersion = /Blender (\d+\.\d+\.\d+)/.exec(result.stdout)?.[1] ?? "unknown";
    return { stdout: result.stdout, blenderVersion };
  }
}

interface SpawnResult { stdout: string; stderr: string; code: number }

function spawnCollect(cmd: string, args: string[]): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (b) => { stdout += b.toString(); });
    proc.stderr.on("data", (b) => { stderr += b.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`${cmd} exited ${code}\n${stderr}`));
      else resolve({ stdout, stderr, code: code ?? 0 });
    });
  });
}
