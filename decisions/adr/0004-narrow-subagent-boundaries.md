# ADR-0004: Narrow sub-agent boundaries are first-class design artifacts

Date: 2026-04
Status: Accepted
OKR: 2026-Q2 / O2 / KR1 (assistant-centric architecture)
Commands affected: /scaffold, /validate
Repos affected: asset-foundry

---

## Context

A single LLM agent given the full toolkit — write to the manifest, sculpt geometry, pick materials, assemble scenes — will conflate concerns. It will silently mutate the manifest while sculpting, drift palette decisions while assembling scenes, and produce failures whose root cause is hard to localize. This is the same instinct as ADR-driven design: constrain the surface so the failures are legible. Sub-agent boundaries are not implementation detail; they are design artifacts and belong in the repo as code.

## Decision

The pipeline runs four LLM sub-agents with **non-overlapping tool surfaces**, plus a deterministic Validator that is not an agent:

- **WorldDesigner** — reads game design notes; writes (only) to `manifest/world.yaml`. No Blender access.
- **AssetSculptor** — reads one prop entry from the manifest; produces a bpy script that generates geometry. Has Blender MCP access. Cannot pick materials.
- **MaterialArtist** — applies the biome palette to sculpted assets. Has Blender MCP access plus Poly Haven for textures when stylization permits. Cannot modify geometry.
- **SceneAssembler** — places assets into reference scenes for thumbnail validation; exports `.glb`. Has Blender MCP access and filesystem access.
- **Validator** — deterministic TypeScript code. Runs poly counts, naming checks, UV checks, perceptual diff against committed thumbnails. Gates on `tri_budget` and naming convention before an asset enters the registry.

Each sub-agent's prompt contract and tool schema live in `src/orchestrator/nodes/<name>.ts` as code. The orchestration graph in `src/orchestrator/graph.ts` is the only place where sub-agents are wired together.

## Consequences

### Gains
- Predictable failures. When a sapling has too many tris, we know AssetSculptor produced the script and we route the failure back there with the diff.
- Each sub-agent's prompt is small and focused, which cache-bills better and reads cleanly.
- The Validator is the contract. The prompts are not. We can change prompts without changing what passes.

### Costs
- More orchestrator wiring than a single mega-agent.
- Per-asset latency adds the four hops; mitigation: the pipeline is build-time so latency budget is generous.

### Neutral
- LangGraph's state machine fits this pattern naturally — see `decisions/adr/0005-langgraph-pattern-from-cv-builder.md`.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| One mega-agent with all tools | Conflates concerns; failures are hard to localize. |
| Three sub-agents (collapse SceneAssembler into MaterialArtist) | Scene assembly and material work are different cognitive tasks; collapsing them muddies the failure signal. |
| Two sub-agents (WorldDesigner + everything else) | Same problem at a coarser granularity. |
