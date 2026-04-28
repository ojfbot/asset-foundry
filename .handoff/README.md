# `.handoff/` — session ledger for this project

This directory holds the session-handoff ledger. Read it at the start of every Claude session in this repo. Append to it before every session ends.

## Read me first

1. The `/bead` skill should auto-trigger when you enter a project with a `.handoff/` directory. If it doesn't, manually run:

   ```bash
   python <skill-path>/scripts/orient.py --root .handoff
   ```

2. Look for **briefs addressed to you** (`actor: <you>` in frontmatter, type `brief`, status `live`, no matching `report`).

3. If you find one, read it before doing anything else. The brief is your orient material.

## Write before leaving

Before ending the session, write at minimum one bead:

- **report** if you executed work
- **brief** if you delegated work to a future session
- **decision** if you settled an ADR-worthy question
- **discovery** if you hit a non-obvious gotcha

Use the skill's `scripts/write.py` to scaffold:

```bash
python <skill-path>/scripts/write.py report \
  --title "Filed Phase 1 issues" \
  --actor code-claude \
  --responding-to <brief-id> \
  --project cozy-beaver \
  --root .handoff
```

## Conventions

- Beads are append-only. Don't delete; supersede.
- Filename follows `id` field exactly. Don't rename.
- Sibling repo cross-references use `github:owner/repo#issue` URIs in `refs`.
- For this project, `actor` values you'll commonly see: `chat-claude`, `code-claude`, `james`.

## Compatibility

The frontmatter is bead-shaped (Gas Town / Beads / GasCity-compatible). If we ever want to ingest this ledger into a fuller orchestration system, the migration is a direct read.
