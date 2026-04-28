// Phase 4 verification: spawn `pnpm foundry mcp-http` as a subprocess, connect
// an MCP client over HTTP+SSE, exercise the tool registry. Mirrors the stdio
// smoke test (scripts/mcp-smoke-test.ts) but via the HTTP transport (ADR-0010).
//
// Run via: pnpm tsx scripts/mcp-http-smoke-test.ts
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

function parseJsonContent(result: ToolResult): unknown {
  if (result.isError) throw new Error(`tool error: ${JSON.stringify(result.content)}`);
  const text = result.content[0]?.text;
  if (!text) throw new Error("expected text content");
  return JSON.parse(text);
}

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`✓ ${label}${detail ? `  (${detail})` : ""}`);
  } else {
    console.error(`✗ ${label}${detail ? `  (${detail})` : ""}`);
    process.exitCode = 1;
  }
}

const PORT = 3137; // distinct from the dev port to avoid collisions in CI
const URL_BASE = `http://127.0.0.1:${PORT}`;

const child = spawn("pnpm", ["tsx", "scripts/foundry.ts", "mcp-http", "--port", String(PORT)], {
  stdio: ["ignore", "inherit", "pipe"],
});

// Wait for the "listening on" log on stderr (the server logs there per server.ts).
let started = false;
await new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => {
    if (!started) reject(new Error("server did not announce listening within 8s"));
  }, 8_000);
  child.stderr?.on("data", (chunk: Buffer) => {
    const s = chunk.toString();
    process.stderr.write(s);
    if (s.includes("listening on")) {
      started = true;
      clearTimeout(timer);
      resolve();
    }
  });
  child.on("exit", (code) => {
    if (!started) reject(new Error(`server exited (code ${code}) before listening`));
  });
});

const transport = new StreamableHTTPClientTransport(new URL(`${URL_BASE}/mcp`));
const client = new Client({ name: "foundry-http-smoke", version: "0.0.0" });

try {
  await client.connect(transport);
  console.log("connected to foundry mcp-http server");

  const tools = await client.listTools();
  const expected = [
    "foundry.target.list",
    "foundry.target.scaffold",
    "foundry.target.validate",
    "foundry.manifest.read",
    "foundry.asset.list",
    "foundry.asset.generate",
    "foundry.run.list",
    "foundry.run.status",
    "foundry.run.resume",
  ];
  const names = tools.tools.map((t) => t.name).sort();
  check(
    "tools/list returns the expected registry over HTTP",
    expected.every((e) => names.includes(e)),
    `${names.length} tools`,
  );

  const validateResult = parseJsonContent(
    (await client.callTool({
      name: "foundry.target.validate",
      arguments: { targetPath: "./test-fixtures" },
    })) as ToolResult,
  ) as { valid: boolean; propCount?: number };
  check(
    "target.validate ./test-fixtures (HTTP)",
    validateResult.valid && validateResult.propCount === 1,
    `valid=${validateResult.valid} propCount=${validateResult.propCount}`,
  );

  const targetListResult = parseJsonContent(
    (await client.callTool({ name: "foundry.target.list", arguments: {} })) as ToolResult,
  ) as { rootPath: string; targets: Array<{ path: string; valid: boolean }> };
  const validTargets = targetListResult.targets.filter((t) => t.valid);
  check(
    "target.list finds at least one valid target (HTTP)",
    validTargets.length >= 1,
    `${targetListResult.targets.length} total, ${validTargets.length} valid`,
  );

  // /healthz returns server status (sanity check that the non-MCP HTTP route works).
  const healthResp = await fetch(`${URL_BASE}/healthz`);
  const health = (await healthResp.json()) as { ok: boolean; sessions: number };
  check(
    "/healthz responds with ok + session count",
    health.ok && typeof health.sessions === "number",
    `sessions=${health.sessions}`,
  );
} finally {
  await client.close();
  child.kill("SIGTERM");
  await new Promise((r) => child.on("exit", r));
}

if (process.exitCode === 1) {
  console.error("\n✗ MCP HTTP smoke test failed");
  process.exit(1);
}
console.log("\n✓ MCP HTTP smoke test passed");
