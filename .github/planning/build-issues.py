#!/usr/bin/env python3
"""Builder: writes one .md per issue under <repo>/.github/planning/issues/.
Run once to regenerate all issue files. Edit ISSUES_BG / ISSUES_AF below to
adjust content; the seeder reads the .md files this script produces.
"""
import os
import textwrap
from pathlib import Path

BG_REPO = Path("/Users/yuri/ojfbot/beaverGame")
AF_REPO = Path("/Users/yuri/ojfbot/asset-foundry")


def write_issue(repo: Path, issue_id: str, title: str, labels: list, milestone: str, body: str) -> Path:
    """Write a single issue file. Frontmatter holds labels + milestone; body is markdown."""
    issues_dir = repo / ".github" / "planning" / "issues"
    issues_dir.mkdir(parents=True, exist_ok=True)
    path = issues_dir / f"{issue_id}.md"
    labels_inline = "[" + ", ".join(labels) + "]"
    content = (
        "---\n"
        f"labels: {labels_inline}\n"
        f"milestone: \"{milestone}\"\n"
        "---\n"
        f"# {issue_id} · {title}\n\n"
        f"{body.strip()}\n"
    )
    path.write_text(content)
    return path


# ── beaverGame issues (BG-001 .. BG-017) ──────────────────────────────────────
ISSUES_BG = [
    {
        "id": "BG-001",
        "title": "Commit Poly Haven HDRI under public/assets/hdri/",
        "labels": ["type:feat", "phase:1", "area:lighting"],
        "milestone": "M1 · Phase 0 close-out",
        "body": """
## Context

CLAUDE.md punch list. `applyHdriEnvironment` is wired and currently a no-op because no HDRI is committed. While all materials are unlit today, the HDRI starts mattering the moment we add anything reflective or PBR (water, stone, metal mailbox), and especially when we want time-of-day shifts in Mode A. Get one in now so the lighting code path stays exercised.

## Acceptance criteria

- [ ] One CC0 HDRI from Poly Haven committed under `public/assets/hdri/<name>.hdr`
- [ ] License/attribution noted in `public/assets/hdri/README.md`
- [ ] `applyHdriEnvironment(scene, '/assets/hdri/<name>.hdr')` called from world composition (gated to do nothing visible if all materials are unlit)
- [ ] Content-Type sniff confirms RGBELoader receives binary, not Vite's SPA fallback HTML
- [ ] Snap script confirms unchanged scene appearance (HDRI should be invisible until we have lit materials)

## Notes

Choose a neutral overcast or dawn HDRI — something that won't fight the painterly palette when we eventually do switch a material to PBR. Skip dramatic/sunset HDRIs until we have a time-of-day system to drive them.
""",
    },
    {
        "id": "BG-002",
        "title": "Bound WASD controller to the ground patch",
        "labels": ["type:fix", "phase:1", "area:player"],
        "milestone": "M1 · Phase 0 close-out",
        "body": """
## Context

CLAUDE.md punch list. Currently the beaver walks straight off into fog. Charming for now, will become annoying the moment anyone playtests. Cheapest fix: clamp the player position to a circular or rectangular bound matching `ground_pond_meadow`. Don't over-engineer collision yet — there's no terrain height to follow and no obstacles to navigate.

## Acceptance criteria

- [ ] Player position clamped to a 2D bound matching the ground asset's footprint (read from `validation.json` `bounding_box` if available, else hardcoded constant)
- [ ] Soft snap-back at the boundary (no hard wall feel; cozy register, not platformer register)
- [ ] Tests for the clamp logic — pure-function in/out
- [ ] CLAUDE.md "Punch list" entry struck

## Worth thinking about

Reading the ground asset's bounding box from `validation.json` is the right path because it makes the bounds data-driven; the consumer-side validation contract was designed for exactly this kind of cross-asset query. But hardcoded constant is fine for v0 if it gets the controller in the right shape faster.
""",
    },
    {
        "id": "BG-003",
        "title": "CI workflow: typecheck + test + build + snap",
        "labels": ["type:infra", "phase:1", "area:ci"],
        "milestone": "M1 · Phase 0 close-out",
        "body": """
## Context

CLAUDE.md punch list. The snap script is already the right primitive for a visual regression layer — it produces deterministic PNGs of the live scene through a headless Chromium. Wire it into CI before the surface area grows. (A baseline CI workflow already exists running typecheck + test + build + validate-assets; this issue extends it with the snap-and-diff step.)

## Acceptance criteria

- [ ] Existing `.github/workflows/ci.yml` extended with a `snap` job (or step) that runs `pnpm tsx scripts/snap.ts`
- [ ] Snap output uploaded as artifact on every run
- [ ] Snap committed as baseline under `tests/baselines/scene-snap.png`
- [ ] Subsequent runs perceptual-diff against baseline; CI fails on diff above threshold (start at SSIM ≥ 0.98, tune)
- [ ] Threshold and rendering setup documented in ADR-0008
- [ ] Baseline regeneration is a labeled-PR workflow (e.g. `regenerate-snap-baseline` label triggers the rebuild step)

## Worth flagging

This issue and asset-foundry/AF-003 (foundry-side visual regression) form a two-layer regression story: foundry catches asset regressions in isolation, beaverGame catches scene-composition regressions. Both layers earn their keep; neither is redundant.
""",
    },
    {
        "id": "BG-004",
        "title": "Vitest coverage for load-glb.ts validation tripwire",
        "labels": ["type:test", "phase:1", "area:loader"],
        "milestone": "M1 · Phase 0 close-out",
        "body": """
## Context

CLAUDE.md punch list. The dev-mode contract — refusing to load a `.glb` without a sibling `.validation.json` declaring `status: "validated"` — is the consumer half of the foundry contract. It's the most important load-bearing piece of code in the loader and it has zero tests.

## Acceptance criteria

- [ ] Test: valid `.glb` + valid `.validation.json` → loads
- [ ] Test: valid `.glb` + missing `.validation.json` → rejects in dev, allows in prod (or whatever the current semantics are — codify them)
- [ ] Test: valid `.glb` + `.validation.json` with `status: "rejected"` → rejects always
- [ ] Test: valid `.glb` + malformed `.validation.json` → rejects with structured error
- [ ] Test: valid `.glb` + `.validation.json` whose schema doesn't match `src/scene/types.ts` → rejects (catches drift between repos)

## Why this matters

This is the seam between the two repos. If it silently passes on a malformed validation file, the entire cross-repo contract collapses without anyone noticing until something looks wrong. Test the rejection paths.
""",
    },
    {
        "id": "BG-005",
        "title": "Replace mulberry32 scatter with Poisson-disk sampling",
        "labels": ["type:feat", "phase:1", "area:scene-bootstrap"],
        "milestone": "M1 · Phase 0 close-out",
        "body": """
## Context

CLAUDE.md punch list. The deterministic mulberry32-seeded scatter is fine for repeatability but produces clusters and bare patches. Poisson-disk gives an evener spread that reads as natural without looking gridded — exactly the right register for Firewatch-painterly scenes. Stays deterministic with a fixed seed.

## Acceptance criteria

- [ ] Poisson-disk sampler implementation with configurable minimum distance
- [ ] Seeded via the same fixed seed mulberry32 uses (preserves reproducibility)
- [ ] Forward-bias filter still applied (spawn view stays populated)
- [ ] Snap baseline regenerated and committed
- [ ] Visual comparison documented (before/after PNGs in PR description)

## Note

Bridson's algorithm is the standard implementation; ~50 lines of TypeScript. Resist the urge to npm-install for this — keeping the dependency surface small is part of the project's character.
""",
    },
    {
        "id": "BG-006",
        "title": "ADR-0008 · Camera perspective and rig",
        "labels": ["type:adr", "phase:2", "area:camera"],
        "milestone": "M2 · Mode A core",
        "body": """
## Context

The camera question has been open since the planning conversation. Default was third-person follow (Goose Game-derived), but the Monument Valley + Lake references pulled toward fixed-angle elevated 3/4. Currently the player has a "3rd-person follow camera with soft lag" (per CLAUDE.md) — that's the placeholder, not the decision.

## Sections to write

- Option A: third-person follow (current; embodied; Goose Game register)
- Option B: fixed-angle elevated 3/4 (Monument Valley register; diorama legibility)
- Option C: hybrid — fixed-angle that tracks the player (Hob/Tunic/Death's Door pattern; keeps diorama feel without cutting between fixed frames)
- Decision and rationale, with reference to canon refs in the reference library
- Consequences for: asset pipeline (canonical view exploitation), water sim visualization, fixed wet-state authoring, traversal feel during dam-building

## My instinct (already shared but worth re-recording)

Option C, slightly elevated 3/4 view, optional push-in for moments. Spike before committing.

## Spike before merging

Implement all three rigs as toggleable in dev. Snap script captures all three. Decide on visceral evidence, not on theory.
""",
    },
    {
        "id": "BG-007",
        "title": "Water shader spike",
        "labels": ["type:spike", "phase:2", "area:water-sim", "area:render", "decision-pending"],
        "milestone": "M2 · Mode A core",
        "body": """
## Context

Mode A needs a pond. Mode B needs the pond to flood. The water shader is the bridge between them, and the wet-state-variant ADR (asset-foundry/AF-009) cascades through the shader's design. Spike before committing to either repo's Phase 4 scope.

## Spike scope (time-boxed: 1 week)

- [ ] Single-shader water plane with: animated normal-map distortion, fresnel-style edge tint, depth-fade against the ground plane
- [ ] Water surface displacement driven by a height-field uniform (1m resolution, 64×64 grid for the spike)
- [ ] Submerged-asset color modification: anything below the water-line shifts toward the water palette
- [ ] Day/night-driven palette parameter (placeholder; not wired to anything yet)
- [ ] Snap script captures water-plane appearance at three height levels (low pond, mid, suburb-flood)

## Exit criterion

A definitive answer to: "is shader-driven wet-state visually convincing for the watershed mode?" If yes → adopt Option B in asset-foundry/AF-009. If no → Option A or C.

## Worth flagging

This is the single largest technical risk in the project. The spike must be allowed to fail. If the shader approach feels bad, the answer is honest geometry variants, not stretching the spike until it works.
""",
    },
    {
        "id": "BG-008",
        "title": "Terrain height field",
        "labels": ["type:feat", "phase:2", "area:scene-bootstrap", "area:render"],
        "milestone": "M2 · Mode A core",
        "body": """
**Depends on:** BG-007 (water shader needs terrain to fade against)

## Context

The pond currently sits on a flat ground asset. Real terrain (gentle elevation, a creek bed leading into the pond, raised banks) is what makes the watershed comprehensible — water flows downhill, you see where, the topology of Mode B becomes legible from Phase 2 onward.

## Acceptance criteria

- [ ] Terrain authored as a height-field-based mesh (not a glTF prop — terrain belongs to the game, not the asset library)
- [ ] Heights stored as a 2D float array; mesh regenerated from it on changes
- [ ] Vertex colors drive the painterly look (no terrain texture splat)
- [ ] Visible creek bed leading into the pond (foreshadows the watershed)
- [ ] Player controller respects terrain height (BG-002 may want updating to sample the height field)
- [ ] Mulberry32/Poisson-disk scatter (BG-005) places trees on terrain, with slope rejection above some angle

## Worth thinking about

Terrain authoring tool is a nontrivial design decision — hand-authored heightmap PNG, runtime-generated procedural noise, or in-game sculpt? Hand-authored PNG is the lowest-tech and gives the most control. Runtime procedural is too rolling-fields-of-Skyrim for the small specific place we're building. In-game sculpt is overkill for v0.
""",
    },
    {
        "id": "BG-009",
        "title": "Player rig: walk + swim states",
        "labels": ["type:feat", "phase:2", "area:player"],
        "milestone": "M2 · Mode A core",
        "body": """
## Context

The current `spawnPlayer` does WASD movement with a single locomotion state. Mode A needs at minimum walk + swim; the swim state is what makes the water-as-highway pillar mechanically real. Whether to add gnaw and carry-log states here or in BG-013 (felling) depends on how the rig is structured.

## Acceptance criteria

- [ ] Player has a "swim" state engaged when below a water-line threshold
- [ ] Swim is faster than walk (per planning doc — water as highway)
- [ ] Visible state transition: pose change, IK plant points lift, ripple effect on water surface (gates BG-007)
- [ ] WASD direction interpretation handles the +Y/-Z conversion documented in CLAUDE.md
- [ ] Camera transitions smoothly between walk and swim heights

## Worth flagging

If we're going to skin a real beaver rig and not just tween between two static poses, this issue grows substantially. For v0, two static poses with cross-fade is plenty. The cozy register tolerates abstraction more than the realism register does.
""",
    },
    {
        "id": "BG-010",
        "title": "ADR-0009 · Save state schema and persistence cadence",
        "labels": ["type:adr", "phase:2", "area:state"],
        "milestone": "M2 · Mode A core",
        "body": """
## Context

ADR-0005 commits to plain TS classes + event bus + localStorage. That gets us to "save and reload works." It doesn't commit to what persists, when, or how migrations work as the schema grows. With Mode B's water-cell state, NPC schedules, and per-lot terrain edits, the state surface gets large fast.

## Sections to write

- What persists per category (player, world, dam, terrain edits, NPCs, weather/time)
- Cadence (every action, every twilight transition, on tab-close, on explicit save)
- Schema versioning and migration path (`schema_version` field; migration functions per version bump)
- Storage budget (localStorage caps at ~5–10MB; will Mode B fit? if not, IndexedDB)
- Decision: cloud sync ever? (probably no for v0, but the ADR should explicitly close it)

## When to write this

Before Mode A's building loop (BG-013) introduces the first persistent placed-stick state. Currently the world resets on reload, which is fine. Once the first dam survives a session, we need this resolved.
""",
    },
    {
        "id": "BG-011",
        "title": "Day/night cycle + color-graded time-of-day",
        "labels": ["type:feat", "phase:2", "area:lighting", "area:render"],
        "milestone": "M2 · Mode A core",
        "body": """
**Depends on:** BG-001 (HDRI committed)

## Context

Firewatch-derived. Time-of-day is the single most expressive lever in the visual register, and Mode B's twilight-window structure is functionally non-existent without it. Build the cycle once, parameterize everything that depends on it.

## Acceptance criteria

- [ ] Time-of-day expressed as a single normalized parameter (0 = midnight, 0.5 = noon)
- [ ] Sky color, ambient color, fog color, and HDRI intensity all driven from the parameter
- [ ] Dedicated "twilight" segments (dawn ≈ 0.18–0.28, dusk ≈ 0.72–0.82) with hand-tuned color ramps — these are gameplay windows in Mode B, not just visual states
- [ ] Snap script captures three times of day (dawn, noon, dusk) in CI
- [ ] Color ramps committed as JSON (not hardcoded), so future palette tuning is a data change

## Notes

Resist the urge to wire this to a real-time clock yet. For Mode A, time-of-day advances with the player's actions or on a slow loop. The Mode B twilight-window structure is a separate concern (BG-016) and shouldn't conflate with the visual layer.
""",
    },
    {
        "id": "BG-012",
        "title": "Felling tree mechanic",
        "labels": ["type:feat", "phase:3", "area:player", "area:game-loop"],
        "milestone": "M3 · Mode A playable",
        "body": """
## Context

First Mode A verb beyond locomotion. Hold-to-gnaw, tree falls in the direction of last bite, fallen tree becomes 2–5 logs. Cozy register: tactile, audible, no UI feedback beyond what the world provides. From the planning doc.

## Acceptance criteria

- [ ] Approach a tree, hold a key (E?), audible gnaw loop, visible bark damage texture progresses
- [ ] Direction of the fall determined by the player's position relative to the tree at fell-completion
- [ ] Tree animation: pivots from base, accelerates, lands with a particle puff and audio
- [ ] Fallen tree becomes 2–5 log pickups based on the tree's `tri_budget`/scale
- [ ] Affordance metadata (asset-foundry/AF-008) consumed: only `affordance: fellable` props are gnawable
- [ ] Snap captures mid-fell and post-fell states

## Worth flagging

This needs a felling/log/dam state model that probably wants to be a small ECS-shaped thing rather than ad-hoc maps. Don't write a real ECS yet — keep state in plain TS classes per ADR-0005 — but acknowledge that this is the issue where the state model gets pressure-tested.
""",
    },
    {
        "id": "BG-013",
        "title": "Hauling logs + path-of-least-resistance navigation",
        "labels": ["type:feat", "phase:3", "area:player", "area:game-loop"],
        "milestone": "M3 · Mode A playable",
        "body": """
**Depends on:** BG-012, BG-007 (water as highway)

## Context

Hauling a log on land is slow, hauling in water is fast. This is the mechanic that makes the watershed strategically useful — every flooded street will be a new shipping lane in Mode B, and the player learns this in Mode A. From the planning doc.

## Acceptance criteria

- [ ] Pick up a log, drop a log, hauling speed modifier active while carrying
- [ ] Carry pose visible on the player rig (cross-fades from BG-009)
- [ ] Water-vs-land speed difference legible without UI feedback
- [ ] Logs can be placed at dam build sites (gates BG-014)
- [ ] Carrying disables felling (no gnawing while hands are full)
""",
    },
    {
        "id": "BG-014",
        "title": "Dam construction mechanic",
        "labels": ["type:feat", "phase:3", "area:game-loop", "area:water-sim"],
        "milestone": "M3 · Mode A playable",
        "body": """
**Depends on:** BG-013, BG-007

## Context

The third Mode A verb. Place sticks at flow-restriction points, dams have integrity from stick count + mud + current pressure, dams hold back water (gates BG-007's height-field uniform). This is where Mode A starts being a game and not a sandbox.

## Acceptance criteria

- [ ] Dam build sites identified at narrow flow points (initially: the pond's outflow into the creek bed)
- [ ] Place log → contributes to dam integrity meter (no UI; the dam visibly grows)
- [ ] Dam integrity drives a height-field uniform that raises pond level upstream
- [ ] Visible: water rises, partially-flooded ground shader, ripples at the dam face
- [ ] Persistent across save/reload (gates BG-010)

## Worth flagging

This is the issue where Mode A's water shader (BG-007), state persistence (BG-010), and game loop coalesce. It's the riskiest single Mode A issue and probably wants to be split once we get to it.
""",
    },
    {
        "id": "BG-015",
        "title": "Verify enforceVertexColorMaterials is no-op for foundry assets",
        "labels": ["type:fix", "phase:1", "area:materials", "blocks-cross-repo"],
        "milestone": "M1 · Phase 0 close-out",
        "body": """
## Context

CLAUDE.md describes `enforceVertexColorMaterials` as belt-and-braces against glTFs that didn't ship as `KHR_materials_unlit`. That's a runtime cost paid on every asset load, and it implies that asset-foundry has at some point produced glTFs that needed repair. Those should be a foundry-side guarantee, not a runtime patch.

## Acceptance criteria

- [ ] Audit current 5 foundry-produced glTFs: confirm each ships with `KHR_materials_unlit`
- [ ] If any don't: file an issue in `asset-foundry` to fix the export (likely in `_lib.py` `make_unlit_vertex_color_material`)
- [ ] Add a test: load all 5 foundry assets, assert `enforceVertexColorMaterials` performs zero swaps
- [ ] Once foundry guarantees unlit on export, demote `enforceVertexColorMaterials` to dev-only assertion (logs a warning if it would have swapped, doesn't actually swap)

## Why this is blocks-cross-repo

It's a coordinated cleanup. Don't remove the belt-and-braces until the foundry side is verified locked down. But also don't pretend the runtime patch is a permanent design — it's compensating for an upstream bug.
""",
    },
    {
        "id": "BG-016",
        "title": "ADR-0010 · Twilight window structure and time advancement",
        "labels": ["type:adr", "phase:4", "area:game-loop"],
        "milestone": "M4 · Mode B Watershed",
        "body": """
## Context

The core Mode B loop is dawn (player active, ~20 min real time) → day (timelapse, ~30s) → dusk (player active) → night (timelapse). This is fundamentally different from Mode A's slow-time-passes loop. The ADR locks how time advances, what "real-time minutes" means, and what the player can and can't do during timelapses.

## Sections to write

- Time-advancement rules in Mode A vs Mode B (Mode A is "advances with action"; Mode B is "real-time clock during windows, fast-forward between")
- What persists across the day-timelapse (NPC state changes, weather, dam clearings)
- Whether the player can pause / skip / rewind (probably no on all three, but explicit closes the question)
- How the transition from Mode A's loop to Mode B's loop reads narratively (act-progression framing)
- Consequences for save state cadence (BG-010 likely wants updating)

## When to write

Before any of Phase 4 starts. Right now Mode B is theoretical; the ADR is the concrete commitment that turns it real.
""",
    },
    {
        "id": "BG-017",
        "title": "scripts/inspect-glb.ts documentation and CLI polish",
        "labels": ["type:docs", "phase:1", "area:docs"],
        "milestone": "M1 · Phase 0 close-out",
        "body": """
## Context

`pnpm tsx scripts/inspect-glb.ts <path>` is mentioned in CLAUDE.md but undocumented. This is a debugging tool that's most useful when you're three hours into a "why does this asset look wrong" session — at which point reading source isn't great. Five-minute polish, ten-x payoff.

## Acceptance criteria

- [ ] `--help` flag describes usage and output format
- [ ] Output is human-scannable (not a JSON dump of the entire glTF)
- [ ] Highlights the things that have actually broken in past debugging: COLOR_0 attribute presence, KHR_materials_unlit extension, material counts, tri count vs declared budget if sibling `validation.json` is present
- [ ] README.md (or CLAUDE.md "Dev commands" section) gets a one-line example of typical usage
""",
    },
]


# ── asset-foundry issues (AF-001 .. AF-013) ───────────────────────────────────
ISSUES_AF = [
    {
        "id": "AF-001",
        "title": "Bump .blender-version to 4.2 LTS",
        "labels": ["type:infra", "phase:1", "area:blender-bridge"],
        "milestone": "M1 · Phase 0 close-out",
        "body": """
## Context

CLAUDE.md punch list. Currently pinned to 4.0.2 to match the local install. ADR-0002 mandates LTS pinning; 4.2 is the current LTS and the right target. Doing this now (rather than after Phase 1 work piles up) keeps the migration small.

## Acceptance criteria

- [ ] `.blender-version` reads `4.2.x` (latest patch)
- [ ] `pnpm install-blender` accepts `4.2.x` and rejects `4.0`/`4.1`
- [ ] All five fixture props regenerate with identical geometry under 4.2 (compare tri counts, bounding boxes, vertex color sums)
- [ ] `_lib.py` audited for 4.2 API drift — specifically the FLOAT_COLOR domain helpers, `bm.ops`, glTF exporter flag names
- [ ] CLAUDE.md "Punch list" entry struck

## Risks

glTF exporter flag names occasionally rename between minors. Vertex color attribute API is the more likely site of breakage — the existing notes about FLOAT_COLOR and `_activate_color` are 4.0-era and should be re-verified. Budget half a day if clean, a day and a half if exporter flags moved.
""",
    },
    {
        "id": "AF-002",
        "title": "Strip non-deterministic metadata from glTF exports",
        "labels": ["type:fix", "phase:1", "area:scene", "area:validator"],
        "milestone": "M1 · Phase 0 close-out",
        "body": """
## Context

CLAUDE.md punch list. Geometry is already deterministic — the seed-and-fresh-scene contract (§4.4) takes care of that. What still drifts is `asset.extras.generator` and the export timestamp baked into the glTF. Stripping those makes byte-identical reruns possible, which means the validator can hash artifacts and the visual regression layer (AF-003) gets a free fast-path skip.

## Acceptance criteria

- [ ] SceneAssembler's export step removes `asset.extras.generator` and any timestamp fields post-export
- [ ] Two consecutive runs of `pnpm gen-asset birch_sapling` produce byte-identical `.glb` files (verify with `sha256sum`)
- [ ] Validator records the SHA-256 of the artifact in `<id>_v1.validation.json` for downstream caching
- [ ] Test: regenerate all 5 fixture props twice, assert hash equality

## Notes

If Blender's glTF exporter writes the generator field at C level and there's no Python flag for it, the cleanup happens after export by patching the JSON chunk of the binary glTF in place. Not elegant but small.
""",
    },
    {
        "id": "AF-003",
        "title": "Visual regression baselines for every prop",
        "labels": ["type:test", "phase:1", "area:validator", "area:scene", "area:ci"],
        "milestone": "M2 · Pipeline hardening",
        "body": """
**Depends on:** AF-002 (byte-identical reruns make threshold tuning tractable)

## Context

CLAUDE.md punch list. The validator currently gates on tri budget and the FOUNDRY_SUMMARY shape — an asset that passes the budget can still regress visually. This is the single highest-leverage test layer for the whole pipeline because most real bugs in this system are "the model looks wrong now."

## Acceptance criteria

- [ ] SceneAssembler renders three fixed angles per prop (front, three-quarter, top-down) against a neutral gray HDRI at fixed light position and exposure
- [ ] PNG outputs land under `dist/baselines/<prop_id>/{front,three_quarter,top}.png`
- [ ] Initial baselines committed for all five current props (`birch_sapling`, `ground_pond_meadow`, `water_pond`, `sky_dome`, `beaver_basic`)
- [ ] Perceptual diff (`pixelmatch` or `image-ssim`) runs in CI with an explicit threshold
- [ ] CI fails on diff above threshold; failure artifact uploads the diff PNG and the new render alongside the baseline
- [ ] Threshold and rendering setup documented in a new ADR-0006

## Trap to avoid

Threshold tuning is the failure mode. Too loose and we miss real regressions, too tight and CI is noise. Start at SSIM ≥ 0.98 per angle; tune empirically over the first two weeks. Document the tuning process in the ADR so future-you knows why the number is what it is.

## Open question

Render at what resolution? 512×512 is fast and forgiving; 1024×1024 catches more silhouette regressions but doubles CI time. Default to 512 unless the spike shows otherwise.
""",
    },
    {
        "id": "AF-004",
        "title": "Tests for parsing.ts (FOUNDRY_SUMMARY edge cases)",
        "labels": ["type:test", "phase:1", "area:orchestrator"],
        "milestone": "M2 · Pipeline hardening",
        "body": """
## Context

CLAUDE.md punch list. `src/orchestrator/parsing.ts` extracts two things from LLM/Blender output: the bpy script from a fenced reply, and the `FOUNDRY_SUMMARY {...}` JSON line from Blender stdout. Both have failure modes that aren't covered today. This is the parser the entire pipeline depends on.

## Acceptance criteria

- [ ] Test fixtures committed for: missing summary line, malformed JSON, multiple summary lines (last wins?), summary on non-final line, unicode in field values, `tri_count: 0` (rejection path)
- [ ] Test fixtures for the script extractor: no fence, multiple fences (first? last?), nested fences, `python` vs `py` language tag, no language tag
- [ ] Each malformed input produces a structured error (not a silent fallback or a thrown exception that escapes)
- [ ] The "multiple fences" and "multiple summary lines" semantics get documented inline (decisions, not accidents)

## Why this matters

The pipeline silently passing on malformed parser input is the worst kind of bug — nothing fails until someone notices the asset looks wrong six commits later. Lock the contract.
""",
    },
    {
        "id": "AF-005",
        "title": "Tests for validator/index.ts (rejection paths)",
        "labels": ["type:test", "phase:1", "area:validator"],
        "milestone": "M2 · Pipeline hardening",
        "body": """
## Context

CLAUDE.md punch list. The validator is the contract. It's the deterministic gate between LLM output and consumer. Right now its happy path is exercised by every `pnpm gen-asset` run, but its rejection paths are not.

## Acceptance criteria

- [ ] Test that `tri_count > tri_budget` rejects with a structured error
- [ ] Test that missing `material_slots` rejects
- [ ] Test that the `prop_id` in the summary mismatching the manifest entry rejects
- [ ] Test that a malformed `bounding_box` rejects
- [ ] Test that the validator writes `<id>_v1.validation.json` even on rejection (downstream needs to see why)
- [ ] Document the rejection error shape — this is what the orchestrator routes back to AssetSculptor on retry

## Note on retry semantics

This is the layer where structured rejection errors enable the orchestrator to feed legible error context back to the AssetSculptor. The test suite doubles as the spec for that error shape. Worth thinking about whether rejection error format itself wants an ADR.
""",
    },
    {
        "id": "AF-006",
        "title": "MaterialArtist palette injection into bpy scripts",
        "labels": ["type:feat", "phase:1", "area:material", "area:sculptor"],
        "milestone": "M2 · Pipeline hardening",
        "body": """
## Context

CLAUDE.md punch list. MaterialArtist currently produces a "material plan" in state but the plan is a no-op — the bpy script generated by AssetSculptor doesn't read it. The biome palette in `manifest/world.yaml` (the `pond_meadow` palette: `forest_green`, `dawn_gold`, `slate_blue`) should drive vertex color choices in the sculpted asset.

## Acceptance criteria

- [ ] MaterialArtist's output gets passed into AssetSculptor's prompt context (or post-processes the script)
- [ ] Generated bpy scripts reference the palette by name (e.g. `PALETTE["forest_green"]`) rather than hardcoded hex
- [ ] `_lib.py` exposes a palette dict resolved from the active biome
- [ ] Re-running `pnpm gen-asset birch_sapling` against a palette-altered manifest produces a visibly different asset (verify via AF-003 baselines if available)
- [ ] Decision recorded: is palette injection prompt-context (LLM-controlled) or post-process (deterministic)? ADR-worthy.

## Open question

Prompt injection vs post-process is a real ADR. Prompt-context lets the LLM make stylistic palette choices ("the bark is darker than the leaves"); post-process is deterministic and testable but loses that judgment. My instinct is prompt-context with a palette enum the LLM must pick from, but it's worth a short ADR.
""",
    },
    {
        "id": "AF-007",
        "title": "ADR-0006 · Visual regression configuration and threshold",
        "labels": ["type:adr", "phase:1", "area:docs"],
        "milestone": "M2 · Pipeline hardening",
        "body": """
**Pairs with:** AF-003

## Context

AF-003 needs a threshold and a rendering configuration. Both are decisions worth recording before the implementation calcifies. The ADR captures: render resolution, lighting setup, perceptual diff library, threshold per angle, what counts as "the same baseline" across Blender version changes.

## Sections to write

- Decision: which perceptual diff library, why
- Decision: render resolution and lighting rig
- Decision: threshold value and how it's tuned
- Decision: how baselines get updated (PR with explicit "regenerate baselines" label?)
- Consequences: CI runtime cost, false-positive rate, what we lose if we drop this layer later
""",
    },
    {
        "id": "AF-008",
        "title": "ADR-0007 · Affordances field on prop schema",
        "labels": ["type:adr", "phase:3", "area:manifest"],
        "milestone": "M4 · Mode B prep",
        "body": """
## Context

Mode B prep. From the Untitled Goose Game reference: every prop in the suburb should afford something — a flowerpot is a clogger, a garden hose is a chewable redirector. The asset manifest's prop entries currently have no concept of this. Adding it now (before the manifest grows from 5 props to 200) keeps the schema migration small.

## Sections to write

- Decision: affordance shape (string enum? string array? structured object with parameters?)
- Decision: which props get affordances and which don't (vegetation no, infrastructure yes?)
- Consequences: WorldDesigner's prompt needs to know about affordances; the game client's loader needs to read them; affordances become a runtime contract that the validator should enforce

## Worth flagging

This ADR is also where the manifest and game runtime couple, which is the first real cross-repo concern. Discuss in beaverGame's ADR list too.
""",
    },
    {
        "id": "AF-009",
        "title": "ADR-0008 · Wet-state variant strategy",
        "labels": ["type:adr", "phase:3", "area:manifest", "area:scene"],
        "milestone": "M4 · Mode B prep",
        "body": """
## Context

Mode B prep. Every submersible asset in the suburb needs at least two visual states (above water, half-submerged, fully submerged). Doing this as geometry variants triples our asset count; doing it as a shader on the game side keeps the asset count flat but pushes complexity into the runtime. This is one decision that cascades through everything downstream.

## Sections to write

- Option A: geometry variants (one `.glb` per state per prop)
- Option B: shader-driven (single asset, water-line uniform displaces or recolors fragments below)
- Option C: hybrid (most props use shader; a few hero props get authored variants)
- Decision and rationale
- Consequences for tri budget, asset pipeline, runtime shader complexity, fixed-camera angle exploitation

## My instinct

Option B for everything that doesn't need authored bend (most props), Option C for hero props (the HOA mailbox tilting under flood; a flag still standing while everything around it submerges). But this should be spiked, not assumed.
""",
    },
    {
        "id": "AF-010",
        "title": "MCP TCP bridge implementation",
        "labels": ["type:feat", "phase:2", "area:blender-bridge"],
        "milestone": "M3 · Mode A asset coverage",
        "body": """
## Context

CLAUDE.md mentions `FOUNDRY_USE_MCP=1` as opt-in, "not yet implemented." The subprocess path works fine for everything Phase 0 needs — but the MCP bridge unlocks live Blender sessions, which become useful when interactive iteration matters (sculpting passes that benefit from human-in-the-loop, debugging asset generation by stepping through). This is also the path that connects to the broader blender-mcp ecosystem (Poly Haven, Hyper3D Rodin) if we ever want either.

## Acceptance criteria

- [ ] TCP client connects to a running Blender on port 9876 (matching the canonical blender-mcp addon)
- [ ] When `FOUNDRY_USE_MCP=1`, SceneAssembler routes through the TCP bridge instead of subprocess
- [ ] The §4.4 Python contract is enforced over both transports — same script runs unmodified
- [ ] Fallback: if `FOUNDRY_USE_MCP=1` is set but the TCP socket is unreachable, error clearly (don't silently drop back to subprocess)
- [ ] Documented in CLAUDE.md "Environment" section

## Worth thinking about

The subprocess path is the production path. The MCP path is for development. The CI workflow should pin to subprocess. Worth being explicit about this in the implementation rather than assuming.
""",
    },
    {
        "id": "AF-011",
        "title": "WorldDesigner regression tests against the Zod schema",
        "labels": ["type:test", "phase:1", "area:orchestrator", "area:manifest"],
        "milestone": "M2 · Pipeline hardening",
        "body": """
## Context

WorldDesigner is the only sub-agent that writes to the manifest. ADR-0004 codifies this. But there's no regression test ensuring that what WorldDesigner emits round-trips through the Zod schema cleanly. A drift here breaks every downstream agent silently.

## Acceptance criteria

- [ ] A test that runs WorldDesigner against a fixed input prompt and asserts the output passes Zod validation
- [ ] Tests for adversarial inputs: prompt injection, schema-confusing requests ("add a prop with no `tri_budget`"), requests that try to write outside the manifest
- [ ] WorldDesigner's system prompt asserts that its only valid output is YAML matching the schema; the test enforces this
- [ ] The "fixture-mode" path (no API key) covers WorldDesigner too — currently fixtures only exist for AssetSculptor

## Connects to

This is the pattern AF-004/005 establishes generalized to the manifest writer. Each sub-agent should have an analogous regression layer eventually.
""",
    },
    {
        "id": "AF-012",
        "title": "Frame-OS context doc cross-link",
        "labels": ["type:docs", "phase:1", "area:docs"],
        "milestone": "M1 · Phase 0 close-out",
        "body": """
## Context

CLAUDE.md says "First read for new sessions: `domain-knowledge/frame-os-context.md`, then `domain-knowledge/langgraph-patterns.md`." Those files are symlinked from `core/domain-knowledge/` via `install-agents.sh`, but a fresh clone without the sibling `core` repo will see broken symlinks. Either commit a stub that points to the canonical location, or update CLAUDE.md to be explicit about the dependency.

## Acceptance criteria

- [ ] Verify whether `domain-knowledge/` resolves correctly in this repo (symlink target exists)
- [ ] If symlinks are present but broken in some configurations: update CLAUDE.md with a "If you don't see these files, you need ojfbot/core checked out as a sibling and run install-agents.sh" callout
- [ ] Decision recorded somewhere about how cross-repo doc sharing works in the ojfbot ecosystem

## Why this matters

This is the sort of paper cut that a senior engineer notices once and then trips over for months. Worth fixing now while the doc surface is small.
""",
    },
    {
        "id": "AF-013",
        "title": "CI: asset-foundry → beaverGame sync verification",
        "labels": ["type:infra", "phase:1", "area:ci", "blocks-cross-repo"],
        "milestone": "M2 · Pipeline hardening",
        "body": """
## Context

The pipeline auto-syncs into `../beaverGame/public/assets/`. In local dev that's a sibling-directory write. In CI, both repos need to be checked out, the foundry needs to build, and the resulting assets need to land in the right place. Right now I don't see (in the public surface) that this is verified end-to-end.

## Acceptance criteria

- [ ] CI workflow that checks out both repos as siblings, runs `pnpm gen-asset` on a fixture, and verifies the asset lands in the expected `beaverGame` path
- [ ] Verify the `<id>_v1.validation.json` lands too
- [ ] If the cross-repo sync fails, CI should fail with a useful message (not "file not found" with no context)
- [ ] If `beaverGame` is unavailable in CI (forked builds, etc.), the workflow should degrade gracefully

## Coordination

This needs a matching workflow on the `beaverGame` side — when foundry pushes new assets, beaverGame's build needs to consume them.
""",
    },
]


def main():
    for issue in ISSUES_BG:
        path = write_issue(BG_REPO, issue["id"], issue["title"], issue["labels"], issue["milestone"], issue["body"])
        print(f"  wrote {path.relative_to(BG_REPO)}")
    for issue in ISSUES_AF:
        path = write_issue(AF_REPO, issue["id"], issue["title"], issue["labels"], issue["milestone"], issue["body"])
        print(f"  wrote {path.relative_to(AF_REPO)}")


if __name__ == "__main__":
    main()
