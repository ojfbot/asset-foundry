# ADR-0002: Pin Blender LTS; validator refuses unpinned versions

Date: 2026-04
Status: Accepted
OKR: 2026-Q2 / O1 / KR1 (Phase 0 spike reproducibility)
Commands affected: /validate, /setup-ci-cd
Repos affected: asset-foundry

---

## Context

The Blender Python (`bpy`) API breaks between minor versions. A geometry script that produces a 600-tri sapling on Blender 4.2 may produce a different mesh — or fail outright — on Blender 4.3 because operator names, defaults, and matrix conventions drift. Reproducibility of the asset pipeline depends on every machine, every developer, and every CI run executing the bpy script against the same Blender.

## Decision

Pin the Blender version in a `.blender-version` file at the repo root (initial value: the current Blender LTS at install time, 4.2 LTS as of writing — verify and update on bootstrap). The Validator reads `.blender-version`, queries the running Blender's `bpy.app.version_string`, and exits non-zero if they don't match. CI installs the exact pinned version. Upgrades are a deliberate ADR-supersede event, not an accident.

## Consequences

### Gains
- Byte-identical asset output across machines, given the same manifest entry and the same pinned Blender.
- The Validator catches version drift at the gate, not after artifacts have already been committed.
- Onboarding is a single sentence: "install the version listed in `.blender-version`."

### Costs
- Every Blender LTS rotation requires a coordinated upgrade ceremony: bump the pin, regenerate baselines, supersede this ADR.
- Developers can't just `brew install blender` and expect the pipeline to work.

### Neutral
- The pin file is plain text (`4.2.3` or similar). Tooling around it (asdf, mise, install-blender-mcp.sh) reads the same file.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Tolerate version drift | Defeats reproducibility; visual regression CI would page on every developer's machine difference. |
| Docker-pinned Blender for all runs | Heavier than needed for v0; revisit at Phase 5 if the pipeline ever runs in a non-developer environment. |
| Vendor a specific Blender binary in the repo | Repo bloat; license complications. |
