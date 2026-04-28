// Phase 3 verification — actually call foundry.asset.generate via MCP.
// Separate from the main smoke test because this one requires Blender.
//
// Run via: BLENDER_BIN="..." pnpm tsx scripts/mcp-generate-test.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "foundry-gen-smoke", version: "0.0.0" });
const transport = new StdioClientTransport({
  command: "pnpm",
  args: ["tsx", "scripts/foundry.ts", "mcp"],
  env: { ...(process.env as Record<string, string>) },
});

try {
  await client.connect(transport);
  console.log("connected; calling foundry.asset.generate test_cube --target ../carrier-pigeon");
  const result = (await client.callTool({
    name: "foundry.asset.generate",
    arguments: { propId: "test_cube", targetPath: "../carrier-pigeon" },
  })) as { content: Array<{ type: string; text?: string }>; isError?: boolean };

  if (result.isError) {
    console.error("✗ tool error:", JSON.stringify(result.content));
    process.exit(1);
  }
  const payload = JSON.parse(result.content[0]!.text!);
  console.log("response:", JSON.stringify(payload, null, 2));
  if (payload.status !== "validated") {
    console.error(`✗ expected validated, got ${payload.status}`);
    process.exit(1);
  }
  console.log(`✓ generated ${payload.glbPath} via MCP (${payload.triCount}/${payload.triBudget} tris)`);
} finally {
  await client.close();
}
