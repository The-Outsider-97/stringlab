# SLAI StringLab — scientific computing application (v0.7)

## Installable Windows application (Tauri 2)

StringLab now includes a **Tauri 2 desktop host** that starts the unchanged local SLAI Python service automatically in a native Windows WebView2 window. Development uses the SLAI venv; release uses a PyInstaller-bundled Python runtime. Source-level integration is provided; a Windows installer is **not yet verified or signed**. See [docs/TAURI_DESKTOP.md](docs/TAURI_DESKTOP.md) for build instructions, security model and release acceptance tests.


**A real, locally computed research-support application with multiple bounded classical and quantum model solvers—not a complete string-theory simulator.** It uses analytical free-bosonic light-cone string equations, a numerical transverse wave solver, a finite critical-bosonic Fock-spectrum calculator, and 3D projections. A model is classified *physical in the restricted classical setup* only when the checked constraints permit that description. Its results are **not experimental confirmation of string theory**.

> **Status notice (2026-11-10)**: the Python solvers, the SLAI integrations (SGEO/SDRW/SLDC facades, STEM, Simulation and Animation agents, SharedMemory) and the rewritten TypeScript client were verified in a Linux container that holds a subset of the SLAI checkout: 111 Python tests (including 12 real-Chromium tests of the built client with zero tolerated console errors), 36 StringLab TypeScript tests and 38 shared-kit tests all pass, with no skips. **Not yet run on your Windows machine**: the Windows launch, a real GPU (the container used a software WebGL rasteriser), the Verification and Provenance agents (not importable in the container) and a SPADRA/CADCon round trip of exported files. `docs/TEST_RESULTS.md` has the exact evidence and `docs/INTEGRATION.md` the checklist for your checkout.

## Install on Windows (PowerShell)

```powershell
# First extract stringlab.zip. Its root contains stringlab/.
Expand-Archive -Path .\stringlab.zip -DestinationPath G:\GAIA\AI\SLAI\applications\ -Force
cd G:\GAIA\AI\SLAI

# Use your intended SLAI v2.4 Python virtual environment.
.\venv\Scripts\Activate.ps1
python -m pip install -r applications\stringlab\requirements.txt

# Diagnose installation and start local desktop/browser application:
python -m applications.stringlab --check
python -m applications.stringlab --port 8776
```

The `--check` command requires both canonical native adapters and ReportLab and returns a nonzero exit code when these are missing. If the desired port is occupied, select a different unused port. The server listens on loopback and provides an authenticated browser startup link; an internet connection is not required for core use. The `dist/` client assets are included, so Node.js is **not required to start** the packaged app. To modify TypeScript (the client is built by the shared SLAI builder in `applications/tools/build`, so it must live inside the SLAI checkout):

```powershell
cd G:\GAIA\AI\SLAI\applications\stringlab
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
cd G:\GAIA\AI\SLAI
```

The browser entry point is `dist/js/stringlab/src/client/main.js`; the shared UI kit and the shared 3D camera maths (the same module SPADRA uses) are compiled alongside it.

## Features you can use

- **Free classical strings**: open strings with NN/DD/ND/DN transverse boundary conditions; closed periodic strings with independent left/right Fourier modes. Controls for amplitudes, phases, harmonic number, target dimension, sample count, light-cone gauge rate and α′. Explicit check of closed-string global longitudinal closure/level matching.
- **Additional independently integrated classical solvers (v0.6)**: conformal-gauge Polyakov target-coordinate evolution in Minkowski or exponential FRW (target Christoffels and monitored Virasoro constraints), nonlinear static-gauge Nambu–Goto Hamiltonian PDE in flat/FRW, and prescribed-electric-background scalar D1 DBI reduction. Open/closed special initial data and 32–512 spatial nodes. Open the **Dynamics** tab. These remain gauge-fixed numerical subproblems, not a generic all-background string theory solver.
- **Mathematical/numerical time evolution**: analytical Fourier series; leapfrog finite-difference evolution of the **transverse wave equation**, with CFL enforcement, finite time/step budgets, numerical error against exact modes, and comparison at 64/128/256 samples. Numerical longitudinal constraints are labeled approximate, not certified.
- **3D viewport**: WebGL2 renderer (instanced anti-aliased line ribbons, point discs, lit translucent worldsheet; a 2D-canvas renderer takes over automatically if WebGL2 is unavailable or the context is lost, or with `?renderer=2d`). Orbit with inertia, pan (right/middle/Shift-drag), cursor-anchored zoom, pinch, perspective/orthographic, front/side/top/isometric views with animated flights, fit-to-run, slow auto-orbit, orientation gizmo you can click, grid with tick labels, hover tooltips and click-to-pin probes that follow one vertex through time (with a fading trail), keyboard control (arrows, +/−, F, 1–4, 0, Esc). The worldsheet is drawn only up to the current time, so playing it *grows* the sheet. String colour can show speed, energy density or depth. PNG snapshot and WebM recording of exactly what is drawn. The `σ` axis is explicitly a *worldsheet parameter*, not a spatial target-space coordinate. Other dimensions are not visible.
- **Animation**: one playback clock (play/pause, step, scrub, start/end, Loop/Once/Ping-pong, 0.25×–4× speed, hidden-tab pause, reduced-motion respected) drives the viewport, charts and readouts together. Playback only interpolates for display; it never replaces integration. Analytical runs are sampled densely; finite-difference runs go through one `FDStepper` shared by every route.
- **Interactive parameters**: every parameter of an experiment is editable in the inspector and recomputes the run in place (debounced, cached by configuration, and a superseded response is discarded rather than shown); saved experiments with revision conflict checks. Playback keeps running through a recompute.
- **Compare**: pin the current run as a baseline, change anything, and the difference is measured (parameter diff, series differences) and the baseline is drawn grey behind the live string.
- **SLAI agents** (panel *SLAI agents*; everything is verified against StringLab's own solver and shown with the check): the **STEM Agent** gives unit-aware scales, an independent Simpson quadrature of the energy, the wave-equation residual and a first-order uncertainty propagation; the **Simulation Agent** can produce finite-difference runs as recorded rollouts (seed, run id, termination reason) proven identical to the direct solver; the **Animation Agent** turns material points on the string into native SGEO keyframe tracks, evaluates them (drawn as rings in the viewport) and the same scene exports as an animated `.sgeo`; **SharedMemory** receives revision-tagged diagnostics. The panel also lists which agents StringLab deliberately does not use and why. With no agent available StringLab computes everything itself.
- **Quantum arithmetic**: finite occupation-number levels and mass² in the critical bosonic open/closed light-cone Fock model (26D), level matching, tachyon indication, circle momentum and winding, T-dual radius and invariant mass checks. This is not a quantum field evolution or full BRST validation.
- **12 experiment configurations**: all select operative parameter sets and mathematical calculations. An additional affine Dp-brane model computes induced geometry and exact homogeneous flat F=0 motion; D1 nonlinear scalar DBI is available with limited fixed-electric-background assumptions. General brane field/gauge/gravity evolution is not included. Compactification/T-duality presets use real finite quantum formulas, not animation.
- **Advanced finite theory calculators**: Open RNS NS/R mass spectra with GSO restrictions, central-charge and Virasoro-anomaly arithmetic (BRST necessary condition only), static flat Dp-brane DBI determinant with constant gauge field, Fermat-quintic and flat complex torus mathematics. Extended examples also include closed RNS level matching, Euclidean free-boson CFT correlators, exact truncated oscillator characters, BRST anomaly/intercept checks, torus geodesics and a non-Ricci-flat projective quintic tangent metric. They are not complete interacting theories.
- **Data & reports**: scientific JSON snapshot, CSV time series, PDF report with typographically rendered Δs² / worldsheet equations (ReportLab), editable SLDC 1.x report with native LaTeX equation blocks (requires SLAI), save/open/delete JSON experiments with revision checks, including validated nonlinear solver configurations and deterministic recomputation when reopened. Nonlinear trajectories export as JSON or diagnostic CSV; Fourier-only PDF/SLDC/SGEO exports are explicitly disabled while nonlinear results are active. Quantum state is included in saved experiments. 3D SGEO curve-segment export / projected worldsheet triangles, editable 2D SDRW diagrams, and read-only native geometry inspection use the actual SLAI facades when installed; unsupported archives are not faked.

## Scientific scope and limitations

Read `docs/SCIENCE.md`, `docs/CAPABILITY_MATRIX.md`, and `docs/INTEGRATION.md` **before** interpreting the results. Selected model uses the worldsheet coordinates τ and σ; `ds² = −2dX⁺dX⁻ + Σᵢ(dYⁱ)²`, `X⁺=p⁺τ`, and `T = 1/(2πα′)` with `ħ = c = 1`. Classical target dimension D may vary from 4 to 26, with D−2 transverse components. The critical quantum bosonic Fock-spectrum equations are physically classified only for D=26; 10-dimensional superstring models are **not** simulated.

The following are **still not fully implemented**: arbitrary-metric and arbitrary-gauge covariant Polyakov/Nambu–Goto variational solvers (implemented: Minkowski/exponential FRW Polyakov conformal gauge and genuinely nonlinear Nambu–Goto static gauge); arbitrary curved target manifolds; full 26D field renderer; arbitrary SGEO-to-valid-physics initial-data conversion; general time-dependent Dp-brane geometry and backreacting dynamics; full CFT/BRST/superstring systems; solved Calabi–Yau metric and compactification; AdS/CFT; full parity with SPADRA’s BIM-specific renderer (SGEO native round-trip WebGL2 scene display is now available); full numerical constraint-preserving integration. Imported SGEO/SDRW is inspected as a native reference only.

## Testing

From the SLAI checkout root with StringLab installed:

```powershell
python -m pytest applications\stringlab\tests -q          # Python solvers, SLAI integration, and the real-browser client tests
cd applications\stringlab
npm.cmd run typecheck
npm.cmd test                                              # TypeScript tests of the pure client logic
cd G:\GAIA\AI\SLAI
python -m applications.stringlab --check
```

`tests/test_browser_client.py` boots the built `dist/` against a live server in Chromium and fails on **any** console error, page error or failed request. It is skipped (not failed) when Playwright, Chromium or `dist/` are missing; set `CHROMIUM_PATH` to use a specific browser. For native integration, run with `src.utils.sgeo`, `src.utils.sdrw`, `src.utils.sldc` and `applications.tools` installed (the native tests must not skip on a release workstation) and open an exported SGEO/SDRW in SPADRA/CADCon by hand.

## Files

`physics.py` provides the analytical/FD light-cone model, `covariant.py` provides the independently evolved Polyakov PDE, and `nambu_goto.py` provides nonlinear Nambu–Goto/DBI scalar Hamiltonian evolution; `quantum.py` is discrete critical-bosonic arithmetic; `interop.py` uses public SLAI spatial-format facades; `routes.py` supplies API routes to the shared SLAI HTTP server; `store.py` handles revision-safe local experiment storage; `reports.py` handles scientific exports. `src/client/` is the TypeScript client: `store.ts` (state, compute pipeline, playback clock, agents), `viewport.ts` + `renderer.ts` + `scene.ts` (3D viewport, GL and 2D renderers, pure scene builder), `geometry.ts`/`playback.ts`/`logic.ts` (pure, unit-tested), `shell.ts` and `panels/` (workspace and tabs), `kit.ts` (the single import point of the shared SLAI UI kit). `dist/` contains prebuilt assets. Python tests live under `tests/`, TypeScript tests under `tests_ts/`. Runtime data goes to `%LOCALAPPDATA%\SLAI\StringLab` by default; it is not included in this ZIP.

Further details: `docs/NUMERICAL_MODELS.md` (equations, gauges, numerical schemes, fidelity limits), `docs/ADVANCED_MODELS.md` (precise scope, assumptions, supported formulas, and testing boundaries).

## References

1. D. Tong (2009), *String Theory*, Cambridge Part III, §§1.2–1.4, 2, 3, 8: classical actions, constraints, modes, oscillator spectra and T-duality.
2. K. Wray (2011), *An Introduction to String Theory*, revised 6 May 2011, chapters 2–5 and 12: bosonic string dynamics, light-cone quantization, T-duality and D-branes.

The **uploaded** PDF notes were inspected and used for the calculations and equation conventions. They are **not embedded in the ZIP**, both to avoid shipping large duplicated literature and to respect original authorship.
