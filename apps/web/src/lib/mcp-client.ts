// MCP client wiring for the browser app. Connects to the asset-foundry MCP
// HTTP+SSE server (ADR-0010) — the same registry the CLI and stdio MCP
// transports expose.
//
// URL resolution:
//   1. ?mcp=http://host:port/mcp   (override via query string for ad-hoc dev)
//   2. window.__FOUNDRY_MCP_URL__  (shell/ host can inject this at runtime)
//   3. http://localhost:3036/mcp   (default, matches `pnpm foundry mcp-http`)
//
// One client per page load. Connect lazily on first call; reuse the same
// transport so SSE notifications persist across calls.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

declare global {
  interface Window {
    __FOUNDRY_MCP_URL__?: string;
  }
}

function resolveUrl(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("mcp");
    if (fromQuery) return fromQuery;
    if (window.__FOUNDRY_MCP_URL__) return window.__FOUNDRY_MCP_URL__;
  }
  return "http://localhost:3036/mcp";
}

let cached: { client: Client; ready: Promise<void> } | null = null;

export function getMcpClient(): { client: Client; ready: Promise<void> } {
  if (cached) return cached;
  const client = new Client({ name: "asset-foundry-web", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(resolveUrl()));
  const ready = client.connect(transport);
  cached = { client, ready };
  return cached;
}

interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

/** Helper: call a tool and parse its first text-content block as JSON. The
 *  asset-foundry server convention is that every tool returns one text block
 *  containing JSON.stringify(result, null, 2). */
export async function callJsonTool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { client, ready } = getMcpClient();
  await ready;
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  if (result.isError) {
    throw new Error(`tool error from ${name}: ${JSON.stringify(result.content)}`);
  }
  const text = result.content[0]?.text;
  if (!text) throw new Error(`tool ${name} returned no text content`);
  return JSON.parse(text) as T;
}
