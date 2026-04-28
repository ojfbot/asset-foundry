// Stdio MCP server (ADR-0009). Exposes the same handlers the CLI dispatcher
// calls — single code path, two transports.
//
// Lifecycle: opens one StateStore at startup, registers tools, blocks reading
// JSON-RPC over stdin until the parent closes the pipe. Closes the store on exit.
//
// Tool naming: foundry.<noun>.<verb> per ADR-0009.
//
// Phase 3 v1 ships the tool subset listed in ADR-0009. Phase 3.5 adds
// notifications/progress streaming, resources, manifest.add_prop, run.cancel,
// and fixture.write.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as h from "../handlers";
import { createStateStore, type StateStore } from "../state/checkpointer";

function jsonContent(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

export async function startMcpServer(): Promise<void> {
  const store: StateStore = createStateStore();
  const server = new McpServer({ name: "foundry", version: "0.3.0" });

  // ─── target.list ──────────────────────────────────────────────────────
  server.registerTool(
    "foundry.target.list",
    {
      description:
        "Enumerate sibling repos under <root> that have an asset-foundry/ directory. Returns target paths plus prop/biome counts.",
      inputSchema: {
        rootPath: z
          .string()
          .optional()
          .describe("Directory to scan. Defaults to the parent of the asset-foundry repo."),
      },
    },
    async (args) => jsonContent(h.targetList({ rootPath: args.rootPath })),
  );

  // ─── target.scaffold ──────────────────────────────────────────────────
  server.registerTool(
    "foundry.target.scaffold",
    {
      description:
        "Scaffold a new <path>/asset-foundry/ from templates/ — world.yaml, palettes.yaml, fixtures/_lib.py, and a trivial test_cube fixture. Refuses to overwrite an existing directory.",
      inputSchema: {
        name: z.string().describe("Target name. Used as the directory name when path is omitted."),
        path: z
          .string()
          .optional()
          .describe("Absolute or relative path to scaffold into. Defaults to ../<name>."),
      },
    },
    async (args) => jsonContent(h.targetScaffold({ name: args.name, path: args.path })),
  );

  // ─── target.validate ──────────────────────────────────────────────────
  server.registerTool(
    "foundry.target.validate",
    {
      description: "Zod-validate a target's manifest. Returns prop/biome counts when valid; error message when not.",
      inputSchema: {
        targetPath: z
          .string()
          .optional()
          .describe("Consumer game repo path. Defaults to $FOUNDRY_TARGET."),
      },
    },
    async (args) => jsonContent(h.targetValidate({ targetPath: args.targetPath })),
  );

  // ─── manifest.read ────────────────────────────────────────────────────
  server.registerTool(
    "foundry.manifest.read",
    {
      description: "Return the parsed Zod-validated manifest (world.yaml) for a target.",
      inputSchema: {
        targetPath: z
          .string()
          .optional()
          .describe("Consumer game repo path. Defaults to $FOUNDRY_TARGET."),
      },
    },
    async (args) => jsonContent(h.manifestRead({ targetPath: args.targetPath })),
  );

  // ─── asset.list ───────────────────────────────────────────────────────
  server.registerTool(
    "foundry.asset.list",
    {
      description: "List generated assets in a target's asset-foundry/dist/ directory (parsed from each .validation.json).",
      inputSchema: {
        targetPath: z
          .string()
          .optional()
          .describe("Consumer game repo path. Defaults to $FOUNDRY_TARGET."),
      },
    },
    async (args) => jsonContent(h.assetList({ targetPath: args.targetPath })),
  );

  // ─── asset.generate ───────────────────────────────────────────────────
  server.registerTool(
    "foundry.asset.generate",
    {
      description:
        "Generate one prop's asset end-to-end. Returns when the pipeline completes. A 'rejected' status (e.g. tri budget exceeded) is a normal outcome, not a tool error. Long-running (~1–2s for fixtures, longer for live LLM). Emits notifications/progress per node when the client supplies _meta.progressToken (Phase 3.5).",
      inputSchema: {
        propId: z.string().describe("Prop id from the target's manifest."),
        targetPath: z
          .string()
          .optional()
          .describe("Consumer game repo path. Defaults to $FOUNDRY_TARGET."),
      },
    },
    async (args, extra) => {
      const progressToken = extra._meta?.progressToken;
      const onProgress = progressToken
        ? async (event: h.ProgressEvent) => {
            await extra.sendNotification({
              method: "notifications/progress",
              params: {
                progressToken,
                progress: event.progress,
                total: event.total,
                message: `${event.node} done (run ${event.runId})`,
              },
            });
          }
        : undefined;
      return jsonContent(
        await h.assetGenerate(
          store,
          { propId: args.propId, targetPath: args.targetPath },
          { onProgress },
        ),
      );
    },
  );

  // ─── run.list ─────────────────────────────────────────────────────────
  server.registerTool(
    "foundry.run.list",
    {
      description: "List recent runs from the state DB. Filters: target, status, limit.",
      inputSchema: {
        targetPath: z.string().optional(),
        status: z.enum(["pending", "validated", "rejected"]).optional(),
        limit: z.number().int().positive().optional().describe("Default 20."),
      },
    },
    async (args) =>
      jsonContent(
        h.runList(store, {
          targetPath: args.targetPath,
          status: args.status,
          limit: args.limit,
        }),
      ),
  );

  // ─── run.status ───────────────────────────────────────────────────────
  server.registerTool(
    "foundry.run.status",
    {
      description: "Show one run's metadata plus the last checkpointed node from the LangGraph state.",
      inputSchema: {
        runId: z.string().describe("UUID v4 from a prior asset.generate response."),
      },
    },
    async (args) => jsonContent(await h.runStatus(store, { runId: args.runId })),
  );

  // ─── run.resume ───────────────────────────────────────────────────────
  server.registerTool(
    "foundry.run.resume",
    {
      description:
        "Re-invoke the LangGraph for a previously-started run from its latest checkpoint. Use after a crash or to retry a rejected run. Emits notifications/progress when the client supplies _meta.progressToken (Phase 3.5).",
      inputSchema: {
        runId: z.string().describe("UUID v4 of an existing run."),
      },
    },
    async (args, extra) => {
      const progressToken = extra._meta?.progressToken;
      const onProgress = progressToken
        ? async (event: h.ProgressEvent) => {
            await extra.sendNotification({
              method: "notifications/progress",
              params: {
                progressToken,
                progress: event.progress,
                total: event.total,
                message: `${event.node} done (run ${event.runId})`,
              },
            });
          }
        : undefined;
      return jsonContent(
        await h.assetGenerate(store, { resumeRunId: args.runId }, { onProgress }),
      );
    },
  );

  // Clean shutdown.
  const closeOnce = (() => {
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      try {
        store.close();
      } catch {
        // already-closed handles are fine
      }
    };
  })();
  process.on("SIGINT", () => {
    closeOnce();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    closeOnce();
    process.exit(0);
  });
  process.on("exit", closeOnce);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
