// Phase 3/3.5 verification — actually call foundry.asset.generate via MCP, and
// verify progress notifications arrive when a progressToken is set.
// Separate from the main smoke test because this one requires Blender.
//
// Run via: BLENDER_BIN="..." pnpm tsx scripts/mcp-generate-test.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ProgressNotificationSchema } from "@modelcontextprotocol/sdk/types.js";

interface ProgressEvent {
  progress: number;
  total?: number;
  message?: string;
}
const progressEvents: ProgressEvent[] = [];

const client = new Client({ name: "foundry-gen-smoke", version: "0.0.0" });
const transport = new StdioClientTransport({
  command: "pnpm",
  args: ["tsx", "scripts/foundry.ts", "mcp"],
  env: { ...(process.env as Record<string, string>) },
});

try {
  await client.connect(transport);
  // Subscribe BEFORE the call so we don't miss any notifications.
  client.setNotificationHandler(ProgressNotificationSchema, async (n) => {
    progressEvents.push({
      progress: n.params.progress,
      total: n.params.total,
      message: n.params.message,
    });
  });

  console.log("connected; calling foundry.asset.generate test_cube --target ../carrier-pigeon");
  const result = (await client.callTool({
    name: "foundry.asset.generate",
    arguments: { propId: "test_cube", targetPath: "../carrier-pigeon" },
    _meta: { progressToken: "smoke-1" },
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

  // Phase 3.5: progress notifications must arrive when progressToken is set.
  if (progressEvents.length === 0) {
    console.error("✗ expected progress notifications, got none");
    process.exit(1);
  }
  console.log(`✓ received ${progressEvents.length} progress notifications:`);
  for (const e of progressEvents) {
    console.log(`    ${e.progress}/${e.total}  ${e.message}`);
  }
  const expectedTotal = 5;
  const last = progressEvents[progressEvents.length - 1]!;
  if (last.progress !== expectedTotal || last.total !== expectedTotal) {
    console.error(
      `✗ last progress event was ${last.progress}/${last.total}, expected ${expectedTotal}/${expectedTotal}`,
    );
    process.exit(1);
  }
  console.log(`✓ progress notifications arrived in order 1..${expectedTotal}`);
} finally {
  await client.close();
}
