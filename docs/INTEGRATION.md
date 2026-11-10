# SLAI integration contract and release checklist (v0.7, 2026-11-10)

What is integrated, how, and what still has to be confirmed on the real Windows SLAI v2.4 checkout. See `REUSE_AUDIT.md` for the line-by-line list of shared pieces.

## What StringLab consumes from SLAI

- **Server**: `applications.tools.server` (`LocalServer`, `Router`, `ServerOptions`, `serve`, `file_response`), `applications.tools.errors`, `applications.tools.storage`. Loopback only, session cookie from the tokenised start-up URL (the URL is then redirected, so a query such as `?renderer=2d` is added *after* start-up), cross-origin protection and the `X-SLAI-Stringlab` write marker.
- **Interface kit**: `applications/tools/web/src` (DOM, API client, dialogs/menus/toasts, icons, appearance, utilities, **3D camera maths**) imported only through `src/client/kit.ts`; tokens from `slai-ui.css`; start-up splash from `startup/loader.*`. The 3D camera maths were promoted from SPADRA into the kit; SPADRA now re-exports them.
- **Native formats**: `src.utils.sgeo` / `src.utils.sdrw` / `src.utils.sldc` public facades. Every export is written, strictly validated, parsed back and validated again before it is offered. SGEO/SDRW are coordinate **projections**, not stored D-dimensional states; keep the JSON as the scientific source of truth.
- **Agents** (one adapter, `agent_hub.py`/`agents.py`; availability and the reason an agent cannot load are reported in `/api/agents/status` and shown in the *SLAI agents* panel):

| Agent | Used for | Check StringLab makes |
| --- | --- | --- |
| STEM | unit-aware scales, Simpson quadrature of the energy, wave-equation residual, uncertainty propagation, unit conversion | agent energy vs the solver's energy, residual of the analytical solution, closed-form law for the sensitivity |
| Simulation | finite-difference run as a recorded rollout (seed, run id, termination) | frames identical to the direct `FDStepper` solve |
| Animation | material points as SGEO keyframe tracks; animated `.sgeo` export | evaluated track positions vs the solver at samples between keyframes |
| SharedMemory | revision-tagged, bounded diagnostics for other agents | read-back of what was published |

Verification and Provenance agents are used only when importable. They were **not** importable in the test container (`src.agents.verification_agent` failed to import there), so neither path is tested. Nothing in the physics requires an agent.

## Routes added or changed in this version

`/api/agents/{status,publish,stem,convert,simulate,animate}`, `/api/export/sgeo-animated`, `/api/sgeo/scene`, `/api/prefs` (GET/PATCH, validated: theme, scale, motion, speed ∈ {0.25, 0.5, 1, 2, 4}, trail 0–240, beads 0–48, loop, camera, colour-by, grid/axes/worldsheet, auto-orbit, source). The earlier generic `/api/agents/run` was removed (answers 404). Launch now checks the real client entry (`dist/js/stringlab/src/client/main.js`); the previous check looked for a file the build no longer produces and would have refused to start from a fresh build.

## Release checklist on the target checkout (not yet executed there)

1. `python -m applications.stringlab --check` — expect native adapters and STEM/Simulation/Animation available; note what it says for the other agents.
2. `python -m pytest applications\stringlab\tests -q` — the native and browser tests must run, not skip.
3. `npm.cmd install`, `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd test` in `applications\stringlab`; also `npm.cmd test` in `applications\tools` and rebuild SPADRA (its `math3d.ts` is now a re-export).
4. Launch, open the tokenised URL, load every preset, edit parameters, play/scrub, orbit/zoom/pan/pick on a **real GPU**, switch light/dark/contrast, resize to a narrow window, use the keyboard only.
5. Run the SLAI agents panel actions and confirm every verdict shows as checked; export animated `.sgeo`, SGEO, SDRW, CSV, JSON, PDF, SLDC and reopen the SGEO/SDRW in SPADRA / CADCon.
6. Save an experiment, reopen it, and trigger a revision conflict from two browser tabs.
7. Malformed input, corrupt native archive, high-mode invalid closure, CFL-limited run: confirm specific, non-corrupting errors.
8. Record machine specs and frame rates for the 3D viewport on the largest runs.

## Known gaps

No Verification/Provenance agent path was executed; no GPU run; no Windows run; no SPADRA/CADCon round trip; the WebGL renderer is StringLab-only (not yet a shared kit module); SGEO-to-physical-state inverse solving, general curved targets, full CFT/BRST, superstrings with interactions and Calabi–Yau metrics remain out of scope and are labelled so in the UI.
