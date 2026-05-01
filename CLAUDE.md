# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The AI-driven asset pipeline for the Cozy Beaver project (and any future stylized low-poly game). World manifest in YAML → LangGraph orchestrator with four narrow sub-agents → Blender (subprocess or MCP) → deterministic Validator → glTF binary. Outputs are consumed by the sibling repo [`beaverGame/`](../beaverGame). Also registered as a **Frame MF remote at :3035** and evolving toward a portable MCP platform (PR #16).

**First read for new sessions:** `domain-knowledge/frame-os-context.md`, then `domain-knowledge/langgraph-patterns.md`, then this repo's `decisions/adr/`.

## Architecture (the big picture)

The pipeline is a **LangGraph state machine** with four LLM sub-agents and one deterministic validator. Each node has a strict, non-overlapping tool surface (see ADR-0004), and the orchestration graph is the only place where they're wired together.

```
manifest/world.yaml              ← Zod-validated single source of truth
       │
       ▼
 WorldDesigner    (only writer to manifest; no Blender)
       │
       ▼
 AssetSculptor    (LLM → bpy script; uses fixtures/<id>.py when ANTHROPIC_API_KEY is unset)
       │
       ▼
 MaterialArtist   (palette → material plan; no geometry mods)
       │
       ▼
 SceneAssembler   (spawns Blender, exports .glb)
       │
       ▼
 Validator        (deterministic TS — tri budget, summary JSON, writes .validation.json)
       │
       ▼
 dist/<id>_v1.glb + dist/<id>_v1.validation.json
       │
       ▼ (auto-synced)
 ../beaverGame/public/assets/
```

Code paths:
- `manifest/schema.ts` — Zod schema. The contract WorldDesigner cannot violate.
- `manifest/world.yaml` — populated; 1 biome (`pond_meadow`), 5 props (birch_sapling, ground_pond_meadow, water_pond, sky_dome, beaver_basic).
- `src/orchestrator/state.ts` — LangGraph `Annotation.Root` state. Pattern adapted from `cv-builder/packages/agent-graph/src/state/schema.ts:18–60` (see ADR-0005).
- `src/orchestrator/graph.ts` — `buildGraph({propId})` returns a compiled graph. Edges: START → world_designer → asset_sculptor → material_artist → scene_assembler → validator → END.
- `src/orchestrator/llm.ts` — Anthropic SDK client wrapper. **Prompt caching enabled by default** via `cache_control: ephemeral` on the system block. Model: `claude-sonnet-4-20250514`.
- `src/orchestrator/nodes/*.ts` — one file per sub-agent. The system prompts live as TS string literals; ADR-0004 calls these "first-class design artifacts".
- `src/orchestrator/parsing.ts` — extracts the bpy script from a fenced LLM reply, and the `FOUNDRY_SUMMARY {...}` JSON line from Blender stdout.
- `src/blender/mcp-bridge.ts` — Blender subprocess. Reads `.blender-version` and refuses on mismatch (ADR-0002). The MCP/TCP path is opt-in via `FOUNDRY_USE_MCP=1` (not yet implemented).
- `src/validator/index.ts` — deterministic, NOT an agent. Parses the SceneAssembler's stdout, gates on `tri_budget`, writes the consumer-facing `<id>_v1.validation.json`. Core gate logic extracted to a pure `gateValidation` function for direct unit testing.
- `fixtures/_lib.py` — shared bpy helpers: deterministic seed, fresh scene, FLOAT_COLOR vertex colours with sRGB→linear conversion, `_activate_color` to promote the layer to active (without this the glTF exporter silently drops COLOR_0), `make_unlit_vertex_color_material` (Emission-only ⇒ KHR_materials_unlit on export).
- `fixtures/<prop_id>.py` — one per prop; offline path used when `ANTHROPIC_API_KEY` is unset. The runtime contract on the bpy script is identical regardless.

## Sub-agent contract (ADR-0004 recap)

| Sub-agent | Reads | Writes | External calls |
|----|----|----|----|
| WorldDesigner | game design notes | `manifest/world.yaml` | (no Blender) |
| AssetSculptor | one prop entry | `dist/scripts/<id>_v1.py` | Anthropic |
| MaterialArtist | palette + sculpted asset | material plan in state | Anthropic, Poly Haven (Phase 2) |
| SceneAssembler | sculpt + materials | `dist/<id>_v1.glb` | Blender (subprocess or MCP) |
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
BLENDER_BIN="/Applications/Blender.app/Contents/MacOS/Blender" pnpm gen-asset <prop_id>
pnpm validate                                                # schema + every dist/*.validation.json
pnpm typecheck
pnpm test
```

## Environment

- `ANTHROPIC_API_KEY` — required for live LLM-driven sculpting. When unset, AssetSculptor uses `fixtures/<prop_id>.py`. CI exercises the full pipeline this way.
- `BLENDER_BIN` — override path. Default `blender`. macOS install: `/Applications/Blender.app/Contents/MacOS/Blender`.
- `FOUNDRY_USE_MCP=1` — opt into the TCP-9876 MCP bridge instead of subprocess (Phase 2+).

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

Cross-cutting decisions (asset format, repo split, TS-everywhere) live in `../beaverGame/decisions/adr/`.

## Available skills

The full ojfbot skill tree is symlinked into `.claude/skills/`. Useful here: `/scaffold`, `/adr`, `/validate`, `/spec-review`, `/hardening`, `/observe`. Run `/init` to refresh this file or `/recon` for a structured codebase tour.

## Punch list

- Bump `.blender-version` to 4.2 LTS once we're past Phase 0 (currently pinned to 4.0.2 to match local install).
- Wire the LLM path end-to-end: set `ANTHROPIC_API_KEY` and verify AssetSculptor produces a working bpy without the fixture.
- Add MaterialArtist palette injection into the bpy script (currently a no-op planning step).
- Visual regression: render 3 fixed angles per asset, commit baselines under `dist/baselines/`, perceptual-diff in CI.
- Strip `asset.extras.generator`/timestamp from glTF exports so byte-identical reruns become possible (geometry is already deterministic; only metadata drifts).
