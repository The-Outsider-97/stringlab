# Capability, evidence and limitations matrix — StringLab 0.6

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

## v0.5 extensions (2026-11-09)

| Capability | Actual implementation | Fidelity and remaining blockers |
| --- | --- | --- |
| Playback 8× / 16× / 32× | Added to UI | Playback multiplier only; no change to physical integration step or scientific timestep. |
| Mathematical PDF typography | Unicode/TrueType equation paragraphs; Δs² and worldsheet derivatives extracted in PDF test | Requires a suitable system TTF font; never embeds a packaged font. |
| SLDC report | Canonical `src.utils.sldc` 1.x document package with editable LaTeX equation blocks | Native round-trip conditional test requires the actual SLAI checkout; not executed here. |
| SLAI SharedMemory | Revision-tagged bounded solver diagnostics; optional publish/get contracts | Tested with contract stubs; live SLAI SharedMemory runtime not exercised here. |
| SLAI specialist agents | Explicit STEM/Verification AgentFactory requests with read-only physics context | Tested with mocks; live SLAI agent instantiation and cross-agent reconciliation not exercised here. |
| Dp-brane analysis | Planar static Dp with homogeneous field DBI determinant and real-action checks | Reduced analytic effective action; no dynamic brane PDE, geometry editing, strings attachment dynamics, or backreaction. |
| RNS superstring | Finite open NS/R oscillator mass spectrum, partial NS GSO | No Ramond spinor/GSO chirality construction, super-Virasoro constraints or interactions. |
| CFT / BRST | Central charges, Virasoro central coefficient, necessary BRST anomaly prerequisite | Not BRST cohomology, full CFT correlators, full QBRST nilpotency computation. |
| Calabi–Yau | Algebraic Fermat quintic smoothness, point-inspection; flat complex 3-torus coordinate model | No Ricci-flat quintic metric, full compactification, spectrum or Hodge calculation. |
| General covariant NG/Polyakov numerical solvers | **Not implemented** | Existing flat light-cone solution and on-shell action evaluation retained. |
| Canonical SGEO interactive renderer | **Not integrated** | Native exports use canonical SGEO; viewport still software canvas. A reusable shared renderer contract is not present in SLAI tools. |

## v0.6 — standalone scientific implementation and verification (2026-11-09)

**The v0.4/v0.5 status above is historical. For current v0.6 implementation and test counts, use this table and `docs/TEST_RESULTS.md`; earlier “not implemented” entries are superseded where explicitly addressed below.**

| Component | Implemented | Limits / validation debt |
| --- | --- | --- |
| Polyakov PDE with target connection | Actual evolution of X⁰ and Xⁱ for flat/FRW target, Neumann open / periodic closed, measured Virasoro constraints | Worldsheet conformal gauge; restricted analytic metric family; no exact discrete constraint preservation, no arbitrary g_μν input |
| Nambu–Goto nonlinear PDE | Nonlinear canonical-momentum Hamiltonian evolution in static gauge; open Dirichlet/closed compact winding | Not arbitrary gauge, no self-intersections, no arbitrary curved metric beyond FRW |
| D1 scalar DBI | Nonlinear DBI determinant and scalar conservation law with constant prescribed background electric F | Gauge-field equation not integrated; F≠0 FRW explicitly forbidden |
| Dp-brane geometry | Affine induced metric, constant F, determinant/sign checks, homogeneous exact F=0 normal-velocity trajectory | No general spatially varying p-brane PDE, RR coupling or backreaction |
| Closed RNS free spectra | NS–NS/NS–R/R–NS/R–R oscillator mass-shell and matching, NS parity projection | R zero-mode spinors/chirality and full GSO/BRST not available |
| Free CFT computations | Euclidean plane vertex correlator and exact finite oscillator character | No modular integral, all-genus correlators or interacting field theories |
| BRST consistency | Central anomalies and intercept necessary conditions | No Q operator, nilpotency proof or cohomology |
| CY3 examples | Exact flat torus geodesic/eigenvalue; induced projective Fubini–Study quintic tangent metric | Quintic metric **not Ricci-flat**; no general CY metric numerical PDE |
| Native SGEO viewer | Backend writer→reader→strict validation→public geometry extraction; WebGL2 segment/triangle consumer; imported SGEO geometry | SPADRA's project-bound ModelView is not a reusable library; live frames are not archived per repaint; no full material/selection parity |
| Animation | Sample-time interpolation in display only, loop/once/ping-pong, hidden tab pause, 0.5×–32×, GPU trail rendering | No quantum time dynamics; no numeric integration between display frames |

**Verification evidence:** Run the local tests, TS typechecker and actual Windows SLAI integration suite on your own checkout. The full SLAI native module was unavailable in the packaging sandbox; skipped native test modules remain release blockers rather than passed claims. See `docs/NUMERICAL_MODELS.md` for equations and physical restrictions.
