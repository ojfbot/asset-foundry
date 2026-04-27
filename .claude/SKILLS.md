# Skills — asset-foundry

This repo is **not a Frame app**. It's a build-time asset pipeline (Python + Blender + LangGraph + TypeScript), reusable across any future game project. The full ojfbot core skill tree gets symlinked in by `core/scripts/install-agents.sh`, but a chunk of those skills assumes Frame conventions or other domains that don't apply here.

## Layout

```
.claude/skills/
  <name>/         → symlink from core ........... install-agents.sh manages
  <local-name>/   real directory ................ committed; documented below
```

`install-agents.sh` skips paths that already exist as real files/dirs, so a local override at `.claude/skills/<name>/` survives reinstalls.

## Apply directly (use as-is)

`/adr` `/plan-feature` `/spec-review` `/scaffold` `/validate` `/test-expand` `/sweep` `/techdebt` `/doc-refactor` `/lint-audit` `/investigate` `/handoff` `/observe` `/orchestrate` `/push-all` `/pr-review` `/recon` `/roadmap` `/summarize` `/init` `/agent-debug` `/skill-create` `/skill-loader` `/diagram-intake` `/council-review` `/workbench`

## Apply with awareness

| Skill | Note |
|---|---|
| `/setup-ci-cd` | Frame-default templates assume Vercel + browser apps. Foundry CI is Blender-aware (install Blender, run pipeline smoke). |
| `/deploy` | Foundry doesn't deploy as a service. The "deploy artefact" is the validated `.glb`; it ships into the consuming game repo via the auto-sync in `gen-asset`. |
| `/hardening` | Web/auth checks don't apply. Apply the data-pipeline / supply-chain checks (Anthropic key boundary, Blender version pin, generated-script provenance). |
| `/screenshot-audit` | Useful for the future Validator thumbnail step (Phase 1+). Not yet wired here. |

## Don't apply

`/scaffold-frame-app` · `/frame-dev` · `/frame-standup` · `/scaffold-app` (Frame web-app patterns) · `/extension-audit` · `/resume-audit` · `/rag-audit` · `/gastown` · `/daily-logger`

## Local skills (foundry-specific)

| Skill | What it does |
|---|---|
| [`/add-prop`](skills/add-prop/add-prop.md) | Scaffold a new manifest entry plus a fixture stub honouring the §4.4 Python contract. |
| [`/audit-budgets`](skills/audit-budgets/audit-budgets.md) | Walk every `dist/*.validation.json`, compare `tri_count` vs `tri_budget`, flag drift and under-utilised budgets. |

Add a new local skill by creating `.claude/skills/<name>/<name>.md` with frontmatter + instructions, then list it here and add the path to `.gitignore`'s allow list.

## Local-only configs

| File | Status | Use |
|---|---|---|
| `.claude/settings.json` | gitignored (managed by `install-agents.sh`) | Hook config merged from core |
| `.claude/settings.local.json` | gitignored | Per-developer Claude Code prefs |
| `.claude/CLAUDE.local.md` | gitignored | Personal scratch notes |
| `.claude/standup.md` | committed | Repo standup template |
| `.env` / `.env.local` | gitignored | `ANTHROPIC_API_KEY` lives here |

## When to override a core skill

Same pattern as the consuming repo: `cp -RL ../core/.claude/skills/<name> .claude/skills/<name>`, edit, document, allow-list in `.gitignore`.
