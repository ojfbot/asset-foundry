# ADR-0006: Target workspace model — asset-foundry owns no game data

Date: 2026-04
Status: Accepted
OKR: 2026-Q2 / O2 / KR1 (assistant-centric architecture)
Commands affected: /scaffold-app, /add-prop, /validate
Repos affected: asset-foundry, beaverGame, future game repos

---

## Context

Asset-foundry today produces Cozy Beaver assets from `manifest/world.yaml`, syncs them to `../beaverGame/public/assets/`, and is otherwise tightly coupled to a single consumer game. Two pressures push against that:

1. We want a second game (Carrier Pigeon) and eventually third-party games to use the same pipeline without forking.
2. We want to run asset-foundry as a persistent MCP service across multiple targets simultaneously (see ADR-0009).

A single in-repo `manifest/` cannot serve N games at once, and bundling each game's manifest into asset-foundry would couple the platform's release cadence to every consumer's content cadence. The right cut is the one already implicit in the codebase: the manifest *describes* the game, and the game owns its own description.

## Decision

Asset-foundry is **platform-only**. It owns zero game data. A "target" is a path to an external sibling repo (e.g. `../beaverGame/`, `../carrier-pigeon/`) that owns its own manifest, fixtures, palette hints, and asset output directory. Asset-foundry resolves a target, reads the target's manifest, runs the generation graph, and writes outputs back into the target.

**Layout convention** (per target):

```
<target-repo>/
  asset-foundry/
    world.yaml          ← Zod-validated manifest (the contract)
    palettes.yaml       ← slot-name → hex hints (extracted from material-artist.ts)
    fixtures/           ← target-specific bpy fallbacks (offline path)
    dist/               ← generation outputs (.glb + .validation.json)
  public/assets/        ← consumer-side asset directory (where dist/ syncs, optional per-target)
```

**Resolution order** (CLI and MCP both):

1. Explicit `--target <path>` flag
2. `$FOUNDRY_TARGET` environment variable
3. Error — no implicit default

During Phase 0 migration only, a temporary fallback to `../beaverGame` keeps the existing `pnpm gen-asset beaver_basic` flow working without changes. The fallback drops in Phase 1 once a second target proves the abstraction.

**State boundary**: per-host run history (LangGraph checkpointer DB) lives in `~/.asset-foundry/state/runs.sqlite` (or `$FOUNDRY_STATE_DIR`), not in the target. State follows the developer, not the game. See ADR-0008.

**Naming**: the in-process abstraction is `TargetContext` (a struct of `{manifest, fixtures_dir, output_dir, palettes}`), produced by `src/targets/loader.ts` from a target path. Every node in the orchestrator receives the `TargetContext` via the LangGraph state.

## Consequences

### Gains

- One asset-foundry can serve N target games without forks.
- Game-content release cadence fully decouples from platform release cadence.
- The "third-party game uses asset-foundry" path is just "drop an `asset-foundry/` directory in your repo and point at it."
- The MCP service (ADR-0009) can route tools by target without a global mutable state.
- Migration risk is bounded: the schema (`manifest/schema.ts`) is already game-agnostic, so the cut is structural, not semantic.

### Costs

- One layer of indirection on every read (target resolution → loader → state). Negligible at build-time scale.
- The `--target` flag becomes mandatory after Phase 0. Users must remember to set it (or `$FOUNDRY_TARGET`). Mitigated by clear errors and `target:list` in the Phase 2 CLI.
- Breaking change for any external consumer of asset-foundry's CLI between Phase 0 and Phase 1. None exist today, so the cost is theoretical.

### Neutral

- The `manifest/` directory in asset-foundry shrinks to *just* `schema.ts` (and its test). It may be renamed `src/manifest/` in a later cleanup, but Phase 0 leaves the import paths alone.
- `dist/` in the asset-foundry repo becomes empty (and gitignored). Generated artifacts live with the consumer.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Bundled `projects/<name>/` subdirectory inside asset-foundry | Couples platform releases to game-content releases; doesn't scale to third parties without forks. |
| Pure user-dir model (`~/.asset-foundry/projects/<name>/`) | Loses version-controlled-with-the-game property; symlink ergonomics are the user's problem. The consumer-owns-its-data model is cleaner. |
| Single global manifest with a `game:` key per entry | Conflates two concerns into one YAML; reviewing a game-content change forces reading every other game's data; explosive merge conflicts in any multi-game world. |
| Database-backed manifest (SQLite, Postgres) | Manifests are version-controlled artifacts that travel with the game's source. A DB defeats reviewability and PR-based content workflows. |

## Migration (Phase 0)

1. Create `../beaverGame/asset-foundry/` directory.
2. Move `asset-foundry/manifest/world.yaml` → `../beaverGame/asset-foundry/world.yaml`.
3. Move `asset-foundry/fixtures/` → `../beaverGame/asset-foundry/fixtures/`.
4. Extract `SLOT_COLOR_HINTS` (in `src/orchestrator/nodes/material-artist.ts`) → `../beaverGame/asset-foundry/palettes.yaml`.
5. Generated `dist/` lives at `../beaverGame/asset-foundry/dist/` going forward.
6. Add `src/targets/loader.ts`; refactor `manifest/load.ts` callers.
7. Thread `TargetContext` through `src/orchestrator/state.ts` Annotation.Root and every node.
8. `scripts/gen-asset.ts` reads target from `--target` / `$FOUNDRY_TARGET`, falls back to `../beaverGame` during Phase 0 only.

Verification: `pnpm gen-asset beaver_basic` produces byte-identical `.glb` and `.validation.json` to pre-migration output (modulo timestamps in the glTF `asset.extras` block — see CLAUDE.md punch list).
