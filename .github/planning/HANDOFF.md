# asset-foundry — Issue & Tracking Plan v0.1

Companion to `beaverGame/.github/planning/HANDOFF.md`. Derived from a chat-claude planning session on 2026-04-27 against `asset-foundry/CLAUDE.md`.

## Layout

```
.github/
  labels.yml                            # 23 labels (types, phases, areas, cross-cutting)
  milestones.yml                        # M1–M4
  planning/
    HANDOFF.md                          # this file
    issues/
      AF-001.md … AF-013.md             # one file per issue, with frontmatter
scripts/
  seed-github.sh                        # idempotent: applies labels, milestones, issues
```

## Proposed labels

**Type** (pick one): `type:adr`, `type:feat`, `type:fix`, `type:infra`, `type:test`, `type:docs`, `type:spike`

**Phase** (pick one):

- `phase:0` — foundation (mostly closed)
- `phase:1` — pipeline hardening
- `phase:2` — Mode A asset coverage
- `phase:3` — Mode B prep

**Area** (multi-select): `area:manifest`, `area:orchestrator`, `area:sculptor`, `area:material`, `area:scene`, `area:validator`, `area:blender-bridge`, `area:fixtures`, `area:ci`, `area:docs`

**Cross-cutting:** `blocks-cross-repo`, `decision-pending`

## Proposed milestones

- **M1 · Phase 0 close-out** — punch list complete, byte-identical reruns possible
- **M2 · Pipeline hardening** — visual regression, parser tests, MCP bridge, deterministic exports
- **M3 · Mode A asset coverage** — every Mode A prop generated, validated, in browser
- **M4 · Mode B prep** — affordances schema, wet-state variants, NPC asset categories

## Issue inventory

| ID | Title | Labels (head) | Milestone |
|----|-------|---------------|-----------|
| AF-001 | Bump .blender-version to 4.2 LTS | type:infra phase:1 area:blender-bridge | M1 |
| AF-002 | Strip non-deterministic metadata from glTF exports | type:fix phase:1 area:scene area:validator | M1 |
| AF-003 | Visual regression baselines for every prop | type:test phase:1 area:validator area:scene area:ci | M2 |
| AF-004 | Tests for parsing.ts (FOUNDRY_SUMMARY edge cases) | type:test phase:1 area:orchestrator | M2 |
| AF-005 | Tests for validator/index.ts (rejection paths) | type:test phase:1 area:validator | M2 |
| AF-006 | MaterialArtist palette injection into bpy scripts | type:feat phase:1 area:material area:sculptor | M2 |
| AF-007 | ADR-0006 · Visual regression configuration and threshold | type:adr phase:1 area:docs | M2 |
| AF-008 | ADR-0007 · Affordances field on prop schema | type:adr phase:3 area:manifest | M4 |
| AF-009 | ADR-0008 · Wet-state variant strategy | type:adr phase:3 area:manifest area:scene | M4 |
| AF-010 | MCP TCP bridge implementation | type:feat phase:2 area:blender-bridge | M3 |
| AF-011 | WorldDesigner regression tests against the Zod schema | type:test phase:1 area:orchestrator area:manifest | M2 |
| AF-012 | Frame-OS context doc cross-link | type:docs phase:1 area:docs | M1 |
| AF-013 | CI: asset-foundry → beaverGame sync verification | type:infra phase:1 area:ci blocks-cross-repo | M2 |

## Recommended filing order

1. **AF-001** — fast win, unblocks anything that depends on 4.2 features
2. **AF-002** — small, enables AF-003 to be tractable
3. **AF-003 + AF-007** — file together; the ADR captures decisions the implementation makes anyway
4. **AF-004 + AF-005** — parser and validator tests, do them as a single sprint
5. **AF-006** — MaterialArtist palette injection (next visible improvement to artifacts)
6. **AF-011** — WorldDesigner regression tests
7. **AF-008 + AF-009** — Mode B prep ADRs; file early, decide before manifest grows
8. **AF-010** — MCP bridge when it's actually needed (Phase 2 dev work)
9. **AF-012** — paper cut; whenever you notice it again
10. **AF-013** — cross-repo CI

## Cross-repo dependencies

- **AF-008 ↔ beaverGame/BG-012** affordances on the prop schema (fellable detection).
- **AF-009 ↔ beaverGame/BG-007** wet-state strategy ↔ water-shader spike.
- **AF-013** assumes both repos checked out as siblings in CI.

## Open questions for the operator

1. Are these labels and milestones aligned with how you'd name them, or do you have an existing convention from the Frame ecosystem to match?
2. The Mode B prep ADRs (AF-008, AF-009) are filed early because schema migrations get harder as the manifest grows. Right instinct or defer past Mode A?
3. ADR-0006 / 0007 / 0008 numbering assumes 0001-0005 are filed locally — confirm.
