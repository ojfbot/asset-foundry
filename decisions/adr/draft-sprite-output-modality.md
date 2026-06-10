---
slug: sprite-output-modality
serial: draft
rev: 1
Date: 2026-06-09
Status: Proposed
domain: gas-town-governance
type: architecture
Repos affected: [asset-foundry, lofi-beaver]
traces:
  relates-to: [adr:layered-blender-access, adr:game-agnostic-contract]
---

# Sprite output modality: 1-bit isometric render→quantize pipeline

## Context

asset-foundry exports `.glb` only. lofi-beaver's story-world reboot needed
1-bit isometric pixel-art sprites generated from Blender, and built the full
pipeline **target-side** (lofi-beaver/asset-foundry/fixtures/_sprite_lib.py +
sprites.yaml + render/validate scripts) per the "true hybrid" decision
(lofi-beaver ADR-0006). The contract was designed foundry-native from day
one: §4.4-compatible fixtures, `FOUNDRY_SUMMARY` with a `kind` discriminator,
sibling `.sprite.json` + `.validation.json` outputs.

This is the brassboard. The pipeline has shipped 14 assets (tiles, houses,
trees, avatar strips, landmarks) plus 2 Freestyle line-art vignettes,
validator pass rate 100%, on Blender 5.1.1.

## Decision (proposed)

Absorb the sprite modality into asset-foundry core:

1. `manifest/sprite-schema.ts` — Zod schema for the sprite manifest
   (`id, kind: sprite|vignette, canvas_px, frames, footprint`), a
   discriminated union alongside `PropSchema`.
2. A `SpriteRenderer` pipeline stage wrapping the frozen camera/quantize
   contract (yaw 45°, elev 30°, ppu 64/√2, canvas-coord Bayer 8×8,
   three-state ink/paper/void pixels, optional outline ring).
3. Validator extension: `kind: "sprite"` gates = exact dims, 1-bit purity,
   ink coverage ∈ [0.01, 0.95], anchor in bounds (tri budget informational).
4. One Blender source asset may emit BOTH the `.glb` (cozy 3D) and its 1-bit
   sprite — same world, two fidelities, one pipeline.

## Promotion gates (RIDM)

| TPM | Target | Status (2026-06-09) |
|---|---|---|
| Assets shipped, zero manual retouch | ≥ 12 | ✅ 14 |
| Camera/dither constants stable | 2 consecutive slices | ✅ frozen Slice 1→4 |
| Validator pass on clean regen | 100% | ✅ 12/12 |
| Second consumer target identified | ≥ 1 | ⬜ open |

Do not accept this ADR until the second-consumer gate closes — single-consumer
promotion is premature abstraction.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Build in core immediately | Schema/validator churn during visual iteration; aesthetic was unsettled |
| Keep target-side forever | Dual-fidelity payoff (one source → .glb + sprite) never materializes; second consumer would copy-paste the pipeline |

## Provenance

Brassboard implementation: `lofi-beaver/asset-foundry/` (fixtures/_sprite_lib.py,
_mesh.py, sprites.yaml) + `lofi-beaver/scripts/{render,validate}-sprites.ts`.
Decision trail: lofi-beaver ADRs 0005–0007.
