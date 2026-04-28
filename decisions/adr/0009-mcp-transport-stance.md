# ADR-0009: MCP transport stance — stdio first, HTTP+SSE second, shared registry

Date: 2026-04
Status: Accepted
OKR: 2026-Q2 / O2 / KR1 (assistant-centric architecture)
Commands affected: `pnpm foundry mcp`, `claude mcp add foundry`
Repos affected: asset-foundry

---

## Context

Phase 2 made runs first-class and gave the CLI a real dispatch surface. Phase 3 turns asset-foundry into a service consumable from outside the terminal: Claude Desktop conversations, Claude Code sessions, the future Frame Module Federation browser app, and (Phase 5) a native Blender add-on.

The Model Context Protocol (MCP) is the right wire format. It's the lingua franca for connecting LLM-driven agents to local tools, and Anthropic's first-party clients (Claude Desktop, Claude Code) speak it natively over stdio. There are several transports defined in the MCP spec; we have to pick one — or commit to multiple.

This ADR locks how asset-foundry exposes itself: which transport, how tools are named, what the resource model is, what authentication looks like, and how long-running operations report progress.

## Decision

### Transport — stdio first, HTTP+SSE second, one shared tool registry

**Phase 3 ships stdio.** A long-lived process started via `pnpm foundry mcp` reads JSON-RPC over stdin and writes responses over stdout. This gives us, with minimal code:

- Claude Desktop integration (`claude mcp add foundry pnpm foundry mcp`).
- Claude Code integration (the same `claude mcp add` command).
- Native Blender add-on integration in Phase 5 (the add-on will spawn the server as a subprocess and pipe over stdin/stdout — a pattern that maps cleanly onto Blender's modal-operator timer for async).
- CLI smoke tests that pipe handcrafted JSON-RPC and assert on responses.

**Phase 4 adds HTTP+SSE.** When the Frame MF browser app lands, the same server gains a second binding: HTTP for tool calls, SSE for `notifications/progress` streams. The browser cannot speak stdio. The implementation is a thin transport adapter; the tool *registry* and *handlers* are shared with the stdio path.

The single rule that makes this safe: **the tool registry is transport-agnostic**. Each tool is a `(input) → output` async function, registered once. Both transports import the same registry and serve it. This is the same constraint Phase 2 imposed on the CLI vs. core handler split (`runGenerate` is shared by `asset:generate` and `run:resume`).

We do **not** attempt to unify HTTP + stdio behind a single MCP-SDK abstraction prematurely. The SDK's stdio and HTTP transports are both first-class; we'll register the same tools with each transport when Phase 4 arrives.

### Tool naming convention

`foundry.<noun>.<verb>` — e.g. `foundry.asset.generate`, `foundry.target.scaffold`. Dots, lowercase, snake-case for multi-word verbs. Rationale:

- Namespaces tools so a multi-server Claude Desktop client doesn't collide.
- The `<noun>.<verb>` form mirrors REST resource semantics, useful when Phase 4 adds HTTP.
- Matches the verbs already used by the Phase 2 CLI (`asset:generate` → `foundry.asset.generate`). The `:` becomes `.` to match MCP idioms.

Phase 3 ships this initial registry:

| Tool | Purpose | Long-running |
|------|---------|--------------|
| `foundry.target.list` | enumerate sibling targets | no |
| `foundry.target.scaffold` | create a new `<path>/asset-foundry/` from templates | no |
| `foundry.target.validate` | Zod-validate a target's manifest | no |
| `foundry.manifest.read` | return parsed manifest | no |
| `foundry.asset.list` | list `dist/*.validation.json` for a target | no |
| `foundry.asset.generate` | generate one prop | yes |
| `foundry.run.list` | list runs from the state DB | no |
| `foundry.run.status` | one run's metadata + last checkpoint node | no |
| `foundry.run.resume` | re-invoke from latest checkpoint | yes |

Phase 3.5 adds `foundry.manifest.add_prop`, `foundry.run.cancel`, `foundry.fixture.write`. Their schemas can change before Phase 4 ships.

### Async semantics for long-running tools

Tool calls return JSON when the operation completes. `foundry.asset.generate` blocks for the duration of a Blender invocation (~1–2s for fixtures, longer for live LLM). The MCP client sees one `tools/call` response when done.

`notifications/progress` is **deferred to Phase 3.5**. The infrastructure is straightforward (graph `.stream()` instead of `.invoke()`, emit a notification per node), but the Phase 3 v1 contract is "block until done, return the run_id and final status." This keeps the v1 surface thin enough to ship in one commit.

When Phase 3.5 adds streaming, the contract evolves backward-compatibly: clients that supply `_meta.progressToken` opt in; clients that don't get the existing block-until-done behavior.

### Resources — deferred to Phase 3.5

The plan called out `foundry://target/<path>/manifest`, `foundry://target/<path>/props/<id>/glb`, `foundry://run/<id>/log`. Phase 3 ships **tools only**; resources are a separate surface that pays back when an MCP client actually wants to subscribe (e.g. a browser UI that polls a manifest URI). Tools cover the same ground for Phase 3 use cases.

### Authentication

stdio inherits the parent process's trust boundary. The user's OS account that started `pnpm foundry mcp` is the auth model — there is no per-call auth, no token, no ACL. This matches every other stdio MCP server in the wild and matches our solo-dev deployment surface (ADR-0001).

When Phase 4 adds HTTP, bind to `127.0.0.1` only and require a token from `~/.asset-foundry/config.yaml` for any non-loopback request. The token is a stop-gap; multi-tenant auth is not on the roadmap (ADR-0001 again).

### Error model

Tool handlers throw on failure. The MCP SDK wraps thrown errors into `{ isError: true, content: [...] }` responses with the error message in the content. We do **not** invent a typed error envelope — the SDK already handles this and clients already know the shape.

Specific contract: a rejected asset (e.g. tri budget exceeded) is **not** a tool error. The tool succeeds and returns `{ status: "rejected", rejection: "..." }`. Tool errors are reserved for "the tool itself failed to run" — bad input, missing target, Blender crash. This separation matters because a rejected asset is a normal pipeline outcome that the LLM caller might want to inspect; an error is a pipeline malfunction that the LLM caller should escalate.

### Server lifecycle

`pnpm foundry mcp` runs forever until stdin closes (parent process exits or sends EOF). Each tool call is independent — the server holds no per-call state. The SQLite store is opened once at startup and shared across all tool calls; `process.on("SIGINT" | "SIGTERM" | "exit")` closes it cleanly.

Concurrency: SQLite WAL gives many readers + one writer, which is sufficient for Phase 3. If two `asset.generate` calls arrive simultaneously, the second's writes block briefly on the first's. ADR-0008 already accepted this.

### Registration

Documented as:

```bash
claude mcp add foundry pnpm foundry mcp
```

Run from the asset-foundry repo root. Claude Desktop's GUI configurator works the same way — point it at `pnpm foundry mcp` with the asset-foundry repo as the working directory.

The MCP server inherits the working directory from its parent process. `--target` resolution against relative paths (`../beaverGame`) therefore works the same in MCP mode as in CLI mode, as long as the parent invokes from the asset-foundry repo. We document this expectation; we don't try to invent a workspace-config layer.

## Consequences

### Gains

- One persistent server process that Claude Desktop and Claude Code can call. No per-invocation Node startup cost.
- Phase 5's Blender add-on gets a clean stdio integration — Blender's `subprocess.Popen` + modal operator timer is a known pattern.
- The shared tool registry means Phase 4's HTTP+SSE adapter is a transport plug-in, not a parallel implementation.
- Tool naming convention (`foundry.<noun>.<verb>`) gives us a stable namespace that survives multi-server Claude clients.
- Tool errors vs. domain rejections are distinct; clients can act on each appropriately.

### Costs

- The CLI dispatcher (`scripts/foundry.ts`) and the MCP server (`src/mcp/server.ts`) both consume the same handler module — we have to keep handler signatures stable across both. Mitigated by a single `src/handlers.ts` module that owns the contracts.
- `foundry.asset.generate` blocking for the duration of a Blender run is fine for the CLI but suboptimal for a chat session that wants progress updates. Phase 3.5's progress notifications fix this.
- One more native dependency (`@modelcontextprotocol/sdk`).

### Neutral

- Resource model deferred — clients fetch the same data via `foundry.manifest.read`, `foundry.asset.list`, etc. for now.
- We do not implement MCP's `prompts/` capability. Sub-agent prompts are platform IP and live in `src/orchestrator/nodes/*.ts`.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| HTTP+SSE first | Defers Claude Desktop / Code integration unnecessarily; stdio is what those clients already speak. |
| Both transports in Phase 3 | Doubles the surface area before we know which transport's quirks need accommodating. Phase 4 has a real driver (browser UI); Phase 3 doesn't. |
| Skip MCP, expose REST instead | Loses the entire LLM-tool-use ecosystem. MCP is the protocol Claude Desktop / Code already speak. |
| Tool naming `foundry_asset_generate` (snake_case, no dots) | Loses namespace clarity. Multi-server clients colliding on `foo_bar_list` is exactly the problem dotted names solve. |
| Tool errors include rejected assets | Conflates "pipeline failed" with "asset didn't pass validation". Each is a different LLM-caller response. |
| Hold the SQLite write lock for the entire server lifetime | Prevents the CLI from running concurrently with the MCP server. WAL mode handles this without holding locks. |

## Open items (Phase 3.5)

- `notifications/progress` for `asset.generate` and `run.resume` (graph `.stream()`-based).
- Resource URIs: `foundry://target/<path>/manifest`, `foundry://run/<id>/log`, `foundry://target/<path>/props/<id>/glb`.
- `foundry.manifest.add_prop` — needs to preserve YAML formatting (`yaml.dump` reorders keys; consider `yaml-ast-parser` or just a templated insertion).
- `foundry.run.cancel` — requires in-flight run tracking (process map, signal handler).
- `foundry.fixture.write` — write a bpy script into `<target>/asset-foundry/fixtures/<id>.py` with safety checks (no path traversal, validate the §4.4 contract structurally).
- Phase 4: HTTP+SSE transport. Same registry, second adapter.
