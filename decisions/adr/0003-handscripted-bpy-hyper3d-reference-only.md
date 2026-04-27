# ADR-0003: Hand-scripted bpy for hero props; Hyper3D Rodin reference-only

Date: 2026-04
Status: Accepted
OKR: 2026-Q2 / O1 / KR2 (visual coherence)
Commands affected: /validate
Repos affected: asset-foundry

---

## Context

Hyper3D Rodin generates impressive meshes but its outputs are wrong for the game's stylization budget: tri counts in the thousands, organic-blob silhouettes, no respect for the manifest's `tri_budget`, and material slots that don't map to the palette system. Retopologizing a Rodin output to fit a low-poly Firewatch-adjacent silhouette is more work than just generating the silhouette directly with a deterministic bpy script. Poly Haven HDRIs and the occasional tileable texture, by contrast, are fine — they sit underneath the stylization, not at it.

## Decision

The shipping pipeline uses **hand-scripted bpy** — that is, bpy scripts authored by the AssetSculptor sub-agent under the §4.4 Python contract. Hyper3D Rodin is permitted only for **reference passes** during early concept work (silhouette exploration, blockouts). Reference outputs are tagged `_reference_` in the filename, excluded from the Validator's hero-asset gate, and never copied into `beaverGame/public/assets/`. Poly Haven is allowed for HDRIs (Phase 0 lighting) and the occasional ground-tile texture.

## Consequences

### Gains
- Silhouettes match the style anchors declared in the manifest.
- `tri_budget` is enforceable because the AssetSculptor authors the geometry directly.
- The Validator's perceptual diff against reference thumbnails stays meaningful — not chasing organic-blob noise.

### Costs
- Lose the speed of generative meshing for early blockouts. Mitigation: Hyper3D for reference is still fast.
- The AssetSculptor's prompts must encode silhouette conventions explicitly, since there's no "generate a tree" shortcut.

### Neutral
- Poly Haven HDRIs are CC0 and don't intrude on stylization.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Hyper3D as the primary geometry source | Wrong topology, wrong tri counts, wrong silhouettes for our stylization. |
| Hyper3D + automated retopo | Brittle; retopo on stylized silhouettes loses the silhouette. |
| Buy a stylized asset pack | Defeats the point of the AI-driven asset pipeline; coherence drift across vendors. |
