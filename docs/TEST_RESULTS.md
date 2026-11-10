# Observed verification evidence — 2026-11-10 (v0.7)

**Environment**: Linux container, CPython 3.13, NumPy, ReportLab, Node 22 + TypeScript 5.x, Playwright Chromium on a **software** WebGL rasteriser (SwiftShader). The container holds a subset of the SLAI checkout (StringLab, `applications/tools`, `src/utils/{sgeo,sdrw,sldc}` and the agents that import). It is **not** the Windows checkout and has no GPU. Placeholder `applications/assets/{logo,home}.png` existed only in the container to avoid 404s; your checkout has the real ones.

## Executed, all passing

```text
python -m pytest applications/stringlab/tests -q          -> 111 passed (0 skipped)
    99 solver / agent / export / storage / route tests
    12 real-browser tests (tests/test_browser_client.py)
npm test                  (applications/stringlab, tsx)   -> 36 passed
npm run test:compiled     (applications/stringlab)        -> 36 passed
npm test                  (applications/tools)            -> 38 passed (kit, shared 3D maths, start-up loader)
npm run typecheck / npm run build                         -> clean
python -m applications.stringlab --check                  -> SGEO, SDRW, SLDC, PDF, STEM, Simulation, Animation available
```

The 12 browser tests run the built client against a live server and **fail on any console error/warning, page error or HTTP ≥ 400**: boot with WebGL2; all 12 presets load and are scrubbed; a parameter edit recomputes; play/pause/step; orbit, wheel zoom, fit, view keys 1–4/0, vertex pick and PNG snapshot; toolbar toggles, all themes, all colour modes; all 9 tabs; the agents panel (STEM verification, unit conversion, Animation tracks, publish, animated `.sgeo` download, Simulation rollout); export/library/open/settings/help dialogs; save and reopen an experiment; the 2D canvas fallback (`?renderer=2d`); and a 700 px layout with drawers and no horizontal scroll.

Bugs found by this testing and fixed: the server refused to start from a fresh build (it checked for the retired `dist/app.js`); the off-screen drawer caused horizontal scroll at narrow widths; the transport bar wrapped at 1500 px; orbit inertia overshot after a slow release; the colour ramp used the array index as alpha; several null-child DOM errors.

Screenshots were inspected by eye in light, dark and high-contrast themes, every tab, the worldsheet at mid-run with speed colouring, agent material-point rings, the 2D fallback and the narrow drawer. Pixels are not asserted by any test.

Native SGEO/SDRW/SLDC writers and readers ran for real here (their tests did not skip), so export → strict validation → re-read is observed in this container. A hand inspection in SPADRA/CADCon is still missing.

## Not verified

- Windows launch and Windows file paths; real GPU rendering and frame rates; WebM recording in a real browser (only the button's presence is exercised).
- Verification and Provenance agents (not importable in the container), SLAI SharedMemory beyond publish/read-back, any agent behaviour on your checkout.
- SPADRA after its `math3d.ts` became a re-export: its kit-level tests pass, but its own app was not rebuilt or run.
- GitHub CI. The workflow in `.github/` was updated for the new build entry but has not run, and the Python tests need the SLAI `applications.tools` and `src` packages, so a standalone clone of this folder cannot pass them; treat CI as unverified.

## Run in your folder through the desktop link (2026-11-10, after the files were written back)

This was the Linux shell the desktop app provides over `G:\GAIA\AI\SLAI` (Python 3.10, NumPy 2.2.6, Node 22, global `tsc`); it is not your Windows venv. It has no pytest or Playwright, and the installed `node_modules` there are Windows builds (esbuild/tsx cannot run), so tests were compiled with `tsc` and run with `node --test`.

- `python -m applications.stringlab --check`: StringLab 0.7.0; **SGEO, SDRW and SLDC adapters available** from your real checkout; **STEM, Simulation and Animation agents reported UNAVAILABLE** in that shell with `AttributeError: module 'colorama' has no attribute 'just_fix_windows_console'` (the shell's `colorama` is too old; the agents module needs a newer one). This is an environment issue that StringLab surfaces with its reason in the *SLAI agents* panel; check your Windows venv with the same `--check` command. In the container the same three agents were available.
- `tsc` typecheck of StringLab and of SPADRA (with `math3d.ts` now a re-export): clean.
- StringLab TypeScript tests: 36 passed. Shared kit and shared 3D maths tests: 32 passed (the start-up loader test needs to run in place, so it was not meaningful from a temp output folder).
- Not run there: the Python suite, the browser tests, SPADRA's own tests, and anything on Windows or a GPU.
