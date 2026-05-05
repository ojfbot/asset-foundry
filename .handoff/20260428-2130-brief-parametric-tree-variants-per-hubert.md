---
id: 20260428-2130-brief-parametric-tree-variants-per-hubert
type: brief
title: "Parametric tree variants — Hubert-style proceduralism in the foundry"
actor: code-claude
to: code-claude
session_id: 2026-04-28T21:30:00Z
refs:
  - file:fixtures/birch_sapling.py
  - file:fixtures/_lib.py
  - file:manifest/world.yaml
  - file:manifest/schema.ts
  - file:src/orchestrator/nodes/asset-sculptor.ts
  - file:src/handlers.ts
  - bead:20260428-2200-report-platformization-phases-0-through-4-shipped
  - github:ojfbot/beaverGame (consumer)
hook: foundry-tree-variants
status: live
created_at: 2026-04-28T21:30:00Z
labels:
  project: cozy-beaver
  repo: asset-foundry
  phase: 5
---

## Context

The foundry has just shipped Phases 0–4.2 (per `bead:20260428-2200-report-platformization-phases-0-through-4-shipped`): it is now a portable MCP service with three transports and a Frame MF browser app. The asset-generation contract is unchanged — per-prop fixtures in `<target>/asset-foundry/fixtures/<prop_id>.py`, `pnpm gen-asset <id>` runs the orchestrator (WorldDesigner → AssetSculptor → MaterialArtist → SceneAssembler → Validator), and successful runs auto-sync `<prop>_v1.glb` + `.validation.json` to the consumer's `public/assets/`.

Today the consumer (beaverGame) loads exactly **one** `birch_sapling_v1.glb` and clones it 70 times into the world. With renderer migration to Babylon.js underway (see `bead:20260428-2130-brief-migrate-renderer-to-babylon-js` in beaverGame), the foundry side has an opportunity to deliver real visual variety without depending on which engine renders the result. Per **Ian Hubert's parametric-variation philosophy**: don't sculpt unique trees — parameterize one base and generate many.

The tree-variant work is a sibling stream, not a blocker for the Babylon migration. The migration succeeds with the existing single birch. This brief delivers the variety win that was scoped in the discarded plan at `/Users/yuri/.claude/plans/use-all-relevant-ojfbot-toasty-haven.md`. Scope below is conservative; treat it as the recipe, not a contract.

## Goal

Ship 5–6 parametric birch variants and one alternate species (pine), produced by the existing offline-fixture pipeline, validated by the existing Validator, auto-synced to beaverGame's `public/assets/`. The consumer (whether Three.js or Babylon.js) will pick one variant per scattered tree at scene-compose time.

## Acceptance criteria

- [ ] `<target>/asset-foundry/fixtures/_birch.py` exists — a parametric library exposing `make_birch(*, height, base_r, top_r, sway, leaf_top_z, leaf_radius, leaf_height, leaf_clusters, leaf_color, trunk_color)`.
- [ ] `<target>/asset-foundry/fixtures/birch_sapling.py` is refactored to a thin wrapper around `_birch.make_birch()` with **defaults that produce a byte-identical .glb to the existing fixture** (so existing consumers don't break).
- [ ] Four new birch variant fixtures exist, each a 5–10-line wrapper with distinct parameters:
  - `birch_tall.py` — `height=2.4, leaf_radius=0.55, leaf_clusters=5`
  - `birch_bent.py` — `height=1.8, sway=0.18`
  - `birch_young.py` — `height=1.2, leaf_radius=0.35, leaf_clusters=3`
  - `birch_yellow.py` — `height=1.7, leaf_color=(0.74, 0.69, 0.31, 1.0)` (autumn)
- [ ] One alternate species fixture: `pine_sapling.py` — cone-stack foliage (3–4 stacked triangle prisms instead of triangle leaf clusters), darker trunk, ~80 lines new code reusing `add_trunk` skeleton.
- [ ] Five new prop entries in `<target>/asset-foundry/world.yaml`, each with `category: vegetation`, `tri_budget: 600`, `biomes: [pond_meadow]`, distinct `style_anchors`, and the existing schema fields populated.
- [ ] `pnpm gen-asset <prop_id>` completes for each of the five new props with `status: "validated"` in the sibling `.validation.json`.
- [ ] `tri_count <= tri_budget` for every variant.
- [ ] All variants visible in the Frame MF Dashboard if it surfaces per-prop status (per the platformization report).
- [ ] Auto-sync to `<beaverGame>/public/assets/` succeeds; both `.glb` and `.validation.json` are present.

## Constraints

- **No new schema fields.** The exploration confirmed the existing `PropSchema` covers everything needed. New variants are new prop entries; `variants:` field count stays correct or doesn't matter for offline-fixture flow.
- **Determinism.** `_lib.fresh_scene(asset_id)` already seeds bpy's RNG per `asset_id`. Variants must reproduce byte-identically across reruns (per ADR-0002 / AF-002 if that's still tracked). Don't introduce wall-clock time, hash-of-string randomness, or anything else that breaks determinism.
- **sRGB-aware vertex colours.** Continue to use `_lib.assign_vertex_colors()` (which converts sRGB → linear before writing to glTF's COLOR_0). Don't bypass it.
- **No LLM calls in the offline path.** `AssetSculptor` already detects `<target>/asset-foundry/fixtures/<prop_id>.py` and skips Claude when present (see `src/orchestrator/nodes/asset-sculptor.ts:71–74`). Verify your new fixtures land on disk before generation.
- **Cozy register stays.** Trees should read at the existing silhouette scale and palette family. The `birch_yellow` autumn variant is the boldest colour push allowed; don't take it further.
- **No texture work.** Hubert's photogrammetry/projection pipeline doesn't apply to vertex-colour-only assets. We borrow only his parametric-variation philosophy.

## References (read before starting)

- `<target>/asset-foundry/fixtures/birch_sapling.py` — the existing 97-line script. `add_trunk()` and `add_foliage()` are the two functions to lift into `_birch.make_birch(...)`.
- `<target>/asset-foundry/fixtures/_lib.py` — `assign_vertex_colors()` at lines 127–141, `fresh_scene()` + `parse_argv()` at lines 45–58. Use these for every fixture.
- `<target>/asset-foundry/world.yaml` — the existing `birch_sapling` entry to mirror.
- `manifest/schema.ts` — Zod schema definitions; lines 17–35 cover the prop shape.
- `src/orchestrator/nodes/asset-sculptor.ts:71–74` — fixture detection logic; confirms offline mode bypass.
- `src/handlers.ts:155–161` — the `gen-asset` handler's auto-sync to consumer's `publicAssetsDir`.
- `bead:20260428-2200-report-platformization-phases-0-through-4-shipped` — the most recent foundry report; gives full context on the new MCP service architecture.

## Strategy suggestions (non-binding)

- **Refactor first, parametrize second.** Land the `_birch.py` library + `birch_sapling.py` byte-identical wrapper as one PR. Verify the existing consumer (whatever the renderer is by then) renders unchanged. THEN open the variants PR.
- **One generation per variant.** `pnpm gen-asset birch_tall && pnpm gen-asset birch_bent && ...`. Don't try to batch the sub-process.
- **Test the consumer side last.** Once all five variants have validation manifests, hand off to the consumer side (beaverGame) to actually load them. That work belongs in beaverGame's brief — leave a `discovery` bead noting which variants exist if their consumption is later.
- **Pine_sapling can be deferred** if scope creeps. Five birches alone produce enough variety that the forest reads as differentiated. Pine is the species-diversity stretch goal.

## Flag back to chat-claude

- If the platformized foundry's MCP transports change the `gen-asset` invocation form (e.g. it's now `pnpm foundry asset:generate <id>` instead of `pnpm gen-asset <id>`), use whatever the platformized form is and note the discrepancy in the report.
- If `_birch.py` introduces a Python import surface the AssetSculptor node doesn't expose to bpy (e.g. fixtures previously couldn't import from sibling modules), capture as a `discovery` bead and surface — that's a foundry-platform issue, not a fixture issue.
- If the determinism guarantee (byte-identical .glb across reruns) breaks because of how Blender exports the new variants, STOP and write a `decision` bead. Determinism is the foundation of AF-002 and the consumer-side validator's `status: "validated"` semantics; don't break it without explicit sign-off.

## After execution

Write a `report` bead responding to this brief. Include:

- The 5 (or 6 with pine) variants generated, their tri-counts, and their validation status
- The path the auto-sync took (foundry dist → beaverGame public/assets)
- Whether the cross-repo cycle worked as expected (the consumer-side renderer happily loaded each variant) or surfaced friction
- A note in `<target>/asset-foundry/CLAUDE.md` (if appropriate) capturing the parametric-fixtures pattern as a reusable recipe for future asset families (rocks, mushrooms, beaver-house components, etc.)
