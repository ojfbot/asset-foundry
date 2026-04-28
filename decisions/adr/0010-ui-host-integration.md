# ADR-0010: UI host integration — Frame Module Federation + HTTP transport

Date: 2026-04
Status: Accepted
OKR: 2026-Q2 / O2 / KR1 (assistant-centric architecture)
Commands affected: `pnpm foundry mcp-http`, `pnpm dev` (apps/web/), shell host startup
Repos affected: asset-foundry, shell

---

## Context

Phase 3 made asset-foundry an MCP service over stdio. That gives Claude Desktop and Claude Code first-class access. But the user explicitly asked for asset-foundry to "show up as a Frame Module Federation client app" — a browser surface integrated into the existing `shell/` host that already hosts cv-builder, blogengine, tripplanner, purefoy, gastown-pilot, etc.

Two questions need locking before any browser code lands:

1. **Wire format** between the browser app and the asset-foundry server. Stdio is a non-starter (browsers can't speak it). Options: a parallel REST+SSE API, or the same MCP protocol over HTTP+SSE.
2. **MF integration shape** — port, federation plugin, shared singletons, Carbon version. Shell already locks several of these in `shell/vite.config.ts`; deviating means breakage.

This ADR locks both so Phase 4 part 1 (HTTP transport) and Phase 4 part 2 (browser app) can ship without re-litigating the fundamentals.

## Decision

### Wire format — MCP over HTTP+SSE, not a separate REST API

Asset-foundry's MCP server gains a second transport binding. Same tool registry (`src/handlers.ts` is still the single source of truth), same notification semantics (Phase 3.5's progress streaming), different transport. Rationale:

- Inventing a REST shape duplicates surface that already exists. Every `foundry.<noun>.<verb>` tool would also need a `POST /api/<noun>/<verb>` endpoint. Two API contracts to keep in sync.
- The official `@modelcontextprotocol/sdk` ships `StreamableHTTPServerTransport` for exactly this case. JSON-RPC over HTTP for tool calls, SSE for progress notifications.
- Browser clients use `@modelcontextprotocol/sdk/client/streamableHttp.js` — the same SDK that `claude mcp add` uses, just with a different transport underneath.

Phase 4 ships HTTP+SSE on the same `pnpm foundry mcp-http` codepath that wraps the existing tool registry.

### Bind & port

- `127.0.0.1:3036` by default. Explicitly local-only — no LAN exposure.
- Port chosen to sit adjacent to the MF remote (`3035`), in the gap between `purefoy` (3020) and beyond, leaving the existing range untouched.
- Override via `--http <port>` flag or `$FOUNDRY_HTTP_PORT`.
- A future remote-target use case (collaborator running asset-foundry on their machine, accessible over LAN) is **not** in scope. ADR-0001 still applies.

### Auth model

- Loopback bind only → no auth required for Phase 4. The OS user owns the trust boundary.
- A token-in-header check is sketched in `src/mcp/server.ts` as a no-op stub guarded by `$FOUNDRY_HTTP_TOKEN`. If/when LAN access becomes a real ask, a future ADR turns this on without changing the transport.

### MF remote shape

`apps/web/` becomes a new pnpm workspace package (`@asset-foundry/web` — NOT a forbidden token, see ADR-0007). Vite + React + Carbon Design System + Module Federation, matching `shell/`'s host conventions verbatim:

| Concern | Value | Why |
|---|---|---|
| Federation plugin | `@originjs/vite-plugin-federation` | Matches shell. Switching plugins forces shell to switch too. |
| Remote name | `asset_foundry` | snake_case, matches the existing `resume_builder` / `core_reader` pattern. |
| Exposed module | `./Dashboard` from `./src/components/Dashboard.tsx` | Identical to every other Frame remote. |
| Vite dev port | **3035** | Adjacent to existing range, no collision. |
| HTTP server port | **3036** | One above the dev port. |
| Shared singletons | `react ^18.3.1`, `react-dom ^18.3.1`, `@reduxjs/toolkit ^2.10.1`, `react-redux ^9.2.0`, `@carbon/react ^1.67.0` | Verbatim from `shell/vite.config.ts`. Mismatched versions break MF singleton constraint. |

The shell host gets one new line in `shell/vite.config.ts`:

```ts
asset_foundry: env.VITE_REMOTE_ASSET_FOUNDRY ?? 'http://localhost:3035',
```

And one line in the `remotes` mapping. Minimal blast radius on the shell side.

### State management

A single `@reduxjs/toolkit` store inside `apps/web/`. The shell already provides a host-level store; asset-foundry's remote owns its own slice and wires into the host store's `combineReducers` at runtime. This matches the cv-builder / blogengine pattern.

Slices in Phase 4:
- `targets` — list, validation, manifest content
- `runs` — recent runs, in-flight runs (subscribed via SSE)
- `progress` — live progress events keyed by run_id

### Pages (Phase 4 minimum viable)

`apps/web/src/components/Dashboard.tsx` is the MF entry point and renders a Carbon `<Tabs>` with these tabs:

1. **Targets** — `target.list` results in a Carbon `<DataTable>`. Click → manifest viewer.
2. **Runs** — `run.list` paginated. Click a row → run detail with last_node + final state.
3. **Generate** — form: pick target + prop_id, click "Generate". Subscribes to progress notifications via SSE for the run's progressToken; renders a `<ProgressBar>` per node transition.

Phase 4.5 (deferred to keep Phase 4 shippable):
- Manifest editor (write tools land in Phase 3.6 first).
- Asset preview (3D glTF viewer; needs `<model-viewer>` or three.js drei).
- Asset diff (visual regression).

### Build + deploy

`apps/web/` is dev-only in Phase 4. Production deploy is out of scope until the user ships a real Frame OS production environment. The `pnpm build` script will produce a `dist/` that can be served statically, but no deployment automation lands.

### Versioning

The browser app inherits asset-foundry's package version. Major bumps when the tool registry shape changes in a way that breaks existing browser pages.

## Consequences

### Gains

- Asset-foundry shows up as a real Frame app at `localhost:4000` next to cv-builder etc. — the user's stated Phase 4 goal.
- One protocol (MCP), two transports (stdio + HTTP+SSE), one tool registry. Phase 5's Blender add-on will use stdio; the browser uses HTTP+SSE; both call the same `src/handlers.ts`.
- Progress streaming from Phase 3.5 maps directly onto SSE — the browser's run viewer renders `notifications/progress` as a live progress bar with no extra plumbing.
- Carbon Design System gives us the table, tabs, modal, progress bar, code-block, and form components for free. Matches the rest of Frame visually.

### Costs

- Two ports to manage (3035 + 3036). Documented in CLAUDE.md and codified in ADR-0010 + ADR-0009.
- Shell config grows by two lines per Frame app. Acceptable; the pattern is well-trodden.
- Carbon's bundle size is non-trivial. Tree-shaking + lazy MF chunks mitigate.

### Neutral

- Redux Toolkit is heavyweight for what we need (a few async-thunk slices), but using it preserves the host-store pattern. Switching would orphan us from the rest of Frame.
- Module Federation has known fragility around shared-version mismatches. The shared singletons table above is the contract; any drift breaks at runtime. ADR-0010 amendments cover version bumps.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Separate REST API for the browser | Two API surfaces to keep in sync. MCP-over-HTTP gives us one. |
| Standalone browser app (not Frame-integrated) | Defeats the user's request. The whole point of Phase 4 is Frame integration. |
| iframe embedding instead of MF | Frame's whole architecture is "MF, not iframes" (per `core/domain-knowledge/frame-os-context.md`). Iframes lose Redux store sharing and Carbon theme inheritance. |
| Webpack Module Federation instead of Vite | Shell uses `@originjs/vite-plugin-federation`. Switching forces shell + every other remote to switch. Breaking change to the entire frame. |
| `next.js` for the browser app | Vite + React is the existing pattern. Next adds SSR machinery we don't need. |
| Tauri / Electron native shell | Out of scope. Phase 5's Blender add-on is the native surface; the browser is the browser. |
| Embed asset-foundry's HTTP server inside frame-agent (port 4001) | Conflates concerns. Frame-agent routes LLM calls; foundry runs build pipelines. Different lifecycles, different scaling concerns, different failure modes. |
| Skip HTTP transport, browser uses stdio via WebSocket bridge | Adds a bridge process for no benefit. The MCP SDK ships HTTP+SSE; use it. |

## Open items (Phase 4.5 / 5)

- Carbon theme: light vs. dark vs. system. Frame default is `g100` (dark); inherit unless asked.
- Manifest editor (depends on Phase 3.6's `foundry.manifest.add_prop`).
- 3D glTF preview component for the runs page.
- E2E test harness — playwright against `pnpm dev` (vite + foundry HTTP server).
- Production deploy story (when Frame OS prod environment exists).
- Token auth for `$FOUNDRY_HTTP_TOKEN` if LAN access ever lands.
