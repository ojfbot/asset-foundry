# asset-foundry

AI-driven asset pipeline for stylized low-poly Blender output. World manifest → LangGraph orchestrator (four narrow sub-agents) → Blender → deterministic Validator → glTF `.glb`. Built for the Cozy Beaver game in [`beaverGame`](../beaverGame), but generic by construction — asset-foundry also serves as a portable MCP platform (see PR #16) so future games and tools can consume it.

## Quickstart (5 commands)

```bash
pnpm install
BLENDER_BIN="/Applications/Blender.app/Contents/MacOS/Blender" pnpm install-blender   # check Blender pin
pnpm validate:manifest                                                                # Zod-only manifest check
BLENDER_BIN="/Applications/Blender.app/Contents/MacOS/Blender" pnpm gen-asset birch_sapling
pnpm validate                                                                         # gate every artifact
```

The fourth command runs the full pipeline: WorldDesigner → AssetSculptor → MaterialArtist → SceneAssembler → Validator. It writes `dist/birch_sapling_v1.glb` and the sibling `birch_sapling_v1.validation.json`, then syncs both into `../beaverGame/public/assets/`.

## Offline / online

When `ANTHROPIC_API_KEY` is set, AssetSculptor calls Claude to author the bpy script. When unset, it falls back to a hand-scripted fixture under `fixtures/<prop_id>.py`. The runtime contract on the bpy script is identical either way; the §4.4 Python contract (deterministic seed, fresh scene, named root, glTF export, JSON summary line) is enforced by the Validator regardless.

## Architecture

LangGraph state machine, Anthropic SDK with prompt caching, Blender subprocess (TCP MCP path is opt-in via `FOUNDRY_USE_MCP=1`), Zod-validated YAML manifest. Registered as a Frame Module Federation remote at `:3035`. See [`CLAUDE.md`](CLAUDE.md) for the directory map and [`decisions/adr/`](decisions/adr/) for the architectural decisions.

## Phase 0 status — CLOSED

Phase 0 reached test-covered vertical-slice status and is fully closed.

- [x] World manifest + Zod schema + tests
- [x] Five-node graph wired and exercised end-to-end
- [x] Subprocess Blender bridge with version pinning (ADR-0002)
- [x] Validator writes consumable `.validation.json`
- [x] Auto-sync into `../beaverGame/public/assets/`
- [ ] Live LLM path (set `ANTHROPIC_API_KEY` and validate)
- [ ] MCP TCP bridge (`FOUNDRY_USE_MCP=1`)
- [ ] Visual regression baselines under `dist/baselines/`

## License

Private, internal. Not for redistribution.
