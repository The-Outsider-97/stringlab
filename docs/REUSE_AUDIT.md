# Reuse audit — what StringLab takes from SLAI and what it deliberately does not duplicate (v0.7, 2026-11-10)

Rule applied: if SLAI already has it, StringLab imports it; if StringLab needed something SPADRA already had privately, it was **promoted into the shared kit** and SPADRA now imports it from there, so there is one copy.

## Front end (`applications/tools/web/src`, imported only through `src/client/kit.ts`)

| Need | Used from the shared kit | StringLab-only code |
| --- | --- | --- |
| DOM building, labels, live announcements | `dom.ts` (`h`, `s`, `replace`, `labelled`, `nextId`, `announce`) | none |
| Server calls, envelope, session cookie, marker header, errors, download/upload | `api.ts` (`createClient`, `ApiError`, `download`, `upload`) | typed endpoint list (`services.ts`) |
| Dialogs, menus, toasts, clipboard, saving files | `ui.ts` (`openDialog`, `confirmDialog`, `promptDialog`, `openMenu`, `toast`, `copyText`, `saveBlob`) | dialog *content* only (`dialogs.ts`) |
| Icons | `icons.ts` (`glyph`, `registerGlyph`) | a few physics glyphs registered through `registerGlyph` |
| Theme, contrast, text scale, motion | `theme.ts` (`appearanceControls`, `applyAppearance`, `normaliseAppearance`) and `slai-ui.css` tokens | viewport/chart colours read from the same CSS tokens (`colours.ts`) so the 3D scene follows light/dark/contrast |
| Events, clamping, debouncing, plurals | `util.ts` (`Emitter`, `clamp`, `debounce`, `plural`) | none |
| **Orbit camera, view/projection matrices, orbit/pan/zoom-at-cursor, ray tests, home views** | `math3d.ts` — **moved from SPADRA into the kit** (unit-tested there); SPADRA's own `math3d.ts` is now a re-export | none: StringLab has no 3D maths of its own |
| Start-up splash | `startup/loader.js` / `.css`, published by the shared builder | event hooks in `main.ts` |
| Build | `tools/build/build-static.mjs` (one builder for every SLAI app) | tsconfig only |

## Back end (Python)

| Need | Used from SLAI | Notes |
| --- | --- | --- |
| HTTP server, auth, routing, envelopes, errors | `applications.tools.server`, `errors`, `storage` | StringLab registers routes only |
| SGEO / SDRW documents | `src.utils.sgeo`, `src.utils.sdrw` public facades | writer → strict validation → reader round trip before anything is shown |
| Editable report | `src.utils.sldc` | |
| Unit conversion, quadrature, uncertainty propagation | STEM Agent (`src.agents.stem_agent`) | StringLab does **not** reimplement units or error propagation; it compares the agent's numbers with its own solver |
| Rollout with seed / run id / termination | Simulation Agent | proven identical to the direct solver |
| Keyframe tracks and their evaluation | Animation Agent + SGEO animation tracks | exported as animated `.sgeo` |
| Cross-agent diagnostics | SharedMemory | revision-tagged and bounded |

Agents are reached through one adapter (`agent_hub.py` / `agents.py`) that reports availability and the reason when an agent cannot load. The route `/api/agents/run` (a generic "run any agent" endpoint) was removed: each use is a specific, validated route.

## Duplication removed inside StringLab

- One finite-difference stepper (`FDStepper`); the series route, the Simulation Agent rollout, convergence and sweeps all call it.
- One scene builder (`scene.ts`) feeds both renderers (WebGL2 and 2D); one `Store` feeds every panel; one playback clock drives viewport, charts and readouts.
- The previous client (`app.js`-era files, `sgeo_view`, its own camera and canvas projection) was deleted, not kept beside the new one.

## Deliberately not used

The panel *SLAI agents* lists these with reasons: Verification and Provenance agents are only used when importable (they were **not** importable in the test container, so that path is untested), and language/planning agents have no role in deterministic physics. SPADRA's project-bound ModelView is not a reusable library, so the viewport is StringLab's, built on the shared camera maths.

## Still open

- Promoting the WebGL line/point/triangle renderer into the kit would let SPADRA and others reuse it; it is currently StringLab-only (`renderer.ts`) because nothing else consumes it yet.
- SPADRA's compiled `dist/` was not rebuilt after its `math3d.ts` became a re-export; rebuild it before running SPADRA.
