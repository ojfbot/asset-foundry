// Phase 3 verification: spawn `pnpm foundry mcp` as a subprocess, connect an
// MCP client over stdio, exercise the full tool registry. Exits 0 on success.
//
// Run via: pnpm tsx scripts/mcp-smoke-test.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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

const client = new Client({ name: "foundry-smoke", version: "0.0.0" });
const transport = new StdioClientTransport({
  command: "pnpm",
  args: ["tsx", "scripts/foundry.ts", "mcp"],
});

try {
  await client.connect(transport);
  console.log("connected to foundry mcp server");

  // 1. tools/list — registry shape
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
    "tools/list returns the expected registry",
    expected.every((e) => names.includes(e)),
    `${names.length} tools`,
  );

  // 2. target.validate against the in-repo test-fixtures
  const validateResult = parseJsonContent(
    (await client.callTool({
      name: "foundry.target.validate",
      arguments: { targetPath: "./test-fixtures" },
    })) as ToolResult,
  ) as { valid: boolean; propCount?: number };
  check(
    "target.validate ./test-fixtures",
    validateResult.valid && validateResult.propCount === 1,
    `valid=${validateResult.valid} propCount=${validateResult.propCount}`,
  );

  // 3. target.list — should find at least one valid sibling target.
  const targetListResult = parseJsonContent(
    (await client.callTool({
      name: "foundry.target.list",
      // Scan the repo itself so the test-fixtures/ target is always discoverable
      // — CI runners don't have sibling target repos checked out.
      arguments: { rootPath: "." },
    })) as ToolResult,
  ) as { rootPath: string; targets: Array<{ path: string; valid: boolean }> };
  const validTargets = targetListResult.targets.filter((t) => t.valid);
  check(
    "target.list finds at least one valid target",
    validTargets.length >= 1,
    `${targetListResult.targets.length} total, ${validTargets.length} valid under ${targetListResult.rootPath}`,
  );

  // 4. manifest.read returns Zod-validated manifest
  const manifestResult = parseJsonContent(
    (await client.callTool({
      name: "foundry.manifest.read",
      arguments: { targetPath: "./test-fixtures" },
    })) as ToolResult,
  ) as { manifest: { version: number; props: unknown[] } };
  check(
    "manifest.read returns parsed manifest",
    manifestResult.manifest.version === 1 && manifestResult.manifest.props.length === 1,
    `version=${manifestResult.manifest.version} props=${manifestResult.manifest.props.length}`,
  );

  // 5. asset.list — even an empty target should return cleanly
  const assetListResult = parseJsonContent(
    (await client.callTool({
      name: "foundry.asset.list",
      arguments: { targetPath: "./test-fixtures" },
    })) as ToolResult,
  ) as { outputDir: string; assets: unknown[] };
  check(
    "asset.list returns array for empty target",
    Array.isArray(assetListResult.assets),
    `${assetListResult.assets.length} assets in ${assetListResult.outputDir}`,
  );

  // 6. run.list — pre-existing rows from earlier phases should appear
  const runListResult = parseJsonContent(
    (await client.callTool({
      name: "foundry.run.list",
      arguments: { limit: 5 },
    })) as ToolResult,
  ) as Array<{ run_id: string; status: string }>;
  check(
    "run.list returns rows",
    Array.isArray(runListResult),
    `${runListResult.length} rows`,
  );

  // 7. error path: non-existent target should produce a well-formed tool error
  const errorRaw = (await client.callTool({
    name: "foundry.target.validate",
    arguments: { targetPath: "/nonexistent/path/xyz" },
  })) as ToolResult;
  // target.validate returns {valid: false, error: ...} on bad target — NOT a tool
  // error per ADR-0009 (it's a domain outcome, not a malfunction).
  const errParsed = parseJsonContent(errorRaw) as { valid: boolean; error?: string };
  check(
    "target.validate returns valid:false for bad target (not a tool error)",
    errParsed.valid === false && !!errParsed.error,
  );
} finally {
  await client.close();
}

if (process.exitCode === 1) {
  console.error("\n✗ MCP smoke test failed");
  process.exit(1);
}
console.log("\n✓ MCP smoke test passed");
