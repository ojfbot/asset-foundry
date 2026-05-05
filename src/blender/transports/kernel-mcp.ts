// KernelMcpTransport — peer transport per ADR-0011. Connects to the ahujasid
// blender-mcp kernel as an MCP client over stdio, then routes the bpy script
// through `execute_blender_code` so it runs inside the user's live Blender
// process. Used for interactive design sessions where Blender is already open.
//
// Bootstrap shim: `execute_blender_code` runs Python via exec(), where neither
// `__file__` nor `sys.argv` are the same as the subprocess path. We wrap the
// real script with a `runpy.run_path` invocation so existing fixtures —
// which depend on both — keep working unchanged.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { BlenderTransport, RunOptions, RunResult } from "../transport";

const KERNEL_CMD = process.env.FOUNDRY_BLENDER_KERNEL_CMD ?? "uvx";
const KERNEL_ARGS = (process.env.FOUNDRY_BLENDER_KERNEL_ARGS ?? "blender-mcp").split(" ");

export class KernelMcpTransport implements BlenderTransport {
  async run(opts: RunOptions): Promise<RunResult> {
    const matsTmp = join(opts.scriptsDir, "_materials.json");
    writeFileSync(matsTmp, JSON.stringify(opts.materials), "utf8");

    const transport = new StdioClientTransport({ command: KERNEL_CMD, args: KERNEL_ARGS });
    const client = new Client({ name: "asset-foundry", version: "0.0.1" });
    try {
      await client.connect(transport);
    } catch (err) {
      throw new Error(
        `Failed to start kernel blender-mcp via \`${KERNEL_CMD} ${KERNEL_ARGS.join(" ")}\`. ` +
        `Ensure uv is installed (\`brew install uv\`) and the ahujasid blender-mcp addon is ` +
        `installed and enabled inside a running Blender. Original: ${(err as Error).message}`
      );
    }

    try {
      const code = wrapScript(opts.scriptPath, opts.outPath, matsTmp);
      const callResult = await client.callTool({
        name: "execute_blender_code",
        arguments: { code },
      });

      const text = extractText(callResult);
      if ((callResult as { isError?: boolean }).isError) {
        throw new Error(`kernel blender-mcp returned error from execute_blender_code:\n${text}`);
      }

      const blenderVersion = /Blender (\d+\.\d+\.\d+)/.exec(text)?.[1] ?? "unknown";
      return { stdout: text, blenderVersion };
    } finally {
      await client.close().catch(() => { /* best-effort */ });
    }
  }
}

/** Build the Python payload sent to `execute_blender_code`. The shim:
 *  - prints the running Blender's `version_string` so downstream parsing
 *    can extract it the same way the subprocess banner is parsed
 *  - sets `sys.argv` to mirror `blender --background --python <script> -- <out> <mats>`
 *  - delegates to `runpy.run_path`, which sets `__file__` and `__name__` for the
 *    target script — preserving the contract that fixtures depend on
 *    (`os.path.dirname(__file__)` to import sibling `_lib.py`). */
function wrapScript(scriptPath: string, outPath: string, matsPath: string): string {
  return [
    "import bpy, sys, runpy",
    `print(f"Blender {bpy.app.version_string}")`,
    `sys.argv = [${q(scriptPath)}, "--", ${q(outPath)}, ${q(matsPath)}]`,
    `runpy.run_path(${q(scriptPath)}, run_name="__main__")`,
  ].join("\n");
}

function q(s: string): string {
  return JSON.stringify(s);
}

interface ToolContent { type: string; text?: string }

function extractText(result: unknown): string {
  const content = (result as { content?: ToolContent[] }).content ?? [];
  return content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text!)
    .join("\n");
}
