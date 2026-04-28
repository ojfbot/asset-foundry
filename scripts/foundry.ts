// CLI: pnpm foundry <subcommand> [...args]
//
// Phase 2/3/4 dispatcher. Each subcommand is a thin wrapper around a pure
// handler in src/handlers.ts. The MCP server (src/mcp/server.ts) wraps the
// same handlers as MCP tools — single code path, three front doors:
//   pnpm foundry <verb>          → CLI
//   pnpm foundry mcp             → stdio MCP server (ADR-0009)
//   pnpm foundry mcp-http        → HTTP+SSE MCP server (ADR-0010)
import { Command } from "commander";
import * as h from "../src/handlers";
import { createStateStore } from "../src/state/checkpointer";
import { startMcpServer, startHttpMcpServer } from "../src/mcp/server";

const program = new Command();
program
  .name("foundry")
  .description("Asset-foundry platform CLI (ADR-0006/0007/0008/0009/0010).")
  .version("0.4.0");

// ─── asset:generate ────────────────────────────────────────────────────────

program
  .command("asset:generate")
  .description("Generate an asset for a prop in the target's manifest.")
  .argument("<prop_id>")
  .option("-t, --target <path>", "consumer game repo path (or set $FOUNDRY_TARGET)")
  .option("--resume <run_id>", "resume a crashed run instead of starting fresh")
  .action(async (propId: string, opts: { target?: string; resume?: string }) => {
    const store = createStateStore();
    try {
      if (opts.resume) {
        console.log(`▶ resuming run ${opts.resume}`);
      } else {
        console.log(`▶ generating ${propId} (target: ${opts.target ?? "$FOUNDRY_TARGET"})`);
      }
      const result = await h.assetGenerate(store, {
        propId,
        targetPath: opts.target,
        resumeRunId: opts.resume,
      });
      if (result.status === "rejected") {
        console.error(`✗ run ${result.runId}: rejected — ${result.rejection}`);
        process.exit(1);
      }
      console.log(
        `✓ run ${result.runId}: ${result.glbPath} validated (${result.triCount}/${result.triBudget} tris)`,
      );
      if (result.syncedTo) console.log(`→ synced to ${result.syncedTo}/`);
    } finally {
      store.close();
    }
  });

// ─── asset:list ────────────────────────────────────────────────────────────

program
  .command("asset:list")
  .description("List generated assets in a target's dist/ directory.")
  .option("-t, --target <path>", "consumer game repo path")
  .action((opts: { target?: string }) => {
    const result = h.assetList({ targetPath: opts.target });
    if (result.assets.length === 0) {
      console.log(`(no assets in ${result.outputDir})`);
      return;
    }
    console.log(`assets in ${result.outputDir}:`);
    for (const a of result.assets) {
      const mark = a.status === "validated" ? "✓" : "✗";
      console.log(`  ${mark}  ${a.assetId.padEnd(28)}  ${a.triCount}/${a.triBudget} tris  ${a.status}`);
    }
  });

// ─── target:list ───────────────────────────────────────────────────────────

program
  .command("target:list")
  .description("Enumerate sibling repos that look like targets (have an asset-foundry/ dir).")
  .option("--root <path>", "directory to scan for siblings (default: parent of cwd)")
  .action((opts: { root?: string }) => {
    const result = h.targetList({ rootPath: opts.root });
    if (result.targets.length === 0) {
      console.log(`(no targets found under ${result.rootPath})`);
      return;
    }
    console.log(`targets under ${result.rootPath}:`);
    for (const t of result.targets) {
      if (t.valid) {
        console.log(`  ${t.path}  (${t.propCount} props, ${t.biomeCount} biomes)`);
      } else {
        console.log(`  ${t.path}  (invalid: ${t.error})`);
      }
    }
  });

// ─── target:scaffold ───────────────────────────────────────────────────────

program
  .command("target:scaffold")
  .description("Scaffold a new <path>/asset-foundry/ from templates/.")
  .argument("<name>", "target name (becomes the directory name when --path is omitted)")
  .option("-p, --path <path>", "absolute or relative directory to scaffold into (default: ../<name>)")
  .action((name: string, opts: { path?: string }) => {
    const result = h.targetScaffold({ name, path: opts.path });
    console.log(`✓ scaffolded ${result.destPath}`);
    console.log(`  files: ${result.filesWritten.length}`);
    console.log(`  next: edit world.yaml then run pnpm foundry asset:generate <prop_id> --target ${result.destPath.replace(/\/asset-foundry$/, "")}`);
  });

// ─── target:validate ───────────────────────────────────────────────────────

program
  .command("target:validate")
  .description("Zod-validate a target's manifest.")
  .option("-t, --target <path>", "consumer game repo path")
  .action((opts: { target?: string }) => {
    const result = h.targetValidate({ targetPath: opts.target });
    if (!result.valid) {
      console.error(`✗ ${result.error}`);
      process.exit(1);
    }
    console.log(
      `✓ manifest valid: ${result.propCount} props, ${result.biomeCount} biomes (${result.manifestPath})`,
    );
  });

// ─── manifest:read ─────────────────────────────────────────────────────────

program
  .command("manifest:read")
  .description("Read and print the parsed manifest for a target (JSON).")
  .option("-t, --target <path>", "consumer game repo path")
  .action((opts: { target?: string }) => {
    const result = h.manifestRead({ targetPath: opts.target });
    console.log(JSON.stringify(result, null, 2));
  });

// ─── run:list ──────────────────────────────────────────────────────────────

program
  .command("run:list")
  .description("List recent runs from the state DB.")
  .option("-t, --target <path>", "filter by target path (resolved to absolute)")
  .option("-s, --status <status>", "filter by status (pending|validated|rejected)")
  .option("-l, --limit <n>", "limit rows (default 20)", "20")
  .action((opts: { target?: string; status?: string; limit?: string }) => {
    const store = createStateStore();
    try {
      const rows = h.runList(store, {
        targetPath: opts.target,
        status: opts.status as h.RunListArgs["status"],
        limit: parseInt(opts.limit ?? "20", 10),
      });
      if (rows.length === 0) {
        console.log("(no runs)");
        return;
      }
      for (const r of rows) {
        const tris = r.tri_count != null ? `${r.tri_count}/${r.tri_budget}` : "—";
        console.log(
          `${r.run_id}  ${r.status.padEnd(10)}  ${r.prop_id.padEnd(20)}  ${tris.padEnd(10)}  ${r.started_at}  ${r.target_path}`,
        );
      }
    } finally {
      store.close();
    }
  });

// ─── run:status ────────────────────────────────────────────────────────────

program
  .command("run:status")
  .description("Show details for one run, including the latest checkpoint's currentNode.")
  .argument("<run_id>")
  .action(async (runId: string) => {
    const store = createStateStore();
    try {
      const row = await h.runStatus(store, { runId });
      console.log(`run_id:      ${row.run_id}`);
      console.log(`status:      ${row.status}`);
      console.log(`target:      ${row.target_path}`);
      console.log(`prop_id:     ${row.prop_id}`);
      console.log(`started_at:  ${row.started_at}`);
      if (row.ended_at) console.log(`ended_at:    ${row.ended_at}`);
      if (row.tri_count != null) console.log(`tris:        ${row.tri_count}/${row.tri_budget}`);
      if (row.glb_path) console.log(`glb_path:    ${row.glb_path}`);
      if (row.rejection) console.log(`rejection:   ${row.rejection}`);
      if (row.lastNode) console.log(`last_node:   ${row.lastNode}`);
      if (row.lastTimestamp) console.log(`last_ts:     ${row.lastTimestamp}`);
    } finally {
      store.close();
    }
  });

// ─── run:resume ────────────────────────────────────────────────────────────

program
  .command("run:resume")
  .description("Re-invoke the graph for a run from its latest checkpoint.")
  .argument("<run_id>")
  .action(async (runId: string) => {
    const store = createStateStore();
    try {
      console.log(`▶ resuming run ${runId}`);
      const result = await h.assetGenerate(store, { resumeRunId: runId });
      if (result.status === "rejected") {
        console.error(`✗ run ${result.runId}: rejected — ${result.rejection}`);
        process.exit(1);
      }
      console.log(
        `✓ run ${result.runId}: ${result.glbPath} validated (${result.triCount}/${result.triBudget} tris)`,
      );
      if (result.syncedTo) console.log(`→ synced to ${result.syncedTo}/`);
    } finally {
      store.close();
    }
  });

// ─── mcp ───────────────────────────────────────────────────────────────────

program
  .command("mcp")
  .description("Start the MCP server over stdio (ADR-0009). Long-running.")
  .action(async () => {
    await startMcpServer();
  });

// ─── mcp-http ──────────────────────────────────────────────────────────────

program
  .command("mcp-http")
  .description("Start the MCP server over HTTP+SSE on 127.0.0.1 (ADR-0010). Long-running.")
  .option("-p, --port <port>", "TCP port (default 3036 or $FOUNDRY_HTTP_PORT)")
  .option("--host <host>", "bind host (default 127.0.0.1; do not change without an auth ADR)")
  .action(async (opts: { port?: string; host?: string }) => {
    await startHttpMcpServer({
      port: opts.port ? parseInt(opts.port, 10) : undefined,
      host: opts.host,
    });
  });

await program.parseAsync(process.argv);
