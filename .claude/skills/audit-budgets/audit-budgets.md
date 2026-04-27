---
name: audit-budgets
description: Walk every dist/*.validation.json, compare tri_count vs the manifest's tri_budget, and flag drift, over-budget, or wildly under-utilised assets. Triggers on "audit budgets", "tri budget check", "asset budget review".
---

# /audit-budgets — Tri-budget reconciliation

The manifest declares a `tri_budget` per prop; the Validator records the actual `tri_count` per generation. Over time those drift. This skill is the rolling check.

Arguments: `$ARGUMENTS` — none, or `--threshold=<percent>` to tune the under-utilisation flag (default 25%).

## Steps

1. Load `manifest/world.yaml` via `pnpm validate:manifest` — bail if the manifest itself doesn't validate.
2. Glob `dist/*.validation.json`. For each, parse:
   - `asset_id`
   - `tri_count`
   - `tri_budget` (echoed by the Validator)
   - `status`
3. For each manifest prop:
   - **Missing artefact** → no `<id>_v1.validation.json`: surface as "never generated".
   - **Status not `validated`** → surface the `rejection_reason`.
   - **Tri budget mismatch** between manifest and validation file → suggests the manifest was edited but the asset wasn't regenerated; recommend `/regen-asset <id>`.
   - **`tri_count > tri_budget`** → over budget; this should never happen if the Validator did its job, but flag loudly.
   - **`tri_count < threshold% of tri_budget`** → under-utilised; suggest tightening the budget so future drift gets caught earlier. (For Phase 0 fixtures this is fine; for Phase 2+ LLM-authored scripts it matters.)
4. Report in a small table:
   ```
   id                       status      tris       budget   util   note
   birch_sapling            validated   80         600      13%    under-utilised; consider lowering to 200
   ground_pond_meadow       validated   1152       1200     96%    healthy
   beaver_basic             validated   360        400      90%    healthy
   ```
5. If any over-budget or drift cases: list the exact `pnpm gen-asset` commands to fix, in order.

## Tuning the budgets

A budget is wrong if either:
- The fixture has been stable but the budget is >2× the actual count (under-utilised).
- The LLM path consistently bumps against it (signal to widen the budget — but only after reviewing the bpy script for unnecessary subdivisions).

When updating budgets, edit `manifest/world.yaml` and re-run `pnpm validate:manifest` + `/audit-budgets`. Don't forget to commit the manifest change.

## Output mode

Default: terse table + `pnpm gen-asset` follow-ups.
With `--verbose`: include bounding boxes, blender_version, and `generated_at` per artefact (useful when debugging visual regression).

## See also

- `manifest/schema.ts` — the budget field's Zod constraint.
- `src/validator/index.ts` — what the Validator writes into `<id>_v1.validation.json`.
- `decisions/adr/0004-narrow-subagent-boundaries.md` — why Validator is deterministic, not an agent.
