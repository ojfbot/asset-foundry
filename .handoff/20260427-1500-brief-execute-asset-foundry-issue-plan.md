---
id: 20260427-1500-brief-execute-asset-foundry-issue-plan
type: brief
title: "Execute the asset-foundry GitHub issue plan"
actor: chat-claude
to: code-claude
session_id: 2026-04-27T15:00:00Z
refs:
  - file:.github/planning/HANDOFF.md
  - file:scripts/seed-github.sh
  - file:CLAUDE.md
hook: github-issue-seed
status: live
created_at: 2026-04-27T15:00:00Z
labels:
  project: cozy-beaver
  repo: asset-foundry
  phase: 1
---

## Context

The `asset-foundry` repo is the AI-driven asset pipeline for the Cozy Beaver project. Phase 0 is substantially complete: 5-node LangGraph wired end-to-end, 5 props in manifest, subprocess Blender bridge, validator writing consumable `.validation.json`, auto-sync to `../beaverGame/public/assets/`. ADRs 0001-0005 are filed. CLAUDE.md has a punch list and hard-won Blender gotchas (FLOAT_COLOR vs BYTE_COLOR, `_activate_color` after `bm.to_mesh()`, sRGB→linear for vertex colors).

A planning session in chat-claude produced a structured GitHub issue plan: 13 issues sequenced and ready to file, plus labels and milestones. The plan lives at `.github/planning/HANDOFF.md` with issue drafts under `.github/planning/issues/AF-*.md` and a `scripts/seed-github.sh` for one-shot creation.

## Goal

Execute the seed script — file all 13 issues with their labels and milestones via `gh` CLI. Verify each issue lands with the right metadata. Surface anything that drifted between the planning doc and the live repo state (e.g., if ADRs are numbered differently than the plan assumes).

## Acceptance criteria

- [ ] `gh label list` shows all 25 labels from `.github/labels.yml`
- [ ] `gh api repos/:owner/:repo/milestones` shows all 4 milestones from `.github/milestones.yml`
- [ ] `gh issue list --limit 30` shows all 13 AF-* issues
- [ ] Each issue has its declared labels and milestone applied
- [ ] If any issue title collided with an existing one, the seeder skipped it (idempotent) and you noted it in the report
- [ ] CLAUDE.md "Punch list" remains consistent with what's now in issue form (do NOT strike entries; the issues reference them)

## References

- file:.github/planning/HANDOFF.md
- file:.github/planning/issues/
- file:.github/labels.yml
- file:.github/milestones.yml
- file:scripts/seed-github.sh
- file:CLAUDE.md
- bead:(this brief)

## Flag back

- If the `gh` CLI isn't authenticated for `ojfbot`, stop and surface — don't authenticate as a different identity.
- If the seeder errors out partway through, do not retry from scratch. The script is idempotent; surface the error and let the operator decide.
- If issue *titles* in the planning docs feel wrong (typos, unclear scoping), do NOT edit them silently — write a `decision` bead noting the proposed rename, then proceed with originals. Renames after filing are expensive.
- If an issue's `depends_on` field references an issue that's also being filed in this session, GitHub doesn't natively model dependencies — note in the report which dependencies are *informational only* vs which actually block.

## Constraints

- Do not modify ADR numbering. The plan assumes ADRs 0001-0005 are filed; if they're at different numbers locally, surface and stop.
- Do not file the AF-007/AF-008/AF-009 ADR-prep issues without checking the existing `decisions/adr/` index for collisions.
- Commit the seed script run as a no-op if everything is already filed (the script handles this).

## After execution

Write a `report` bead responding to this brief. Include:

- Issue numbers assigned (`#42` etc) for each AF-* — these are needed for cross-linking from `beaverGame` issues
- Anything that drifted between the plan and reality
- Any decisions or discoveries worth their own bead
