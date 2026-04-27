// Aggregate validator: schema + every committed .validation.json under dist/.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadManifest } from "../manifest/load";

let failed = 0;

try {
  const m = loadManifest();
  console.log(`✓ manifest schema ok (${m.props.length} props)`);
} catch (err) {
  console.error("✗ manifest invalid:", err instanceof Error ? err.message : err);
  process.exit(1);
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".validation.json")) out.push(p);
  }
  return out;
}

const reports = walk(join(process.cwd(), "dist"));
if (reports.length === 0) {
  console.warn("(no .validation.json files yet — run pnpm gen-asset)");
  process.exit(0);
}

for (const r of reports) {
  const data = JSON.parse(readFileSync(r, "utf8"));
  if (data.status !== "validated") {
    console.error(`✗ ${r}: ${data.status} — ${data.rejection_reason ?? "no reason"}`);
    failed++;
    continue;
  }
  if (data.tri_count > data.tri_budget) {
    console.error(`✗ ${r}: over budget ${data.tri_count}/${data.tri_budget}`);
    failed++;
    continue;
  }
  console.log(`✓ ${data.asset_id} (${data.tri_count}/${data.tri_budget} tris)`);
}

process.exit(failed === 0 ? 0 : 1);
