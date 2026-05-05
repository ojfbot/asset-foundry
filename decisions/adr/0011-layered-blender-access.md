# ADR-0011: Layered Blender access — kernel MCP + foundry domain (peer transports)

Date: 2026-05
Status: Accepted
OKR: 2026-Q2 / O2 / KR1 (assistant-centric architecture)
Commands affected: `pnpm foundry asset:generate`, `claude mcp add blender`, `claude mcp add foundry`
Repos affected: asset-foundry
Extends: [ADR-0009](0009-mcp-transport-stance.md)

---

## Context

Asset-foundry has shipped its Blender access as a single subprocess path: `blender --background --python <script> -- <out> <materials>` from `src/blender/blender-runner.ts`. That contract carried us through Phase 0–3 and is the right fit for CI and offline runs (no GUI Blender required, deterministic, headless).

Two facts make a single-path approach insufficient going forward:

1. **The community has converged on `ahujasid/blender-mcp` as the kernel interface to Blender.** It exposes scene primitives (`get_scene_info`, `get_object_info`, …), material plumbing, asset library lookups (Poly Haven, Hyper3D Rodin), and an `execute_blender_code` escape hatch. Once installed, it is the de facto "Claude Blender connector" — available to every project, not just foundry.

2. **For interactive design sessions where Blender is already running**, starting a fresh `blender --background` is wasteful. Cold start is several seconds; we lose the running scene state; and we cannot observe the result in the viewport. The kernel path runs against the live Blender, preserving scene + giving live visual feedback.

These are genuinely different use cases. Subprocess is the contract for **headless / CI / offline / deterministic generation**; kernel-MCP is the contract for **interactive / live-viewport / fast-iteration design**. Neither is degraded — they are peer transports. Foundry retains its domain value-add (manifest schema, LangGraph orchestrator, palette/material plan, validator, run history) on top of *whichever* transport is in use.

This ADR locks how foundry talks **down** to Blender. ADR-0009 governs how clients talk **up** to foundry; that decision is unchanged.

## Decision

### Two peer transports behind one stable internal contract

The public export `runBlenderScript(opts: RunOptions): Promise<RunResult>` keeps its current shape (`{scriptPath, outPath, materials, scriptsDir}` → `{stdout, blenderVersion}`). Its single call site, `src/orchestrator/nodes/scene-assembler.ts`, is unchanged.

Below it, two implementations of `BlenderTransport`:

| Transport | Selector value | When it runs | What it does |
|----|----|----|----|
| `SubprocessTransport` | `subprocess` (default) | CI, offline, headless, Blender-not-running | Runs `blender --background --python …` as a fresh process. Owns the standard Blender stdout banner that carries the version string. Identical to the pre-ADR-0011 behaviour. |
| `KernelMcpTransport` | `kernel` | Interactive sessions with Blender open + `blender_mcp` addon enabled | Opens an MCP **client** (over stdio, via `@modelcontextprotocol/sdk`) against `uvx blender-mcp`. Sends the bpy script through the kernel's `execute_blender_code` tool. The user's live Blender executes it. |

Selection is explicit: `FOUNDRY_BLENDER_TRANSPORT=subprocess|kernel`. The default is `subprocess` to preserve current CI behaviour; opting into the kernel path is a deliberate session-level choice. Auto-detection (probe kernel, fall back) is **not** in v1: explicit beats clever, and a silent fallback would mask broken kernel setups.

### The `__file__` / `sys.argv` shim

Foundry fixtures depend on the standard Blender script invocation contract:

```python
sys.path.insert(0, os.path.dirname(__file__))   # needs __file__
from _lib import parse_argv, ...
OUT_PATH, MATS = parse_argv()                    # reads sys.argv past `--`
```

Subprocess satisfies this naturally (`blender --python <path> -- <out> <mats>` sets both). `execute_blender_code`, however, runs Python via `exec`, which provides neither. The kernel transport wraps the script with a small bootstrap:

```python
import bpy, sys, runpy
print(f"Blender {bpy.app.version_string}")
sys.argv = [<scriptPath>, "--", <outPath>, <matsPath>]
runpy.run_path(<scriptPath>, run_name="__main__")
```

`runpy.run_path` sets `__file__` and `__name__` for the executed module — keeping the fixture contract intact. The version banner (`print(f"Blender {bpy.app.version_string}")`) is the same regex the subprocess parser already consumes, so version-pin enforcement (ADR-0002) needs no special-casing per transport.

### Foundry's externally-facing MCP is unchanged

`foundry.asset.generate` and the rest of the registry from ADR-0009 keep their shapes. The kernel-MCP client lives **inside** foundry's MCP server process; it is invisible to foundry's clients. This is the kernel/userspace pattern: foundry is a userspace MCP that uses the kernel MCP through a client connection, while exposing its own higher-level domain tools to its callers. The "one shared tool registry" rule from ADR-0009 is unaffected — both stdio and HTTP+SSE foundry transports continue to dispatch the same handlers.

### Pin enforcement and output-file checks stay at the runner

`SubprocessTransport` and `KernelMcpTransport` both produce a `RunResult` carrying `blenderVersion`. The runner (`blender-runner.ts`) compares against `.blender-version` (ADR-0002) and verifies `outPath` exists — transport-agnostic invariants. This keeps each transport narrow: it just executes the script and reports back.

### Kernel client lifecycle: per-call in v1

`KernelMcpTransport` opens a fresh client connection per `runBlenderScript` call and closes it in `finally`. A long-lived pooled client would be faster (kernel stays warm; Blender's interpreter state survives between props), but lifecycle handling pushes complexity into `runBlenderScript`'s call sites. v1 prioritises correctness; pool comes back as Phase-4-or-later work if measured latency hurts.

## Consequences

### Gains
- Interactive design sessions skip Blender's cold start. Generating a prop against a running Blender shows up live in the viewport instead of as a `.glb` on disk that has to be reloaded.
- Asset-foundry's tools become composable with the kernel's tools at the Claude session layer: a single conversation can call `blender.get_scene_info` to inspect, then `foundry.asset.generate` to produce, then `blender.execute_blender_code` to tweak. Clean kernel/userspace separation.
- Headless CI is unchanged. Zero regression on the existing test/build path. The default is subprocess and the runner's pin/output checks are transport-agnostic.
- Future kernel transport variants (HTTP, if ahujasid ships one; a Python-package import if foundry ever runs in-process) plug into the same `BlenderTransport` interface. The selector is the only choke point.

### Costs
- Two paths to maintain. Accepted because they are genuinely different use cases (peer, not redundant). The `BlenderTransport` interface is small (one method); the duplication is bounded.
- Kernel mode introduces a hard dependency on `uvx` + the `blender-mcp` Python package + the `blender_mcp` Blender addon being installed and active. We surface a clear error on `client.connect` failure pointing at all three preconditions.
- Two-process call chain (foundry server → kernel server → Blender). More moving pieces during a session; harder to debug when something hangs (the addon's TCP server inside Blender is a third hop). The error message in `KernelMcpTransport` enumerates the preconditions to make this tractable.

### Neutral
- `BLENDER_BIN` keeps applying to the subprocess path only. Kernel mode delegates binary selection to the user's Blender install + uvx — there is no equivalent pin at the foundry layer because the version-banner check still gates kernel runs.
- `_materials.json` is written by both transports identically; the kernel script reads it via the same `parse_argv` contract.

## Alternatives considered

| Alternative | Why rejected |
|----|----|
| Replace subprocess outright | Loses headless / CI / offline. Kernel mode requires a running Blender + addon — neither is guaranteed in CI or non-interactive runs. The user explicitly called out: headless must remain first-class alongside GUI. |
| Auto-detect (try kernel, fall back to subprocess) | Silent fallbacks mask broken kernel setups. A user who installed the addon expects an error if the kernel cannot be reached, not a silent regression to slow subprocess mode. Explicit env var is also trivially scriptable. |
| Skip the kernel client and talk directly to the addon's TCP socket | Feasible but defeats the framing. The kernel is the published interface; bypassing it means foundry must track the addon's wire protocol independently. Kernel/userspace is the cleaner model. |
| Long-lived pooled kernel client in v1 | Extra lifecycle complexity without measured need. Defer. |
| Make the kernel transport a separate package | Asset-foundry already depends on `@modelcontextprotocol/sdk`. The new code is ~80 lines; a package split is overkill. |

## Open items

- **Pooled kernel client.** Promote to long-lived if multi-prop runs against the kernel show enough wall-time win to justify the lifecycle code.
- **Auto-detect helper, opt-in.** A diagnostic command (`pnpm foundry doctor`?) that probes the kernel and reports preconditions would be useful — separate from the transport's runtime behaviour.
- **HTTP variant of the kernel.** If/when ahujasid ships an HTTP kernel, add `KernelHttpTransport` behind the same `BlenderTransport` interface and extend the selector vocabulary.
- **Streaming progress over the kernel.** `execute_blender_code` is request/response. If foundry's `notifications/progress` (ADR-0009 Phase 3.5) needs to stream Blender-side progress, we may need additional kernel tools or a side channel.
