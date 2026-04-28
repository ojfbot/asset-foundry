// MCP server (ADR-0009 + ADR-0010). Two transports share one tool registry:
//   - stdio (Claude Desktop, Claude Code, Blender add-on in Phase 5)
//   - HTTP+SSE (Frame MF browser app in Phase 4)
//
// Lifecycle: opens one StateStore for the server's lifetime. Stdio mode blocks
// on stdin until parent closes. HTTP mode listens on 127.0.0.1:<port> until
// SIGINT/SIGTERM. Both call registerTools(server, store) — single source of
// truth for what foundry.* tools exist.
//
// Tool naming: foundry.<noun>.<verb> per ADR-0009.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import * as h from "../handlers";
import { createStateStore, type StateStore } from "../state/checkpointer";

function jsonContent(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

/** Register the full foundry.* tool registry on a fresh MCP server. Called by
 *  both transports — keeping it factored out is the load-bearing decision from
 *  ADR-0009/0010 ("one registry, two transports"). */
function registerTools(server: McpServer, store: StateStore): void {

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
}

function attachShutdownHandlers(closeStore: () => void): void {
  const closeOnce = (() => {
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      try {
        closeStore();
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
}

export async function startMcpServer(): Promise<void> {
  const store = createStateStore();
  const server = new McpServer({ name: "foundry", version: "0.4.0" });
  registerTools(server, store);
  attachShutdownHandlers(() => store.close());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/** HTTP+SSE MCP server (ADR-0010). Stateful per-session: each client opens a
 *  session via `initialize`, gets back an `Mcp-Session-Id` header, and reuses
 *  that header for subsequent calls so SSE notifications can flow back through
 *  the same transport. The browser app at apps/web/ is the primary consumer. */
export interface HttpServerOptions {
  port?: number;
  host?: string;
}

export async function startHttpMcpServer(options: HttpServerOptions = {}): Promise<void> {
  const port = options.port ?? Number(process.env["FOUNDRY_HTTP_PORT"] ?? 3036);
  const host = options.host ?? "127.0.0.1";

  const store = createStateStore();
  attachShutdownHandlers(() => store.close());

  // Map session-id → transport so notifications flow back to the right client.
  const transports = new Map<string, StreamableHTTPServerTransport>();

  async function handleMcpRequest(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
  ): Promise<void> {
    const sessionHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      // New session — wire a fresh transport to a fresh server (the registry
      // and store are shared across sessions, just the transport instance is
      // per-session so its SSE stream is scoped correctly).
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports.set(sid, transport!);
        },
        onsessionclosed: (sid) => {
          transports.delete(sid);
        },
      });
      const server = new McpServer({ name: "foundry", version: "0.4.0" });
      registerTools(server, store);
      await server.connect(transport);
    }
    await transport.handleRequest(req, res, body);
  }

  const httpServer = createServer((req, res) => {
    // CORS preflight (browser at :3035 calls into us at :3036).
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, Authorization",
      });
      res.end();
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    if (req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, store: store.dbPath, sessions: transports.size }));
      return;
    }

    if (req.url !== "/mcp") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found — POST /mcp for MCP JSON-RPC; GET /healthz for health\n");
      return;
    }

    if (req.method === "GET" || req.method === "DELETE") {
      // GET = SSE stream open; DELETE = session close. Both go through the transport.
      void handleMcpRequest(req, res, undefined).catch((err) => {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end(`internal error: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
      return;
    }

    if (req.method === "POST") {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        let body: unknown;
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch (err) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end(`invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
        void handleMcpRequest(req, res, body).catch((err) => {
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end(`internal error: ${err instanceof Error ? err.message : String(err)}`);
          }
        });
      });
      return;
    }

    res.writeHead(405);
    res.end("method not allowed");
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, () => {
      console.error(`foundry mcp-http listening on http://${host}:${port}/mcp`);
      resolve();
    });
  });
}
