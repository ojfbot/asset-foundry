# ADR-0005: Reuse cv-builder's LangGraph node + state pattern

Date: 2026-04
Status: Accepted
OKR: 2026-Q2 / O2 / KR2 (tooling for iteration)
Commands affected: /scaffold
Repos affected: asset-foundry

---

## Context

cv-builder already solves "LangGraph + Claude + structured state" for a multi-agent system: a `createSimpleNode` factory wraps Claude invocations and folds responses into a typed state, and an Annotation-based state schema with explicit reducers handles message accumulation and per-agent output mutations. We could roll our own. We shouldn't.

## Decision

Adapt the cv-builder pattern. Specifically:
- `src/orchestrator/graph.ts` — LangGraph state machine. Modeled on `cv-builder/packages/agent-graph/src/state/schema.ts:18–60` (Annotation + reducers).
- `src/orchestrator/nodes/world-designer.ts`, `asset-sculptor.ts`, `material-artist.ts`, `scene-assembler.ts` — each uses a `createSimpleNode`-style factory modeled on `cv-builder/packages/agent-graph/src/nodes/base-node-factory.ts:19–77`.
- Anthropic SDK initialization via `@langchain/anthropic` `ChatAnthropic`, mirroring cv-builder's pattern.
- Prompt caching enabled by default (per Anthropic best practices for the cluster).

We **adapt** rather than depend: copy the relevant code into `asset-foundry/src/orchestrator/`, attribute the source in a comment header, and let the two implementations diverge if their needs do. We don't build a shared package for v0.

## Consequences

### Gains
- Zero design overhead. cv-builder has shaken out the pattern.
- Same mental model across the cluster — anyone who can read cv-builder's graph can read this one.
- Future shared package is still possible; if both repos converge on the same primitives, we promote them later.

### Costs
- Coupling to cv-builder's pattern at the design level even after the code is copied. If cv-builder's pattern evolves, we'll either follow or accept divergence.
- Two copies of the factory code; one bug fix means two edits. Acceptable for a small primitive.

### Neutral
- LangGraph itself is a stable cluster dependency.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Roll our own from scratch | Reinvention; cv-builder's pattern works. |
| Anthropic Managed Agents | Not on the cluster stack yet; would diverge from cv-builder. |
| Shared `@ojfbot/langgraph-core` package | Premature abstraction; promote when both repos prove they want the same thing. |
