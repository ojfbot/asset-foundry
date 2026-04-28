# ADR-0008: Persistent state store — SQLite by default, Postgres opt-in

Date: 2026-04
Status: Accepted
OKR: 2026-Q2 / O2 / KR1 (assistant-centric architecture)
Commands affected: /scaffold-app, /handoff, all `pnpm foundry` subcommands
Repos affected: asset-foundry

---

## Context

Through Phase 1, every `pnpm gen-asset` invocation was ephemeral — the LangGraph compiled fresh, ran, exited. There was no concept of a "run", no resumability, no history. That works for a one-shot CLI but not for the platform we're building:

- **MCP service (Phase 3)** needs to return a `run_id` immediately for long-running `foundry.asset.generate` calls so clients can poll `foundry.run.status` and subscribe to progress notifications.
- **Frame MF browser app (Phase 4)** needs to render run history and live progress. That requires a queryable record per run.
- **Crash resilience**: a `kill -9` mid-pipeline currently means starting from scratch. With three increasingly long-running surfaces (CLI, MCP service, eventually browser), losing a 90-second Blender invocation to a flaky session is unacceptable.
- **Multi-target use**: when one developer is building assets for two games concurrently, "show me what just ran for cozy_beaver" becomes a real query, not a guess at log scrollback.

Sibling repos already solved this. `cv-builder/packages/agent-graph/src/state/checkpointer.ts` ships a `PostgresCheckpointer extends BaseCheckpointSaver`; `blogengine`'s analogue is `SQLiteCheckpointer` using `better-sqlite3`. Both implement the same LangGraph contract (`getTuple`, `put`, `list`, `putWrites`).

The right cut: copy the `BaseCheckpointSaver` interface so the storage layer is swappable, start with SQLite for the solo-dev use case, and design with a Postgres migration path baked in.

## Decision

### Storage backend

**SQLite (`better-sqlite3`) by default. Postgres opt-in via a future ADR amendment.**

SQLite gives us:

- File-based, zero ops. The user's laptop is the deployment target.
- WAL journal mode for concurrent reads (matters for the browser UI in Phase 4 reading runs while the CLI writes).
- Single-process write lock — fine for a single developer; not fine for a multi-tenant cloud, which we're explicitly not building (ADR-0001).
- Dependency footprint: one native module (`better-sqlite3`), no daemon.

Postgres will be the migration target if asset-foundry ever needs multi-host concurrent access. The `BaseCheckpointSaver` interface is the contract; swapping `SQLiteCheckpointer` for `PostgresCheckpointer` is a configuration change, not a refactor. We ship the SQLite version; we do **not** also ship the Postgres version speculatively.

### Database location

```
$FOUNDRY_STATE_DIR/runs.sqlite
```

Defaults:

1. `$FOUNDRY_STATE_DIR` if set (CI runners, sandboxes, scripted environments)
2. `~/.asset-foundry/state/` otherwise (per-host developer state)

The DB is **per host, not per target**. Run history follows the developer who triggered the runs, not the consumer game. A run row carries `target_path` so per-target queries (`foundry run:list --target ../beaverGame`) are trivial.

### Schema

Two tables:

**`checkpoints`** — LangGraph's per-step state blobs. Schema mirrors the `BaseCheckpointSaver` contract (verbatim from blogengine):

```sql
CREATE TABLE checkpoints (
  thread_id  TEXT NOT NULL,
  thread_ts  TEXT NOT NULL,
  parent_ts  TEXT,
  checkpoint TEXT NOT NULL,   -- JSON
  metadata   TEXT NOT NULL,   -- JSON
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (thread_id, thread_ts)
);
CREATE INDEX idx_cp_thread ON checkpoints(thread_id);
```

**`runs`** — asset-foundry-specific index for fast queries. Avoids forcing `run:list` to deserialize every checkpoint blob just to summarize. One row per run, mutated to terminal status at end.

```sql
CREATE TABLE runs (
  run_id      TEXT PRIMARY KEY,    -- UUID v4; doubles as LangGraph thread_id
  target_path TEXT NOT NULL,        -- absolute path to consumer repo
  prop_id     TEXT NOT NULL,
  status      TEXT NOT NULL,        -- pending | validated | rejected
  rejection   TEXT,                 -- reason when status=rejected
  glb_path    TEXT,                 -- set when validated
  tri_count   INTEGER,
  tri_budget  INTEGER,
  started_at  TEXT NOT NULL,
  ended_at    TEXT                  -- null while pending
);
CREATE INDEX idx_runs_target ON runs(target_path);
CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_runs_started ON runs(started_at);
```

The `run_id` is a UUID v4 generated at the start of each invocation and used as the LangGraph `thread_id`, so checkpoint rows and run rows join naturally on `run_id == thread_id`.

### Run lifecycle

1. `pnpm foundry asset:generate` mints a `run_id`, inserts a `runs` row with `status='pending'`, hands the `thread_id` to the graph.
2. LangGraph's checkpointer writes a `checkpoints` row at each node transition.
3. On graph completion, the script updates the `runs` row to `status='validated'` (or `'rejected'` with reason) and stamps `ended_at`.
4. `foundry run:status <run_id>` reads the latest checkpoint (current node, partial state) plus the `runs` row.
5. `foundry run:resume <run_id>` re-invokes the graph with the same `thread_id`; LangGraph picks up from the latest checkpoint.

A run that crashes mid-pipeline leaves the `runs` row at `status='pending'` and the `checkpoints` table at the last successful node. `run:resume` is the recovery primitive.

### Retention

No automatic retention in Phase 2 — runs accumulate. SQLite handles millions of rows without sweat for our use case, and stale runs are useful for forensics. Phase 3+ may add `foundry run:prune --older-than 30d` if the DB ever gets unwieldy.

### Concurrency

SQLite WAL mode supports many readers + one writer. The CLI and MCP service can run concurrently as long as only one is writing at a time. The MCP service holds the write lock for the duration of a generate. If a second writer tries (rare in practice for a solo dev), it blocks briefly. Deadlock-prone scenarios (two long writers on different rows) don't apply to our workload.

### Interface

Implementation in `src/state/checkpointer.ts`:

```ts
export class SQLiteCheckpointer extends BaseCheckpointSaver { /* ... */ }
export interface RunRow { /* mirrors the runs table */ }
export class RunStore {
  insertPending(run: RunRow): void;
  updateValidated(runId: string, glbPath: string, triCount: number, triBudget: number): void;
  updateRejected(runId: string, reason: string): void;
  list(filter?: { target?: string; status?: string; limit?: number }): RunRow[];
  get(runId: string): RunRow | null;
}
export function createStateStore(): { checkpointer: SQLiteCheckpointer; runs: RunStore };
```

`createStateStore()` is the single entrypoint; callers don't construct `SQLiteCheckpointer` or `RunStore` directly. This keeps the swap-to-Postgres path tight: future `createStateStore` reads `$FOUNDRY_STATE_BACKEND` (default `sqlite`) and dispatches.

## Consequences

### Gains

- Resumability for free at the LangGraph layer.
- `foundry run:list / run:status` answer in milliseconds via the `runs` index without inspecting checkpoint blobs.
- MCP service (Phase 3) gets a real `run_id` to return immediately on `foundry.asset.generate`, with `notifications/progress` driven by checkpoint writes.
- Browser UI (Phase 4) can render history and live state via the same store.
- Per-host state means a developer's runs follow their machine; no leakage between dev environments.
- Postgres swap is a single class replacement.

### Costs

- One native dependency (`better-sqlite3`). Build complexity on exotic platforms (raspberry pi etc.) — not our deployment surface.
- The DB file accumulates indefinitely. Acceptable now; deferred cleanup is Phase 3+.
- A run row at `status='pending'` after a crash is indistinguishable from a run that's actively executing in another process. We accept this — `foundry run:status` reports timestamps, and `run:resume` is idempotent.

### Neutral

- The schema mirrors blogengine's checkpointer for the `checkpoints` table verbatim. The `runs` table is asset-foundry-specific.
- The `runs` table denormalizes data also present in checkpoint blobs (target_path, prop_id, glb_path). Acceptable trade for query speed; the source of truth is the checkpoint, the `runs` row is an index.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Postgres from day one (cv-builder pattern) | Solo dev. Daemon to manage. No multi-host need. Migration path stays open. |
| In-memory checkpointer (`MemorySaver` from LangGraph) | Loses everything on restart. Defeats the point. |
| File-per-run JSON checkpoints | Scales badly past hundreds of runs; query layer becomes ad-hoc. |
| One unified table (no separate `runs` index) | Forces every `run:list` to parse JSON blobs to extract status; slow at scale. |
| DB co-located with target (`<target>/asset-foundry/state.sqlite`) | Per-target state when run history conceptually belongs to the developer; would multiply DB files unnecessarily. |
| Per-developer state under `<target>` | Cross-target queries become impossible. |

## Open items (Phase 3+)

- `foundry run:prune` retention policy and its default cutoff.
- `putWrites` is currently a no-op (matches blogengine). Decide whether asset-foundry needs intermediate-write durability or whether per-node checkpointing is sufficient.
- Concurrent multi-target runs — confirmed safe per WAL semantics, but stress-test once the MCP service can spawn multiple simultaneously.
- Postgres backend implementation — when (if) we need multi-host concurrency.
