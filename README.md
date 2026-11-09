# SLAI StringLab — scientific computing application (v0.6 numerical dynamics and SGEO/WebGL preview)

**A real, locally computed research-support application with multiple bounded classical and quantum model solvers—not a complete string-theory simulator.** It uses analytical free-bosonic light-cone string equations, a numerical transverse wave solver, a finite critical-bosonic Fock-spectrum calculator, and 3D projections. A model is classified *physical in the restricted classical setup* only when the checked constraints permit that description. Its results are **not experimental confirmation of string theory**.

> **Status notice**: the application source, additional nonlinear PDE solvers and standalone mathematical tests have been built and tested. Integration with the actual Windows SLAI checkout, running application HTTP server, and genuine native SGEO/SDRW archive round trips **has not been executed in the current sandbox**. The native export code does use the documented and inspected SLAI v2.4 public facades. Do not describe this preview as a fully verified SLAI application until the integration checks below have passed on the target checkout.

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
- **Additional independently integrated classical solvers (v0.6)**: conformal-gauge Polyakov target-coordinate evolution in Minkowski or exponential FRW (target Christoffels and monitored Virasoro constraints), nonlinear static-gauge Nambu–Goto Hamiltonian PDE in flat/FRW, and prescribed-electric-background scalar D1 DBI reduction. Open/closed special initial data and 32–512 spatial nodes. Select **COVARIANT DYNAMICS** in the workspace. These remain gauge-fixed numerical subproblems, not a generic all-background string theory solver.
- **Mathematical/numerical time evolution**: analytical Fourier series; leapfrog finite-difference evolution of the **transverse wave equation**, with CFL enforcement, finite time/step budgets, numerical error against exact modes, and comparison at 64/128/256 samples. Numerical longitudinal constraints are labeled approximate, not certified.
- **Scientific 3-axis projection**: WebGL2 native-scene-capable interactive viewport (2D canvas fallback), orbit, pan, zoom, ortho/perspective, fit, axes selection, interpolated time slider, Loop/Once/Ping-pong, playback speeds 0.5×, 1×, 2×, 4×, 8×, 16×, and 32×, projected time-sweep worldsheet wireframe. The `σ` axis is explicitly a *worldsheet parameter*, not a spatial target-space coordinate. Other dimensions are not visible. A verified native SGEO snapshot uses writer/reader/validation and a WebGL2 scene consumer; live GPU animation uses geometry projected by the physics engine, not per-frame native serialization. It is not the BIM-specific SPADRA ModelView.
- **Quantum arithmetic**: finite occupation-number levels and mass² in the critical bosonic open/closed light-cone Fock model (26D), level matching, tachyon indication, circle momentum and winding, T-dual radius and invariant mass checks. This is not a quantum field evolution or full BRST validation.
- **12 experiment configurations**: all select operative parameter sets and mathematical calculations. An additional affine Dp-brane model computes induced geometry and exact homogeneous flat F=0 motion; D1 nonlinear scalar DBI is available with limited fixed-electric-background assumptions. General brane field/gauge/gravity evolution is not included. Compactification/T-duality presets use real finite quantum formulas, not animation.
- **Advanced finite theory calculators**: Open RNS NS/R mass spectra with GSO restrictions, central-charge and Virasoro-anomaly arithmetic (BRST necessary condition only), static flat Dp-brane DBI determinant with constant gauge field, Fermat-quintic and flat complex torus mathematics. Extended examples also include closed RNS level matching, Euclidean free-boson CFT correlators, exact truncated oscillator characters, BRST anomaly/intercept checks, torus geodesics and a non-Ricci-flat projective quintic tangent metric. They are not complete interacting theories.
- **Agent and Shared Memory adapter**: revision-tagged bounded diagnostic publishing through SLAI SharedMemory and explicit STEM/Verification requests through AgentFactory, when available. Neither controls or replaces the deterministic solver.
- **Data & reports**: scientific JSON snapshot, CSV time series, PDF report with typographically rendered Δs² / worldsheet equations (ReportLab), editable SLDC 1.x report with native LaTeX equation blocks (requires SLAI), save/open/delete JSON experiments with revision checks, including validated nonlinear solver configurations and deterministic recomputation when reopened. Nonlinear trajectories export as JSON or diagnostic CSV; Fourier-only PDF/SLDC/SGEO exports are explicitly disabled while nonlinear results are active. Quantum state is included in saved experiments. 3D SGEO curve-segment export / projected worldsheet triangles, editable 2D SDRW diagrams, and read-only native geometry inspection use the actual SLAI facades when installed; unsupported archives are not faked.

## Scientific scope and limitations

Read `docs/SCIENCE.md`, `docs/CAPABILITY_MATRIX.md`, and `docs/INTEGRATION.md` **before** interpreting the results. Selected model uses the worldsheet coordinates τ and σ; `ds² = −2dX⁺dX⁻ + Σᵢ(dYⁱ)²`, `X⁺=p⁺τ`, and `T = 1/(2πα′)` with `ħ = c = 1`. Classical target dimension D may vary from 4 to 26, with D−2 transverse components. The critical quantum bosonic Fock-spectrum equations are physically classified only for D=26; 10-dimensional superstring models are **not** simulated.

The following are **still not fully implemented**: arbitrary-metric and arbitrary-gauge covariant Polyakov/Nambu–Goto variational solvers (implemented: Minkowski/exponential FRW Polyakov conformal gauge and genuinely nonlinear Nambu–Goto static gauge); arbitrary curved target manifolds; full 26D field renderer; arbitrary SGEO-to-valid-physics initial-data conversion; general time-dependent Dp-brane geometry and backreacting dynamics; full CFT/BRST/superstring systems; solved Calabi–Yau metric and compactification; AdS/CFT; full parity with SPADRA’s BIM-specific renderer (SGEO native round-trip WebGL2 scene display is now available); full numerical constraint-preserving integration. Imported SGEO/SDRW is inspected as a native reference only.

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

`physics.py` provides the analytical/FD light-cone model, `covariant.py` provides the independently evolved Polyakov PDE, and `nambu_goto.py` provides nonlinear Nambu–Goto/DBI scalar Hamiltonian evolution; `quantum.py` is discrete critical-bosonic arithmetic; `interop.py` uses public SLAI spatial-format facades; `routes.py` supplies API routes to the shared SLAI HTTP server; `store.py` handles revision-safe local experiment storage; `reports.py` handles scientific exports. `src/client/` contains TypeScript/browser source; `dist/` contains prebuilt assets. Python tests live under `tests/`. Runtime data goes to `%LOCALAPPDATA%\SLAI\StringLab` by default; it is not included in this ZIP.

Further details: `docs/NUMERICAL_MODELS.md` (equations, gauges, numerical schemes, fidelity limits), `docs/ADVANCED_MODELS.md` (precise scope, assumptions, supported formulas, and testing boundaries).

## References

1. D. Tong (2009), *String Theory*, Cambridge Part III, §§1.2–1.4, 2, 3, 8: classical actions, constraints, modes, oscillator spectra and T-duality.
2. K. Wray (2011), *An Introduction to String Theory*, revised 6 May 2011, chapters 2–5 and 12: bosonic string dynamics, light-cone quantization, T-duality and D-branes.

The **uploaded** PDF notes were inspected and used for the calculations and equation conventions. They are **not embedded in the ZIP**, both to avoid shipping large duplicated literature and to respect original authorship.
