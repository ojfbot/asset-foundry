// Schema-only manifest check (Phase 0 CI gate). Verifies world.yaml parses
// against the Zod schema. Heavier validators (tri budgets, perceptual diffs)
// run as part of `pnpm gen-asset` and live elsewhere.
import { loadManifest } from "../manifest/load";

try {
  const m = loadManifest();
  console.log(`✓ manifest valid: ${m.props.length} props, ${m.biomes.length} biomes`);
  process.exit(0);
} catch (err) {
  console.error("✗ manifest invalid:", err instanceof Error ? err.message : err);
  process.exit(1);
}
