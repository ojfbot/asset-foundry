# ADR-0007: Game-agnostic contract — `src/` carries no game tokens

Date: 2026-04
Status: Accepted
OKR: 2026-Q2 / O2 / KR1 (assistant-centric architecture)
Commands affected: /validate, /lint-audit
Repos affected: asset-foundry

---

## Context

ADR-0006 cuts game data out of asset-foundry. But a clean directory boundary is not a clean *code* boundary. Today `src/orchestrator/nodes/material-artist.ts:7-13` carries a `SLOT_COLOR_HINTS` table (`bark_white`, `leaf_green`, `stone_grey`, etc.) that bakes Cozy Beaver vocabulary into platform code. As soon as a second target uses different slot names, that table either misses (silent `#888888` fallback) or has to grow with every new game — at which point the platform stops being a platform.

The risk is not the one obvious table. The risk is *future* drift: a sub-agent prompt picks up "pond" as an example, a node hardcodes a beaver-specific category enum value, a fixture path normalizes a beaver-specific naming convention. Each individual leak is small; the aggregate kills portability.

The fix is to make game-agnosticism a verifiable, mechanically-checked contract instead of a coding-style aspiration.

## Decision

**`src/` of asset-foundry must contain no game-specific tokens.** This is enforced by an AST-based lint rule that fails CI when violated.

### What "game-specific token" means

An identifier (variable name, string literal in a TS source position that flows into runtime behaviour, type alias, prompt fragment) that names content from a specific game. The seed list of forbidden tokens lives in `eslint-plugin-foundry-agnostic/forbidden-tokens.json` and starts as:

```
beaver, cozy, pond, meadow, cattail, lily, dragonfly, bark_white, bark_dark,
leaf_green, leaf_gold, stone_grey, sapling
```

A token is forbidden whether it appears in:
- variable / function / type / interface names
- string literals that the AST traversal classifies as flowing into a node prompt or runtime config (i.e. not a comment, not a JSDoc tag, not an example in a code-block string explicitly tagged with `/* eslint-disable foundry-agnostic */`)
- import paths

### What lives where

| Lives in asset-foundry's `src/` | Lives in target's `asset-foundry/` directory |
|---|---|
| Schema (`manifest/schema.ts`) — categories, palette roles, interactions | Concrete biomes, props, palettes, fixtures |
| Sub-agent prompts as **template structure** (system message scaffolding, tool schemas) | The slot-name → hex tables that fill the template |
| The orchestrator graph and state | The values that flow through it |
| `src/blender/` runtime helpers | `fixtures/<prop_id>.py` per target |

### Lint rule scope

- AST-based, not regex (avoid false positives on identifiers like `barker` or unrelated `dragon` mentions).
- Scope to identifiers and to string literals that an AST traversal can prove flow into prompt or config positions. Scoping to *all* string literals is too noisy in week one.
- Per-file allowlist via `// eslint-disable-next-line foundry-agnostic` for genuinely unavoidable cases. Each disable must be commented with *why* the exception is platform-correct.
- Implementation: a custom rule in `eslint-plugin-foundry-agnostic/`, registered in `.eslintrc`, gated in CI as a hard failure.
- Forbidden-token list grows when new false-positive-free tokens are identified; never shrinks (a removed token is a regression vector).

### Rule ownership

The rule and its forbidden-token list live in this repo (`eslint-plugin-foundry-agnostic/`). Updates require an ADR amendment (this one) when the *shape* of the rule changes — e.g. expanding from identifier-only to literal-flow analysis. New tokens are routine and ship in normal PRs.

### Phase boundaries

- **Phase 0**: rule designed; first violations (`SLOT_COLOR_HINTS` and friends) hand-fixed during the file moves. Lint plumbing not yet in CI.
- **Phase 1**: lint rule implemented and wired into CI as a blocking gate. False-positive tuning happens here. ADR amendment lands if scope expands.
- **Phase 2+**: forbidden-token list grows as new targets surface new vocabulary that mustn't leak.

## Consequences

### Gains

- Mechanical enforcement replaces vibes. A new contributor cannot accidentally re-couple `src/` to a specific game.
- The platform's "second target works" claim becomes a CI guarantee, not a manual audit.
- Forces sub-agent prompts to externalise game-specific examples to per-target overrides (a future-target affordance falls out for free).
- The forbidden-token list is documentation. Reading it tells a contributor exactly what's been factored out.

### Costs

- Lint rule has to be authored and maintained. Modest: ~150 lines of TypeScript using `@typescript-eslint`'s AST.
- False positives in week one (e.g. "bark" in a comment or a docstring will need scoping right). Mitigated by AST-scoping and the per-line disable.
- Forbidden tokens that are *also* legitimate platform vocabulary (e.g. `tree` could plausibly leak) need careful list curation.

### Neutral

- The rule does **not** check the target side (`<target>/asset-foundry/`). Targets are allowed any vocabulary; that's the whole point.
- The rule does **not** check sub-agent *behaviour* — a prompt could still produce game-specific output even with a clean prompt template. That's an evaluation problem, not a lint one.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Code review discipline only | Doesn't scale across parallel agent sessions; a tired reviewer misses one `bark_*` token and the contract is dead. |
| Regex-based grep in CI | Too many false positives ("bark" inside a contributor's last name in a copyright header). AST scope is the same effort with far fewer headaches. |
| Generic "no hardcoded strings" rule | Punishes legitimate platform vocabulary; would force every error message to thread through i18n machinery for no benefit. |
| Move sub-agent prompts entirely to target dir | Conflates the prompt *structure* (which is platform IP) with the prompt *fillings* (which is target content). The split is the design. |
| Type-system approach (branded types per game) | Doesn't catch the actual leaks, which are mostly string-shaped, not type-shaped. |

## Open items (resolved by Phase 1 ADR amendment)

- Final scope of "string literal flowing into prompt position" — concrete AST patterns to be pinned once the rule has run against real Phase 1 code.
- Whether to extend the rule to fixture file paths (e.g. forbid `fixtures/beaver_basic.py` as an import target). Probably yes; defer until Phase 2's MCP server lands and the `fixture.write` tool boundary makes the import surface clearer.
