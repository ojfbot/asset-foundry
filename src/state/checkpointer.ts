// Persistent state store (ADR-0008). Two responsibilities:
//   1. SQLiteCheckpointer  — LangGraph BaseCheckpointSaver impl. Stores per-step
//      graph state so a killed run can resume via `foundry run:resume`.
//   2. RunStore             — asset-foundry-specific index of one row per run.
//      Powers `foundry run:list / run:status` without forcing a JSON parse of
//      every checkpoint blob.
//
// Both share one DB file at $FOUNDRY_STATE_DIR/runs.sqlite (default
// ~/.asset-foundry/state/runs.sqlite).
//
// SQLiteCheckpointer is adapted from blogengine/packages/agent-graph/src/state/
// checkpointer.ts. RunStore is asset-foundry-specific.
//
// Postgres backend swap: `createStateStore` reads $FOUNDRY_STATE_BACKEND if we
// later need it. For now, sqlite is the only branch.
import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointMetadata,
  type CheckpointTuple,
} from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

interface CheckpointRow {
  thread_id: string;
  thread_ts: string;
  parent_ts: string | null;
  checkpoint: string;
  metadata: string;
}

export class SQLiteCheckpointer extends BaseCheckpointSaver {
  private db: Database.Database;

  constructor(db: Database.Database) {
    super();
    this.db = db;
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const cfg = config.configurable ?? {};
    const thread_id = cfg["thread_id"] as string | undefined;
    const thread_ts = cfg["thread_ts"] as string | undefined;
    if (!thread_id) return undefined;

    const row = thread_ts
      ? (this.db
          .prepare("SELECT * FROM checkpoints WHERE thread_id = ? AND thread_ts = ? LIMIT 1")
          .get(thread_id, thread_ts) as CheckpointRow | undefined)
      : (this.db
          .prepare("SELECT * FROM checkpoints WHERE thread_id = ? ORDER BY thread_ts DESC LIMIT 1")
          .get(thread_id) as CheckpointRow | undefined);

    if (!row) return undefined;

    return {
      config: { configurable: { thread_id: row.thread_id, thread_ts: row.thread_ts } },
      checkpoint: JSON.parse(row.checkpoint) as Checkpoint,
      metadata: JSON.parse(row.metadata) as CheckpointMetadata,
      parentConfig: row.parent_ts
        ? { configurable: { thread_id: row.thread_id, thread_ts: row.parent_ts } }
        : undefined,
    };
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: Parameters<BaseCheckpointSaver["put"]>[3],
  ): Promise<RunnableConfig> {
    const cfg = config.configurable ?? {};
    const thread_id = cfg["thread_id"] as string | undefined;
    if (!thread_id) throw new Error("thread_id required to save checkpoint");

    const thread_ts = new Date().toISOString();
    const parent_ts = (cfg["thread_ts"] as string | undefined) ?? null;

    this.db
      .prepare(
        `INSERT OR REPLACE INTO checkpoints (thread_id, thread_ts, parent_ts, checkpoint, metadata)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(thread_id, thread_ts, parent_ts, JSON.stringify(checkpoint), JSON.stringify(metadata));

    return { configurable: { thread_id, thread_ts } };
  }

  async *list(config: RunnableConfig): AsyncGenerator<CheckpointTuple> {
    const cfg = config.configurable ?? {};
    const thread_id = cfg["thread_id"] as string | undefined;
    if (!thread_id) return;

    const rows = this.db
      .prepare("SELECT * FROM checkpoints WHERE thread_id = ? ORDER BY thread_ts DESC")
      .all(thread_id) as CheckpointRow[];

    for (const row of rows) {
      yield {
        config: { configurable: { thread_id: row.thread_id, thread_ts: row.thread_ts } },
        checkpoint: JSON.parse(row.checkpoint) as Checkpoint,
        metadata: JSON.parse(row.metadata) as CheckpointMetadata,
        parentConfig: row.parent_ts
          ? { configurable: { thread_id: row.thread_id, thread_ts: row.parent_ts } }
          : undefined,
      };
    }
  }

  async putWrites(
    _config: RunnableConfig,
    _writes: Parameters<BaseCheckpointSaver["putWrites"]>[1],
    _taskId: string,
  ): Promise<void> {
    // Intermediate writes not persisted — per-node checkpointing covers our use
    // case. ADR-0008 leaves this as a Phase 3+ open item.
  }
}

export type RunStatus = "pending" | "validated" | "rejected";

export interface RunRow {
  run_id: string;
  target_path: string;
  prop_id: string;
  status: RunStatus;
  rejection: string | null;
  glb_path: string | null;
  tri_count: number | null;
  tri_budget: number | null;
  started_at: string;
  ended_at: string | null;
}

export interface RunListFilter {
  target?: string;
  status?: RunStatus;
  limit?: number;
}

export class RunStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  insertPending(row: Pick<RunRow, "run_id" | "target_path" | "prop_id" | "started_at">): void {
    this.db
      .prepare(
        `INSERT INTO runs (run_id, target_path, prop_id, status, started_at)
         VALUES (?, ?, ?, 'pending', ?)`,
      )
      .run(row.run_id, row.target_path, row.prop_id, row.started_at);
  }

  updateValidated(runId: string, glbPath: string, triCount: number, triBudget: number): void {
    this.db
      .prepare(
        `UPDATE runs SET status = 'validated', glb_path = ?, tri_count = ?, tri_budget = ?, ended_at = ?
         WHERE run_id = ?`,
      )
      .run(glbPath, triCount, triBudget, new Date().toISOString(), runId);
  }

  updateRejected(runId: string, reason: string): void {
    this.db
      .prepare(
        `UPDATE runs SET status = 'rejected', rejection = ?, ended_at = ? WHERE run_id = ?`,
      )
      .run(reason, new Date().toISOString(), runId);
  }

  list(filter: RunListFilter = {}): RunRow[] {
    const where: string[] = [];
    const args: unknown[] = [];
    if (filter.target) {
      where.push("target_path = ?");
      args.push(filter.target);
    }
    if (filter.status) {
      where.push("status = ?");
      args.push(filter.status);
    }
    const sql =
      "SELECT * FROM runs" +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
      " ORDER BY started_at DESC" +
      (filter.limit ? ` LIMIT ${Math.max(1, Math.floor(filter.limit))}` : "");
    return this.db.prepare(sql).all(...args) as RunRow[];
  }

  get(runId: string): RunRow | null {
    const row = this.db.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId) as RunRow | undefined;
    return row ?? null;
  }
}

export interface StateStore {
  checkpointer: SQLiteCheckpointer;
  runs: RunStore;
  dbPath: string;
  close(): void;
}

function resolveStateDir(): string {
  const explicit = process.env["FOUNDRY_STATE_DIR"];
  if (explicit) return resolve(explicit);
  return join(homedir(), ".asset-foundry", "state");
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      thread_id  TEXT NOT NULL,
      thread_ts  TEXT NOT NULL,
      parent_ts  TEXT,
      checkpoint TEXT NOT NULL,
      metadata   TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (thread_id, thread_ts)
    );
    CREATE INDEX IF NOT EXISTS idx_cp_thread ON checkpoints(thread_id);

    CREATE TABLE IF NOT EXISTS runs (
      run_id      TEXT PRIMARY KEY,
      target_path TEXT NOT NULL,
      prop_id     TEXT NOT NULL,
      status      TEXT NOT NULL,
      rejection   TEXT,
      glb_path    TEXT,
      tri_count   INTEGER,
      tri_budget  INTEGER,
      started_at  TEXT NOT NULL,
      ended_at    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_runs_target  ON runs(target_path);
    CREATE INDEX IF NOT EXISTS idx_runs_status  ON runs(status);
    CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);
  `);
}

export function createStateStore(): StateStore {
  const stateDir = resolveStateDir();
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  const dbPath = join(stateDir, "runs.sqlite");
  if (!existsSync(dirname(dbPath))) mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  initSchema(db);
  return {
    checkpointer: new SQLiteCheckpointer(db),
    runs: new RunStore(db),
    dbPath,
    close: () => db.close(),
  };
}
