# Capability, evidence and limitations matrix — StringLab 0.4

Date assessed: 2026-11-09. **Status is based on implementation inspection and tests actually executed inside this creation environment**, not on a successfully launched Windows SLAI v2.4 checkout. “Tested” below means stand-alone scientific Python tests and browser DOM-only smoke checks were executed; that is distinct from native SLAI integration verification.

| Feature | Built status | Scientific classification | Evidence | Remaining limitation |
| --- | --- | --- | --- | --- |
| Classical open NN/DD/ND/DN | Implemented, tested | Free bosonic light-cone reduced model | Analytic mode and endpoint unit tests | General covariant actions not solved |
| Classical closed and traveling waves | Implemented, tested | Free bosonic light-cone reduced model | Periodic and closure tests | Longitudinal sampled quadrature not certified |
| Fourier mode superposition | Implemented, tested | Analytical transverse solution | Superposition math tests | Finite mode cutoff 32 |
| Finite-difference evolution | Implemented, tested | Numerical transverse wave PDE | Error/CFL/convergence tests | No constraint-preserving covariant integrator |
| Gauge/constraint diagnostics | Partial, tested | Analytic reconstruction + global integral | Closed nonmatching mode tests | Discrete local residuals not independently certified |
| Interactive 3D viewport | Implemented, built | 3-coordinate projection/σ diagram | TypeScript compile; browser smoke test, if reported separately | Canvas projection, **not** canonical SGEO renderer |
| Worldsheet visualization | Implemented, projected | Computed time-sweep visual projection | Source-derived geometry, static typecheck | Not full Lorentzian embedded worldsheet |
| D=4–26 classical coordinate selection | Implemented, tested | Projected higher-D field | Projection tests | No extra-dimension physics or superstring |
| Critical bosonic quantum oscillator arithmetic | Implemented, tested | Finite D=26 Fock-spectrum calculation | Mass/level tests | No full BRST/CFT/physical-state proof |
| Circular compactification | Implemented, tested | Finite 1D radius/momentum/winding formula | Compact mass formula tests | No full compact manifold geometry |
| T-duality R↔α′/R | Implemented, tested | Critical bosonic spectral identity | Invariant and level-match tests | Applicable only within modeled flat S¹ setup |
| D-brane example | **Reduced-only** | DD fixed endpoint boundary data | Boundary test | No modeled Dp brane surface or DBI dynamics |
| Parameter sweeps | Implemented, tested | First-amplitude one-variable sweep | Sweep tests | General constrained optimization missing |
| Two-experiment comparison | Partial UI | Numeric baseline/current comparison | TypeScript compile | No synchronized side-by-side dual viewport |
| Experiment persistence | Implemented, unit tested | JSON config/revision | Save/read/conflict tests with shared-storage test double | Target Windows filesystem not exercised |
| Scientific JSON, CSV | Implemented, tested | Result and metadata export | Format tests | Not a native StringLab ZIP experiment document |
| PDF report | Implemented, tested | Scientific report | Valid PDF parsed in Python | Native SLDC export unavailable; report graphics limited |
| SGEO native export/import | Facade-backed, **target integration unverified** | 3D coordinate projection and read-only native inspection | Public API source inspection; conditional tests | Requires actual SLAI v2.4 runtime to execute and verify |
| SDRW native export/import | Facade-backed, **target integration unverified** | Editable 2D projected geometry and native inspection | Public API source inspection; conditional tests | Requires actual SLAI v2.4 runtime |
| SLAI shared HTTP/appearance | Contract-based, unverified at runtime | Application integration | Shared source API signatures inspected | Full Windows app startup and browser test needed |
| SLAI multi-agent orchestration | **Not implemented** | Not applicable | Explicit status field `optional_agents: not connected` | Agent contracts require actual integration |
| Superstrings / CFT / BRST / DBI / curved target space | **Not implemented** | Educational source references only | Explicit in README/docs | Cannot be claimed as simulated |

## Local evidence

- `PYTHONPATH=/mnt/data python -m pytest /mnt/data/stringlab/tests -q`: **32 passed, 4 skipped** at latest completed scientific/local regression checkpoint including action density and quantum persistence tests. Re-execute and update the checkpoint before release.
- `tsc -p /mnt/data/stringlab/tsconfig.build.json`: **successful** with TypeScript 5.8.3; `dist/app.js` exists and is included.
- Browser DOM-only smoke: **passed** initialization, presets, simulation-data canvas, chart, quantum/T-dual, sweeps, dialogs and playback; fed with computed Python results by a mocked fetch object because actual local HTTP navigation was blocked by sandbox administrator. No real HTTP/auth/server test claim.
- PDF report: generated and parsed with `pypdf`, rendered to two pages and visually inspected.
- Python runtime in this environment: **3.13.5** (not a Windows target validation).
- Full SLAI v2.4 checkout, native format round trips, authenticated real shared server and Windows UI test: **not available/verified** inside the package-building environment.

Do not translate a test that was skipped because SLAI is not installed into a successful integration test.
