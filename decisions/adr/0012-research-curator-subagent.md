# ADR-0012: ResearchCurator — vision-driven design brief sub-agent

Date: 2026-05
Status: Proposed
OKR: 2026-Q2 / O2 / KR1 (assistant-centric architecture)
Commands affected: `pnpm foundry asset:generate`
Repos affected: asset-foundry, every consuming target with image/research inputs (first: core-library)
Extends: [ADR-0004](0004-narrow-subagent-boundaries.md), [ADR-0006](0006-target-workspace-model.md), [ADR-0007](0007-game-agnostic-contract.md)

---

## Context

The four current sub-agents (WorldDesigner → AssetSculptor → MaterialArtist → SceneAssembler) all consume **text** — manifest entries, palette tokens, design notes. That contract is sufficient when the target authors describe props in prose and the LLM reasons about geometry from words alone.

The first non-game target (`core-library/`, a 3D cyberspace UI navigation app) breaks that assumption. Its asset surface is the Cambridge University Library and a Gibsonian aesthetic — both are visually anchored, not text-anchored. Reasonable production requires reference images: photographs of the UL, mood-board screenshots from Neuromancer-era cyberspace, glassmorphism palette captures. Asking WorldDesigner to "imagine the UL" without pixels in context produces generic results and re-rolls the silhouette every run.

Two facts shape the response:

1. **The Anthropic SDK accepts image content blocks natively.** Our `src/orchestrator/llm.ts` already uses `cache_control: ephemeral` on the system block (CLAUDE.md "Architecture"). Image blocks cache the same way, so a stable mood-board pays once per run.

2. **Bolting vision onto WorldDesigner widens that agent's surface in a way that violates ADR-0004.** WorldDesigner's job is "the only writer to `world.yaml`". A second responsibility — "and also the agent that ingests pixels and synthesises abstraction cues" — conflates two cognitive tasks (curation and design), exactly the failure mode ADR-0004 was written against.

Visually-driven design is therefore a new agent, not a new responsibility on an existing one.

## Decision

### A fifth sub-agent, inserted before WorldDesigner

```
START → research_curator → world_designer → asset_sculptor → material_artist → scene_assembler → validator → END
```

- **ResearchCurator** reads `<target>/asset-foundry/research/` (images + notes) and any prop-level `research_refs` paths from the manifest. It produces a `design_brief: DesignBrief` value in LangGraph state — *not* on disk. The brief is normalized cues: silhouette descriptors, palette anchors (hex samples extracted from imagery), scale notes, abstraction-style tags ("wireframe", "glass-layer", "neon-accent"), and reference annotations.
- Downstream agents consume the brief as cached system context. AssetSculptor in particular gets per-prop slices (the brief filtered to that prop's `research_refs`) so the bpy script reflects the ingested aesthetic.
- ResearchCurator has **no Blender access** and **no manifest write access**. Its tool surface is filesystem-read on `<target>/asset-foundry/research/` and Anthropic vision calls. That's the entire surface — narrower than WorldDesigner.

### Manifest schema gains an optional `research_refs` field on `PropSchema`

```ts
research_refs: z.array(z.string()).default([])  // paths under <target>/asset-foundry/research/
```

Backward compatible: existing targets (no research dir, no refs) skip ResearchCurator at runtime by short-circuiting on an empty research surface. The graph node still runs but emits an empty brief and is effectively a no-op.

### Brief shape

```ts
type DesignBrief = {
  global: {
    palette_anchors: { hex: string; weight: number; source_ref: string }[]
    abstraction_tags: string[]      // "wireframe", "glassmorphism", "neon-edge"
    scale_anchors: string[]         // "human-scale interior", "monumental"
    silhouette_notes: string        // one paragraph
  }
  per_prop: Record<string, {
    refs: { path: string; caption?: string }[]
    cues: string                    // distilled per-prop guidance
  }>
}
```

This shape is the contract. The schema lives next to the agent (`src/orchestrator/nodes/research-curator.ts` exports a Zod schema for the brief), parallel to how PropSchema lives in `manifest/schema.ts`.

### Image input via Anthropic content blocks, cached at the system layer

ResearchCurator's first user turn includes the reference imagery as `{ type: "image", source: { type: "base64", media_type, data } }` blocks. The system prompt + abstraction-style tag vocabulary go in the system block with `cache_control: ephemeral`, so repeated runs against the same research dir hit cache for the bulk of the prompt. Image blocks are not cacheable today; that's a known cost.

### Game-agnostic, per ADR-0007

`research/` and the brief contract carry no game tokens. The agent reads whatever images live in the target's research dir; it assigns no game-specific meaning. core-library is the first exerciser, but cozy beaver could equally feed it concept art for organic flora and the contract is unchanged.

## Consequences

### Gains
- Visual targets become first-class. core-library's UL fly-through is generated from photographs of the actual library plus a Gibsonian mood-board, not a paragraph of text.
- ADR-0004 boundary is preserved. Each agent still has one job; vision is a new job, served by a new agent.
- The brief is a state value, not a file. Re-runs against the same research dir are deterministic-ish (subject to model variance), and consumers see the brief through the same pattern they already use for manifest entries.
- Targets without research dirs pay nothing — the node short-circuits.

### Costs
- Anthropic vision spend on every run with non-empty research. Mitigated by caching the system block; image blocks themselves are not cacheable today. Practical cost: small for a single mood board, real for video-frame ingestion (out of scope for v1).
- One more graph hop per run, ~one extra LLM round-trip. The pipeline is build-time, latency budget is generous (per ADR-0004 cost analysis).
- A new failure mode: bad/unparseable references. The agent falls back to a text-only brief if vision fails on any single ref, with the failure logged into the brief itself (`failed_refs: string[]`).

### Neutral
- Validator is unaffected. It still gates on `tri_budget` and the §4.4 contract.
- Persistence (ADR-0008) records the brief in the run row; resume from checkpoint replays the existing brief without a fresh vision call.

## Alternatives considered

| Alternative | Why rejected |
|----|----|
| Bolt vision onto WorldDesigner | Violates ADR-0004's narrow-boundary principle. Conflates curation with design; failures in the brief look like manifest failures. |
| Do ingestion in the consuming app (core-library) and feed a finished prompt to asset-foundry | Splits the pipeline across repos. Targets without their own UI (cozy beaver) can't reuse it. The "design brief" becomes an out-of-band file with no schema enforcement. |
| Make ResearchCurator a tool exposed via MCP, not a graph node | Tools are stateless from foundry's view; the brief needs to ride state to AssetSculptor. A tool would force every run to re-read the research dir, defeating cache. The MCP surface (ADR-0009) gets a `foundry.research.preview` *read* later for UI use, separate from this. |
| Cache image blocks via a custom hash-keyed cache layer | Anthropic does not currently cache image content. Building our own cache is doable but premature; first prove the agent earns its keep. |
| Treat the research dir as part of the manifest (e.g. `world.yaml: research:`) | YAML is a poor place to store image bytes; the dir is a directory for a reason. Manifest stays text-only per ADR-0007. |

## Open items

- **Brief versioning.** When the brief schema changes, existing run-history rows still carry old shapes. Add a `brief_version` field once we change the schema for the first time.
- **Per-prop research scoping.** `research_refs` per prop is the v1 mechanism; if it grows unwieldy, biome-level refs are a likely extension.
- **Vision model selection.** Sonnet 4 is the default in `src/orchestrator/llm.ts`. If brief quality lags on small mood-boards, opt-in to a heavier model just for ResearchCurator via a per-node override.
- **Streaming progress.** ResearchCurator's vision turn is the slowest hop. `notifications/progress` (ADR-0009 Phase 3.5) should announce "ingesting N references" before the call.
