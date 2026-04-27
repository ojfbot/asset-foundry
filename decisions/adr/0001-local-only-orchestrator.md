# ADR-0001: Local-only orchestrator; no runtime AI

Date: 2026-04
Status: Accepted
OKR: 2026-Q2 / O2 / KR1 (assistant-centric architecture)
Commands affected: /scaffold-app, /deploy
Repos affected: asset-foundry, beaverGame

---

## Context

The asset pipeline is a build-time concern. Players open the game in a browser, load already-validated `.glb` artifacts, and never invoke an LLM. Running the orchestrator at the player's edge would impose API cost per session, latency in the millisecond-tight render loop, and a key-management burden the v0 game does not need.

## Decision

The LangGraph orchestrator runs only on a developer workstation (or a CI runner). The Anthropic API key lives in an environment variable on that machine. Pipeline outputs (validated `.glb` plus thumbnails) are committed to or shipped from `dist/` and consumed by the game client as static assets. No runtime AI of any kind ships with the v0 game bundle.

## Consequences

### Gains
- Zero per-player API cost.
- No latency budget for AI calls in the game loop.
- No key management surface in the deployed game (which is a static bundle on Cloudflare Pages or Vercel).
- Pipeline failures surface to the developer running the run, not to a player mid-session.

### Costs
- No dynamically generated content: every asset that appears in the game must have been pre-generated and committed.
- "Generate a tree species I haven't seen before" is a workshop activity, not a feature.

### Neutral
- If we later want runtime AI (procedural critter chatter, dynamic quests), that's a separate ADR and will live behind its own gateway.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Serverless orchestrator (Cloudflare Workers) | Adds a deploy target with no v0 benefit; key would still need to live somewhere. |
| Runtime AI for asset generation | Out of scope — turns the game into a tech demo with API-cost variance per player. |
| Manual asset authoring | Defeats the entire reason the pipeline exists. |
