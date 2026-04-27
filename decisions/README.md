# Decisions — asset-foundry

Architectural decisions for the AI-driven Blender asset pipeline. Repo-local; cluster-wide decisions live under `decisions/core/`. Cross-cutting decisions that also affect the game client (e.g. asset format) live in `beaverGame/decisions/adr/` and are referenced here.

```
decisions/
  adr/     ADRs for the asset pipeline
  okr/     OKRs (when populated)
  core/    Symlink → core/decisions (cluster-wide ADRs, read-only)
```

---

## ADR index

| ID | Title | Status | Date |
|----|-------|--------|------|
| [0001](adr/0001-local-only-orchestrator.md) | Local-only orchestrator; no runtime AI | Accepted | 2026-04 |
| [0002](adr/0002-pin-blender-lts.md) | Pin Blender LTS; validator refuses unpinned versions | Accepted | 2026-04 |
| [0003](adr/0003-handscripted-bpy-hyper3d-reference-only.md) | Hand-scripted bpy for hero props; Hyper3D Rodin reference-only | Accepted | 2026-04 |
| [0004](adr/0004-narrow-subagent-boundaries.md) | Narrow sub-agent boundaries are first-class design artifacts | Accepted | 2026-04 |
| [0005](adr/0005-langgraph-pattern-from-cv-builder.md) | Reuse cv-builder's LangGraph node + state pattern | Accepted | 2026-04 |

---

## Cross-references

- Asset format: see `beaverGame/decisions/adr/0004-gltf-binary-unlit-vertex-colors.md`.
- Repo split rationale: see `beaverGame/decisions/adr/0007-repo-split-beavergame-asset-foundry.md`.
- TypeScript-everywhere convention: see `beaverGame/decisions/adr/0003-typescript-everywhere.md`.
