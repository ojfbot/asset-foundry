---
id: 20260428-2200-report-platformization-phases-0-through-4-shipped
type: report
title: "Phases 0–4.2 shipped: asset-foundry is now a portable MCP service with three transports and a Frame MF browser app"
actor: code-claude
session_id: 2026-04-28T19:00:00Z
responding_to: null
refs:
  - github:ojfbot/asset-foundry#16
  - github:ojfbot/shell#76
  - file:decisions/adr/0006-target-workspace-model.md
  - file:decisions/adr/0007-game-agnostic-contract.md
  - file:decisions/adr/0008-persistent-state-store.md
  - file:decisions/adr/0009-mcp-transport-stance.md
  - file:decisions/adr/0010-ui-host-integration.md
  - file:src/handlers.ts
  - file:src/mcp/server.ts
  - file:apps/web/src/components/Dashboard.tsx
  - file:/Users/yuri/.claude/plans/i-have-big-plans-curious-kernighan.md
status: closed
created_at: 2026-04-28T22:00:00Z
labels:
  project: cozy-beaver
  repo: asset-foundry
  phase: 4
---

## What got done

A nine-commit feature branch, plus a one-line companion change to `shell/`, plus a verified-no-op state on `beaverGame/`.

**Architectural shift (locked by 5 new ADRs):**

| ADR | Subject |
|-----|---------|
| 0006 | Target workspace model — asset-foundry owns no game data |
| 0007 | Game-agnostic contract — `src/` carries no game tokens, AST-lint enforced |
| 0008 | Persistent state store — SQLite default, Postgres opt-in |
| 0009 | MCP transport — stdio first, HTTP+SSE second, shared registry |
| 0010 | UI host integration — Frame MF + HTTP+SSE; ports 3035/3036 |

**Phases shipped (commit hashes are post-rebase onto current `origin/main`):**

| Phase | Hash | Delivers |
|-------|------|----------|
| 0 | `a822b73` | Game data moved out of asset-foundry; `TargetContext` plumbing; `mcp-bridge.ts` → `blender-runner.ts` |
| 1 | `0514955` | `../carrier-pigeon/` proves agnosticism; AST lint rule blocks CI on game tokens; Phase 0 fallback removed |
| 2 | `cbf5193` | SQLite checkpointer + `RunStore`; commander-based `pnpm foundry` dispatcher; 7 subcommands incl. `target:scaffold` + templates |
| 3 | `125fe89` | Stdio MCP server (`@modelcontextprotocol/sdk`); `src/handlers.ts` factored as the shared registry |
| — | `a210baf` | Sanitize fixture names in test files merged from parallel session (parsing + validator coverage) so they pass `lint:agnostic` |
| 3.5 | `1d4f77e` | `notifications/progress` streaming via `graph.stream()`; per-node updates flow to MCP clients with `_meta.progressToken` |
| 4.1 | `d3832ae` | HTTP+SSE MCP transport on `127.0.0.1:3036`; per-session transport map; `/healthz`; CORS preflight |
| 4.2 | `883ab82` | `apps/web/` Frame MF remote (Vite + Carbon + MCP HTTP client); Targets tab functional |
| (CI fix) | `24ce88c` | Smoke tests pass `rootPath: "."` so they're CI-portable (CI runners have no sibling repos) |

**Tool registry (the Phase 3+ surface):**

```
foundry.target.list / .scaffold / .validate
foundry.manifest.read
foundry.asset.list / .generate          ← .generate emits notifications/progress
foundry.run.list / .status / .resume    ← .resume emits notifications/progress
```

Three transports wrap that registry:

1. CLI — `pnpm foundry <subcommand>`
2. stdio MCP — `pnpm foundry mcp` (Claude Desktop, Claude Code, future Blender add-on)
3. HTTP+SSE MCP — `pnpm foundry mcp-http` on `127.0.0.1:3036` (browser app)

**Verification matrix (all green on the feat branch as of last push):**

| Gate | Result |
|------|--------|
| `pnpm typecheck` | clean |
| `pnpm test` | 39/39 |
| `pnpm lint:agnostic` (ADR-0007) | 25 files clean |
| `pnpm validate:manifest --target ./test-fixtures` | 1 prop, 1 biome |
| `pnpm test:mcp` (stdio) | 7/7 |
| `pnpm test:mcp-http` (HTTP+SSE) | 4/4 |
| `(cd apps/web && pnpm typecheck)` | clean |
| `pnpm tsx scripts/mcp-generate-test.ts` (manual; Blender) | 5 progress events in order, validated 12/50 tris |
| GitHub CI: `schema-and-tests` on PR #16 | ✓ (after the CI portability fix) |
| GitHub CI: shell PR #76 (all 9 checks) | ✓ |

**Cross-repo state:**

- `shell/` PR #76 (one-line addition: `asset_foundry: 'http://localhost:3035'` in `remoteBase`).
- `beaverGame/` Phase 0 import already on `origin/main` as `b2a3b9d` (re-applied by a parallel session). Verified byte-identical to my original `049e7b4` via `git diff --stat 049e7b4 b2a3b9d` → empty. No further action.
- `../carrier-pigeon/` is a non-git directory — throwaway proof-of-portability. Lives outside ojfbot's repo set on purpose.

## What's open

- **PRs awaiting review/merge.** asset-foundry #16 and shell #76. Both green on the gates I added; asset-foundry #16's `skill-audit` failure is the same pre-existing infra gap noted in the prior report (`scripts/hooks/pr-skill-audit.sh` is gitignored).
- **Phase 3.6** — backlog of MCP surface items: `manifest.add_prop`, `run.cancel`, `fixture.write`, plus subscribable `foundry://` resources. Defined in the plan doc; pick whichever has a downstream driver.
- **Phase 4.5** — full browser pages (Runs subscribed to SSE progress; Generate form with live progress bar; Redux slices; glTF preview; playwright e2e). Phase 4 v1 ships only the Targets tab.
- **Phase 5** — Blender add-on (Python addon at `plugins/blender/` talking to `pnpm foundry mcp` over stdio). Modal-operator timer pattern needed for async-over-stdio in Blender's single-threaded host.
- **Phase 2.5** — un-crossed verification: simulate a real `SIGTERM` mid-Blender and exercise `run:resume` for actual mid-pipeline crash recovery. Persistence + dispatch verified; the SIGTERM scenario isn't.

## Discoveries

- **Multi-session worktree collision is a real failure mode here.** During Phase 3 a parallel agent's `git checkout` in the shared `/Users/yuri/ojfbot/asset-foundry` working directory swapped my branch out from under me; every file I had touched appeared reverted. Phase 0–3 commits were intact on `main` the whole time — the working tree had moved to a sibling branch. **Always check `git branch -a`, `git status`, and `git reflog` before assuming work was lost.** Going forward, isolate concurrent sessions via `git worktree add ../asset-foundry-<task> <branch>` (or the `Agent` tool's `isolation: "worktree"` parameter). Saved as user-level feedback memory at `/Users/yuri/.claude/projects/-Users-yuri-ojfbot-asset-foundry/memory/feedback_worktrees_for_parallel_sessions.md`.

- **The lint rule's word-boundary fix matters.** Initial implementation matched forbidden tokens as substrings in string literals → "responds" matched "pond". Now: single-word forbidden tokens use word/snake-case-segment boundary matching; compound tokens (with `_`) keep substring matching. Fixed under Phase 4.1 (`scripts/lint-agnostic.ts:findTokenIn`).

- **Origin's `c2c0343` + `3c43c35` (parser + validator coverage) were authored before ADR-0007** and used Cozy-Beaver-specific fixture names (`birch_sapling`, `pond_meadow`). The lint rule correctly flagged them post-merge; the `a210baf` chore commit sanitizes to `test_cube` / `noop_biome`. Tests still pass.

- **The MCP SDK's `@originjs/vite-plugin-federation` types lag its runtime accepted shape.** `singleton: true` works at runtime but isn't in the .d.ts. Same situation in `lean-canvas/packages/browser-app/`. Worked around by excluding `apps/web/vite.config.ts` from the typecheck `include` list.

- **Carbon/Frame singleton invariant.** `apps/web/`'s Carbon ^1.71.0 is peer-compatible with shell's `requiredVersion: '^1.67.0'` (both 1.x). If shell ever bumps Carbon to a major version, asset-foundry must follow synchronously or MF breaks at runtime.

- **`TOTAL_NODES = 5` in `src/handlers.ts` is hard-coded.** If a future ADR changes the four sub-agents (ADR-0004 boundaries), update both this constant AND `scripts/mcp-generate-test.ts`'s assertion.

## Recommended next session

Roughly in priority order:

1. **Get PR #16 merged.** Address any review feedback. The `skill-audit` failure is environmental (per the prior report); merging needs `--admin` or workflow fix.
2. **Phase 4.5 Generate form.** It's the most visible deliverable per the user's original ask ("useful UIs we can work with"). Drives the SSE-progress wiring through the browser, exercises the full HTTP+SSE pipeline. Largest payoff per effort.
3. **Phase 5 Blender add-on** (if the browser UI is in good shape and the user wants the third surface). Hands-on with Blender's modal-operator timer.
4. **Phase 3.6 `manifest.add_prop`** if/when the browser editor needs it. Otherwise defer.
5. **Phase 2.5 mid-pipeline crash test** — low risk, but uncrossed item that would close out Phase 2's verification properly.

The plan doc at `/Users/yuri/.claude/plans/i-have-big-plans-curious-kernighan.md` is the rewritten handoff and has full file paths, ADR references, and a verification path. Read it before picking work.

**Entry-point reading list for the next agent:**

1. `CLAUDE.md` — onboarding doc; dev commands, env vars, ADR index, current punch list.
2. `decisions/adr/0006` → `0010` — the platformization charter, in order.
3. `src/handlers.ts` — single source of truth. CLI/stdio/HTTP all wrap these functions.
4. `src/mcp/server.ts` — `registerTools()` is the central registry.
5. ADR-0009 §"Tool errors vs domain rejections" — important distinction for any new tool.
6. The plan doc above — for goals and the punch list.
