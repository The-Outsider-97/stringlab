# SLAI StringLab — scientific computing application (v0.4 preview)

**A real, locally computed educational/research-support application—not a complete string-theory simulator.** It uses analytical free-bosonic light-cone string equations, a numerical transverse wave solver, a finite critical-bosonic Fock-spectrum calculator, and 3D projections. A model is classified *physical in the restricted classical setup* only when the checked constraints permit that description. Its results are **not experimental confirmation of string theory**.

> **Status notice**: the application source and standalone mathematical tests have been built and tested. Integration with the actual Windows SLAI checkout, running application HTTP server, and genuine native SGEO/SDRW archive round trips **has not been executed in the current sandbox**. The native export code does use the documented and inspected SLAI v2.4 public facades. Do not describe this preview as a fully verified SLAI application until the integration checks below have passed on the target checkout.

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

The `--check` command requires both canonical native adapters and ReportLab and returns a nonzero exit code when these are missing. If the desired port is occupied, select a different unused port. The server listens on loopback and provides an authenticated browser startup link; an internet connection is not required for core use. The `dist/` client assets are included, so Node.js is **not required to start** the packaged app. To modify TypeScript, run:

```powershell
cd G:\GAIA\AI\SLAI\applications\stringlab
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
cd G:\GAIA\AI\SLAI
```

**Important build note**: the included TypeScript client uses a simple standalone compiler/asset copy. On the target checkout, `npm run build` delegates to the shared SLAI build helper in `applications/tools/build/build-static.mjs`. That helper was inspected and expects a `tsconfig.build.json` and `src/client/index.html`. The compiled `dist/app.js` remains the browser entry point.

## Features you can use

- **Free classical strings**: open strings with NN/DD/ND/DN transverse boundary conditions; closed periodic strings with independent left/right Fourier modes. Controls for amplitudes, phases, harmonic number, target dimension, sample count, light-cone gauge rate and α′. Explicit check of closed-string global longitudinal closure/level matching.
- **Mathematical/numerical time evolution**: analytical Fourier series; leapfrog finite-difference evolution of the **transverse wave equation**, with CFL enforcement, finite time/step budgets, numerical error against exact modes, and comparison at 64/128/256 samples. Numerical longitudinal constraints are labeled approximate, not certified.
- **Scientific 3-axis projection**: 3D software-canvas viewport, orbit, pan, zoom, ortho/perspective, fit, axes selection, time slider, speed adjustment, projected time-sweep worldsheet wireframe. The `σ` axis is explicitly a *worldsheet parameter*, not a spatial target-space coordinate. Other dimensions are not visible. The canvas is not the SLAI SGEO renderer.
- **Quantum arithmetic**: finite occupation-number levels and mass² in the critical bosonic open/closed light-cone Fock model (26D), level matching, tachyon indication, circle momentum and winding, T-dual radius and invariant mass checks. This is not a quantum field evolution or full BRST validation.
- **12 experiment configurations**: all select operative parameter sets and mathematical calculations. The D-brane experiment is honestly **reduced to fixed Dirichlet supports**; it does not compute Dp-brane dynamics. Compactification/T-duality presets use real finite quantum formulas, not animation.
- **Data & reports**: scientific JSON snapshot, CSV time series, PDF report (ReportLab), save/open/delete JSON experiments with revision checks. Quantum state is included in saved experiments. 3D SGEO curve-segment export / projected worldsheet triangles, editable 2D SDRW diagrams, and read-only native geometry inspection use the actual SLAI facades when installed; unsupported archives are not faked.

## Scientific scope and limitations

Read `docs/SCIENCE.md`, `docs/CAPABILITY_MATRIX.md`, and `docs/INTEGRATION.md` **before** interpreting the results. Selected model uses the worldsheet coordinates τ and σ; `ds² = −2dX⁺dX⁻ + Σᵢ(dYⁱ)²`, `X⁺=p⁺τ`, and `T = 1/(2πα′)` with `ħ = c = 1`. Classical target dimension D may vary from 4 to 26, with D−2 transverse components. The critical quantum bosonic Fock-spectrum equations are physically classified only for D=26; 10-dimensional superstring models are **not** simulated.

The following are **not** implemented: general covariant Polyakov or Nambu–Goto variational solvers; curved target manifolds; full 26D field renderer; arbitrary SGEO-to-valid-physics initial-data conversion; 3D Dp-brane surface modeling or dynamic branes; CFT/BRST/superstrings; Calabi–Yau compactification; AdS/CFT; full SLDC report export; native SLAI agent execution; GPU SGEO viewer integration; full numerical constraint-preserving integration. Imported SGEO/SDRW is inspected as a native reference only.

## Testing

From the SLAI checkout root with StringLab installed:

```powershell
python -m pytest applications\stringlab\tests -q
cd applications\stringlab
npm.cmd run typecheck
cd G:\GAIA\AI\SLAI
python -m applications.stringlab --check
```

For **native integration verification**, run the conditional integration tests with `src.utils.sgeo`, `src.utils.sdrw`, and `applications.tools` installed in the active environment. Launch the app and manually inspect/save/open an SGEO and SDRW export in SPADRA/CADCon. Capture the build result and whether `dist/app.js` and the frontend requests work. For test evidence actually obtained in the packaging environment, see `docs/CAPABILITY_MATRIX.md`.

## Files

`physics.py` is the deterministic classical model and finite-difference numerical solver; `quantum.py` is discrete critical-bosonic arithmetic; `interop.py` uses public SLAI spatial-format facades; `routes.py` supplies API routes to the shared SLAI HTTP server; `store.py` handles revision-safe local experiment storage; `reports.py` handles scientific exports. `src/client/` contains TypeScript/browser source; `dist/` contains prebuilt assets. Python tests live under `tests/`. Runtime data goes to `%LOCALAPPDATA%\SLAI\StringLab` by default; it is not included in this ZIP.

## References

1. D. Tong (2009), *String Theory*, Cambridge Part III, §§1.2–1.4, 2, 3, 8: classical actions, constraints, modes, oscillator spectra and T-duality.
2. K. Wray (2011), *An Introduction to String Theory*, revised 6 May 2011, chapters 2–5 and 12: bosonic string dynamics, light-cone quantization, T-duality and D-branes.

The **uploaded** PDF notes were inspected and used for the calculations and equation conventions. They are **not embedded in the ZIP**, both to avoid shipping large duplicated literature and to respect original authorship.
