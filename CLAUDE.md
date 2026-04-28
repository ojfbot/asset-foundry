# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A portable AI-driven asset pipeline. World manifest in YAML → LangGraph orchestrator with four narrow sub-agents → Blender (subprocess) → deterministic Validator → glTF binary. **Asset-foundry owns no game data** (ADR-0006): a "target" is a path to an external sibling repo (e.g. [`../beaverGame/`](../beaverGame)) that owns its own manifest, fixtures, palettes, and dist directory. The pipeline is being grown into a persistent MCP service with CLI / Frame MF / Blender-plugin surfaces — see `/Users/yuri/.claude/plans/i-have-big-plans-curious-kernighan.md` for the full plan.

**First read for new sessions:** `domain-knowledge/frame-os-context.md`, then `domain-knowledge/langgraph-patterns.md`, then this repo's `decisions/adr/` (especially 0006 and 0007 for the platformization).

## Architecture (the big picture)

The pipeline is a **LangGraph state machine** with four LLM sub-agents and one deterministic validator. Each node has a strict, non-overlapping tool surface (see ADR-0004). The orchestration graph wires them together; every node receives a `TargetContext` carrying the resolved target's paths and parsed manifest.

```
<target>/asset-foundry/world.yaml      ← Zod-validated single source of truth
       │
       ▼  (loadTarget resolves --target / $FOUNDRY_TARGET / Phase-0 fallback)
 WorldDesigner    (only writer to manifest; no Blender)
       │
       ▼
 AssetSculptor    (LLM → bpy script; offline fallback uses <target>/asset-foundry/fixtures/<id>.py)
       │
       ▼
 MaterialArtist   (palette → material plan; reads <target>/asset-foundry/palettes.yaml)
       │
       ▼
 SceneAssembler   (spawns Blender; writes <target>/asset-foundry/dist/<id>_v1.glb)
       │
       ▼
 Validator        (deterministic TS — tri budget, summary JSON, writes .validation.json)
       │
       ▼ (auto-synced by gen-asset.ts)
 <target>/public/assets/
```

Code paths (platform side):
- `manifest/schema.ts` — Zod schema. The contract WorldDesigner cannot violate. Game-agnostic (ADR-0007).
- `manifest/load.ts` — `findProp(manifest, id)` helper. Manifest *loading* now lives in the target loader.
- `src/targets/loader.ts` — `loadTarget(targetPath?)` returns a `TargetContext` ({manifest, fixturesDir, outputDir, scriptsDir, palettes, publicAssetsDir}). Resolution: explicit arg → `$FOUNDRY_TARGET` → `../beaverGame` (Phase 0 fallback only).
- `src/orchestrator/state.ts` — LangGraph `Annotation.Root` state, including `target: TargetContext | null`. Pattern adapted from `cv-builder/packages/agent-graph/src/state/schema.ts` (ADR-0005).
- `src/orchestrator/graph.ts` — `buildGraph({propId})` returns a compiled graph. Edges: START → world_designer → asset_sculptor → material_artist → scene_assembler → validator → END.
- `src/orchestrator/llm.ts` — Anthropic SDK client wrapper. **Prompt caching enabled by default** via `cache_control: ephemeral` on the system block. Model: `claude-sonnet-4-20250514`.
- `src/orchestrator/nodes/*.ts` — one file per sub-agent. The system prompts live as TS string literals; ADR-0004 calls these "first-class design artifacts".
- `src/orchestrator/parsing.ts` — extracts the bpy script from a fenced LLM reply, and the `FOUNDRY_SUMMARY {...}` JSON line from Blender stdout.
- `src/blender/blender-runner.ts` — Blender subprocess. Reads `.blender-version` and refuses on mismatch (ADR-0002). Writes `_materials.json` into the target's scriptsDir. The MCP service surface lives at the orchestrator layer (ADR-0009 — Phase 3 work); this file is *not* an MCP bridge.
- `src/validator/index.ts` — deterministic, NOT an agent. Parses the SceneAssembler's stdout, gates on `tri_budget`, writes the consumer-facing `<id>_v1.validation.json`.

Code paths (target side, e.g. `../beaverGame/asset-foundry/`):
- `world.yaml` — manifest. The target's source of truth for biomes, props, palettes.
- `palettes.yaml` — slot-name → hex hints for MaterialArtist's deterministic Phase 0 mapping.
- `fixtures/_lib.py` — shared bpy helpers: deterministic seed, fresh scene, FLOAT_COLOR vertex colours with sRGB→linear conversion, `_activate_color` to promote the layer to active (without this the glTF exporter silently drops COLOR_0), `make_unlit_vertex_color_material` (Emission-only ⇒ KHR_materials_unlit on export).
- `fixtures/<prop_id>.py` — one per prop; offline path used when `ANTHROPIC_API_KEY` is unset. The runtime contract on the bpy script is identical regardless.
- `dist/<id>_v1.glb` + `dist/<id>_v1.validation.json` — generation outputs. Synced into `<target>/public/assets/` by `pnpm gen-asset`.

## Sub-agent contract (ADR-0004 recap)

Paths below are target-rooted (`<target>/asset-foundry/...`).

| Sub-agent | Reads | Writes | External calls |
|----|----|----|----|
| WorldDesigner | game design notes | `world.yaml` | (no Blender) |
| AssetSculptor | one prop entry | `dist/scripts/<id>_v1.py` | Anthropic |
| MaterialArtist | `palettes.yaml` + sculpted asset | material plan in state | Anthropic, Poly Haven (Phase 2) |
| SceneAssembler | sculpt + materials | `dist/<id>_v1.glb` | Blender (subprocess) |
| Validator | summary JSON, manifest | `dist/<id>_v1.validation.json` | (deterministic, no LLM) |

## §4.4 Python contract (every bpy script must)

1. Open with a deterministic seed (`random.seed(hash(prop_id) & 0xFFFF)`).
2. Operate on a fresh empty scene (`bpy.ops.wm.read_factory_settings(use_empty=True)`).
3. Produce one named root object whose name is the `prop_id`.
4. Stay at or under the manifest's `tri_budget`.
5. End with `bpy.ops.export_scene.gltf(filepath=OUT_PATH, …)`.
6. Print exactly one line to stdout: `FOUNDRY_SUMMARY {"asset_id":..., "tri_count":..., "bounding_box":{...}, "material_slots":[...]}`.

## Dev commands

```bash
pnpm install
pnpm install-blender                                         # checks Blender pin (ADR-0002)
pnpm validate:manifest                                       # Zod-only manifest check (CI gate)
pnpm validate:manifest --target ../beaverGame               # explicit target (Phase 0+)
BLENDER_BIN="/Applications/Blender.app/Contents/MacOS/Blender" pnpm gen-asset <prop_id>
pnpm gen-asset <prop_id> --target ../beaverGame             # explicit target form
pnpm validate                                                # schema + every <target>/asset-foundry/dist/*.validation.json
pnpm typecheck
pnpm test
```

## Environment

- `ANTHROPIC_API_KEY` — required for live LLM-driven sculpting. When unset, AssetSculptor uses `<target>/asset-foundry/fixtures/<prop_id>.py`. CI exercises the full pipeline this way.
- `BLENDER_BIN` — override path. Default `blender`. macOS install: `/Applications/Blender.app/Contents/MacOS/Blender`.
- `FOUNDRY_TARGET` — path to the consumer target repo (containing `asset-foundry/world.yaml`). Phase 0 falls back to `../beaverGame` when unset; Phase 1 makes this mandatory.

## Blender gotchas (learned the hard way)

- **`bm.loops.layers.color.new()` creates a BYTE_COLOR attribute that the glTF exporter silently drops.** Use `bm.loops.layers.float_color.new()` (FLOAT_COLOR domain).
- **`bm.to_mesh()` does not set `mesh.color_attributes.active_color`.** Without an active colour, the exporter writes no COLOR_0 even with `export_colors=True`. Always call `_activate_color(mesh, "Col")` after `to_mesh`.
- **Vertex colours in glTF are linear by spec.** Author in sRGB and let `srgb_to_linear()` (in `_lib.py`) convert before assignment. Otherwise the renderer shows a 0.91 sRGB tone as ≈0.96 (washed white) under linear interpretation.
- **`__file__` in a fixture script run by Blender is the script path itself.** Fixtures import `_lib.py` via `sys.path.insert(0, os.path.dirname(__file__))`. Don't copy fixtures into other directories before running — keep them in `fixtures/` so the import works.

## Key ADRs (this repo)

| ADR | Subject |
|----|--------|
| [0001](decisions/adr/0001-local-only-orchestrator.md) | Local-only orchestrator; no runtime AI |
| [0002](decisions/adr/0002-pin-blender-lts.md) | Pin Blender LTS; validator refuses drift |
| [0003](decisions/adr/0003-handscripted-bpy-hyper3d-reference-only.md) | Hand-scripted bpy for hero props |
| [0004](decisions/adr/0004-narrow-subagent-boundaries.md) | Narrow sub-agent boundaries are first-class |
| [0005](decisions/adr/0005-langgraph-pattern-from-cv-builder.md) | Reuse cv-builder's LangGraph pattern |
| [0006](decisions/adr/0006-target-workspace-model.md) | Target workspace model — asset-foundry owns no game data |
| [0007](decisions/adr/0007-game-agnostic-contract.md) | Game-agnostic contract — `src/` carries no game tokens |

Cross-cutting decisions (asset format, repo split, TS-everywhere) live in `../beaverGame/decisions/adr/`.

## Available skills

The full ojfbot skill tree is symlinked into `.claude/skills/`. Useful here: `/scaffold`, `/adr`, `/validate`, `/spec-review`, `/hardening`, `/observe`. Run `/init` to refresh this file or `/recon` for a structured codebase tour.

## Punch list

- Phase 1: scaffold a second target (`../carrier-pigeon/asset-foundry/`) and finalize the AST-based agnostic-ness lint rule (ADR-0007).
- Phase 1: drop the Phase 0 fallback to `../beaverGame` in `src/targets/loader.ts` once a second target proves the abstraction.
- Bump `.blender-version` to 4.2 LTS once we're past Phase 0 (currently pinned to 4.0.2 to match local install).
- Wire the LLM path end-to-end: set `ANTHROPIC_API_KEY` and verify AssetSculptor produces a working bpy without the fixture.
- Add MaterialArtist palette injection into the bpy script (currently a no-op planning step).
- Visual regression: render 3 fixed angles per asset, commit baselines under `<target>/asset-foundry/dist/baselines/`, perceptual-diff in CI.
- Tests for `parsing.ts` (FOUNDRY_SUMMARY edge cases) and `validator/index.ts` (rejection paths).
- Strip `asset.extras.generator`/timestamp from glTF exports so byte-identical reruns become possible (geometry is already deterministic; only metadata drifts).
