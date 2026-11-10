# StringLab v0.6 — numerical solvers, field models, renderer, and verification

This note defines the **implemented numerical problems**, not a claim to have solved the whole of string theory. Units are c=ħ=1; model times and lengths have no laboratory calibration. Finite precision, stability and gauge constraints matter.

## Covariant Polyakov string (conformal worldsheet gauge)

Target metric: `g_{μν}(X)`. The implemented options are Minkowski `diag(-1,1,…,1)` and spatially-flat exponential FRW `diag(-1,e^{2Ht},…,e^{2Ht})`, with constant bounded `H`. The coordinates `X^0,…,X^(D−1)` are independently advanced; no light-cone reconstruction is used.

The PDE follows from variation of the conformal-gauge Polyakov action:

`Ẍ^μ − X″^μ + Γ^μ_{αβ}(X)(Ẋ^α Ẋ^β − X′^α X′^β) = 0`.

The implementation evaluates the nonzero FRW Christoffel symbols `Γ⁰ᵢⱼ = H e^{2Ht} δᵢⱼ`, `Γⁱ₀ⱼ = Γⁱⱼ₀ = H δⁱⱼ`. The discrete update is kick–drift–kick, with centered interior second differences, periodic closed boundaries or reflected Neumann open boundaries, CFL `Δτ/Δσ ≤ 0.2`, bounded allocation and finite-value checks. **It is not a constraint-preserving integrator.** Both Virasoro constraints are independently measured:

`C₁ = g(Ẋ,Ẋ) + g(X′,X′)`, `C₂ = g(Ẋ,X′)`.

Outputs give normalized RMS and max residuals, the induced timelike fraction, coordinate-time monotonicity, and σ-integrated action densities. Exact flat test initial configurations are the closed pulsating circle and the open rotating rod. Flat-space tests confirm constraint trends and grid refinement. FRW creates different trajectories, as required by the connection term; this does not establish an exact curved-space physical state.

**Not supported:** arbitrary user-supplied metrics or Christoffels, fully dynamical worldsheet metric, target background gauge fields, Neumann/Dirichlet mixes on every embedding coordinate, open-string endpoint forces, gauge repair, topological changes, self-intersection resolution, or large curvature where these initial conditions/gauge break down.

## Nonlinear Nambu–Goto string (static gauge; flat / FRW)

Gauge `X=(t,σ,Yᴵ(t,σ))`. `σ∈[0,π]` with fixed transverse open endpoints, or compact `X¹=σ` with winding one and periodic transverse `Y` for closed configurations. This **is not** an arbitrary worldsheet parametrization. For Minkowski target and `T = 1/(2πα′)`:

`A = (1+|Y′|²)(1−|Ẏ|²) + (Ẏ·Y′)²`.

`L = −T √A`. Canonical momenta and spatial flux are:

`Π = T [(1+|Y′|²)Ẏ − (Ẏ·Y′)Y′] / √A`

`J = T [(1−|Ẏ|²)Y′ + (Ẏ·Y′)Ẏ] / √A`.

The nonlinear Euler–Lagrange equation is `∂tΠ = ∂σJ`, integrated by staggered Hamiltonian kick–drift–kick. The velocity is recovered **analytically** by inverting the momentum map; the code does **not** approximate this by a linear wave equation. It rejects non-timelike determinants and numerical divergence. Energy `∫ T(1+|Y′|²)/√A dσ` is monitored (expected conserved for flat `H=0`, `F=0`). Discretization error produces finite energy drift; this is not formal certification.

For FRW, spatial target metric `a(t)²δᵢⱼ`, `a=e^{Ht}`, and `A_FRW = a²[(1+|Y′|²)(1−a²|Ẏ|²)+a²(Ẏ·Y′)²]`. The canonical equations are recomputed with time-dependent `a(t)`. **Energy need not be conserved in an expanding background**; use `energy_conservation_expected` in the result.

For flat D1 with externally prescribed constant electric background `e=2πα′F₀₁`, replace `A → A−e²`. This is a reduced scalar DBI evolution, **not a self-consistent worldvolume gauge-field simulation** (Maxwell/DBI gauge equations are not integrated). If `e≠0`, FRW evolution is rejected rather than presenting an inconsistent combination.

## Dp-brane embedding and trajectory

`affine_dbi` takes affine worldvolume tangent vectors `T_a`, an arbitrary bounded worldvolume velocity `v`, and antisymmetric constant `F`. It computes the actual induced matrix `γₐᵦ = ∂ₐX^μ η_{μν} ∂ᵦX^ν` and density `−T_p√−det(γ+2πα′F)`. It verifies tangent rank, induced Lorentzian signature and the real-action domain. `brane_trajectory` integrates the **exact** homogeneous flat `F=0` solution `Xᶦ(t,σ)=originᶦ+vᶦt+T_aᶦσᵃ` with normal |v|<1. This is genuine Dp embedding and a special motion solution, but does **not** approximate an arbitrary vibrating p-dimensional worldvolume, gravitational coupling, brane intersections, or backreaction.

## Superstring, CFT, BRST, Calabi–Yau

These are **finite mathematical calculations**, separate from classical time evolution:

- `closed_rns_spectrum`: free closed NS–NS, NS–R, R–NS and R–R oscillator levels with `α′M²/4=N_L−a_L=N_R−a_R` and NS odd-fermion GSO. R zero-mode spinors and chirality are not constructed. The `rns_spectrum` open sector remains.
- `free_boson_cft`: normal-ordered plane vertex correlator with charge-neutrality check and `|z_i−z_j|^(α′k_i·k_j)` factors. No scattering amplitude integration or worldsheet moduli integral.
- `oscillator_character`: exact integer coefficients through q^60 of `∏ₙ(1−qⁿ)^−D`, useful as a truncated free boson Fock generating function, not a modular-invariant partition function.
- `brst_consistency`: matter/ghost central-charge cancellation, tested Virasoro central obstruction and normal-order intercept prerequisites. It **does not construct Q_BRST, prove Q²=0, or compute cohomology**.
- `flat_torus_geodesic`: exact shortest lattice lift and scalar Laplacian Fourier eigenvalue on a flat six-torus with a compatible complex structure. Trivial holonomy lies inside SU(3).
- `quintic_tangent_metric`: uses `∇F` for the Fermat quintic and computes the Hermitian metric on its tangent subspace induced by projective Fubini–Study. **This metric is not Ricci-flat** and is not a solution of the Calabi–Yau metric PDE.

A complete interacting superstring/CFT/BRST or general Calabi–Yau solution is not claimed or implied by exposing these bounded calculators.

## Native SGEO 3D viewer

`interop.canonical_sgeo_scene` serializes the current classical Fourier projection to **actual SLAI SGEO bytes**, loads those bytes using `SGEODocument.from_bytes`, strictly validates them, and extracts public `query_ids/get/to_mesh` segments and world-space tessellated surfaces. It then supplies a versioned scene descriptor to a WebGL2 renderer. The user can orbit/pan/zoom/fit, preview swept worldsheets, and inspect imported `.sgeo` mesh/segment geometry with native validation. The native view is a **snapshot at one τ**; on live animation, the GPU renders successive computed geometry frames through the same vertex pipeline instead of running an expensive archive round-trip per 60-Hz display frame. This difference must remain visible in UI status and documentation.

SPADRA's `ModelView` lives in `applications/SPADRA/src/client/view3d.ts` and imports the SPADRA project Store, BIM tools and dialogs. There is **no independent reusable SGEO viewport library** currently exposed by the SLAI v2.4 `src.utils.sgeo` Python facade. StringLab therefore implements a standalone WebGL2 consumer of the **canonical native SGEO data and tessellation APIs**, rather than incorrectly importing the BIM-specific SPADRA viewer class and pretending its API is generic. Complex materials, instance hierarchy interactions, selection/editing and identical SPADRA shading are not implemented. This is real native SGEO data integration, not full SPADRA viewport parity.

## Numerical and interface validation

The independently computed Python solver tests verify: exact static solutions, constraint-grid refinement, expected curvature dependence, conservation drift in a flat stationary background, Dirichlet endpoints, timelike induced metrics, canonical momentum/velocity inversion, correct rank/velocity rejection, algebraic CFT coefficients and neutral correlators, BRST anomaly prerequisites, flat-torus periodic geodesics, and three complex tangent eigenvalues on the quintic. Do not treat a skipped conditional test of the SLAI native facade as a successful native integration test.

`tsc -p tsconfig.build.json --noEmit` checks the browser TypeScript. Playback interpolation is for **display only**: it neither advances differential equations nor modifies solver outputs. 0.5×, 1×, 2×, 4×, 8×, 16×, 32× playback, Loop/Once/Ping-pong, display-time interpolation, pausing on hidden tabs, and reduced per-frame sidebar updates are distinct from physics timestep selection.

Before a scientific release, add independent higher-order convergence studies, discrete constraint preservation, broader curved metrics and boundary-condition coverage, parameter regime scans for singularities and stiffness, reproducible environment pinning, and an independent calculation review. Before an app release, execute the conditional SGEO/SDRW/SLDC/agents/server tests against the real Windows SLAI checkout and do a WebGL2 hardware/GPU matrix smoke test.
