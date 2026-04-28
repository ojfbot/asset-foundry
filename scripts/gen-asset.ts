// CLI: pnpm gen-asset <prop_id> --target <path>
//
// Phase 2: this script remains as a thin alias to `pnpm foundry asset:generate`.
// New work should target scripts/foundry.ts; the alias exists so existing CI and
// scripted callers keep working through the migration. Will be removed in Phase 3
// once the foundry CLI is the documented entrypoint everywhere.
import { spawn } from "node:child_process";
import { join } from "node:path";

const args = ["asset:generate", ...process.argv.slice(2)];
const child = spawn("tsx", [join(import.meta.dirname, "foundry.ts"), ...args], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
