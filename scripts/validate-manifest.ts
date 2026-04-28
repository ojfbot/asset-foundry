// Schema-only manifest check (Phase 0 CI gate). Verifies the target's world.yaml
// parses against the Zod schema. Heavier validators (tri budgets, perceptual diffs)
// run as part of `pnpm gen-asset` and live in scripts/validate.ts.
//
// Usage: pnpm validate:manifest [--target <path>]
import { loadTarget } from "../src/targets/loader";

const argv = process.argv.slice(2);
let targetPath: string | undefined;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--target") targetPath = argv[++i];
}

try {
  const target = loadTarget(targetPath);
  const m = target.manifest;
  console.log(
    `✓ manifest valid: ${m.props.length} props, ${m.biomes.length} biomes (${target.manifestPath})`
  );
  process.exit(0);
} catch (err) {
  console.error("✗ manifest invalid:", err instanceof Error ? err.message : err);
  process.exit(1);
}
