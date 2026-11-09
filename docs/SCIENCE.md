# Scientific definition, equation provenance, and validity boundaries

## Sources, conventions and scope

- D. Tong, *String Theory* (2009), particularly §§1.2 Nambu–Goto (Eq. 1.13), 1.3 Polyakov (Eq. 1.22), conformal-gauge wave and stress-energy constraints (Eqs. 1.31–1.33), 1.4 modes and level matching, and chapter 8 for circle T-duality.
- K. Wray, *An Introduction to String Theory* (2011), particularly chapters 2–3 for classical action, boundaries and mode expansions, chapter 5 for light-cone quantization, chapter 12 for T-duality/brane configurations.

Conventions: target metric signature `(-,+,+,...)`; worldsheet metric `(-,+)`; natural units `ħ=c=1`; time-like worldsheet coordinate `τ`, space-like coordinate `σ`; open domain `[0,π]`, closed `[0,2π)`. The chosen numerical model uses dimensionless `τ,σ` and model-unit spatial coordinates with `T = 1/(2π α′)`. StringLab deliberately does not introduce a physically measured α′. Dimensional conversions for SGEO are *display interoperability conventions* (1 model unit to 1 metre), **not calibrated claims** about the size of fundamental strings.

The classical *implementation* is a free bosonic string in a flat D-dimensional target background after light-cone gauge fixing. It is not an independent general Nambu–Goto solver, even though the Polyakov and Nambu–Goto descriptions are classically equivalent when the auxiliary worldsheet metric field equation is imposed in their domain of applicability.

## Implemented mathematical model

Write the target metric in light-cone coordinates,

`ds² = -2 dX⁺ dX⁻ + Σᵢ(dYⁱ)²`, with `i=1,...,D−2`.

Set `X⁺ = p⁺ τ` with `p⁺>0`. The transverse fields obey

`∂²_τ Yⁱ − ∂²_σ Yⁱ = 0`.

The two conformal/Virasoro constraints determine derivatives of the longitudinal field:

`∂σ X⁻ = (∂τY·∂σY) / p⁺`,

`∂τ X⁻ = (|∂τY|² + |∂σY|²) / (2p⁺)`.

For closed strings, global longitudinal periodicity additionally requires

`∫₀²π ∂τY·∂σY dσ = 0`.

The code computes a **normalized numerical integral of this global residual** for every displayed analytical frame. The `X⁻` *display coordinate* is reconstructed from sampled derivatives using quadrature; its values are not exact analytic Fourier integrals and must not be interpreted as separately validated covariant embeddings. An analytical solution which violates the closed global constraint is labeled `constraint_violating_free_field`, not physically consistent. The right-panel expression `T` is the string tension, while displayed energy is the **gauge-fixed transverse Hamiltonian**, not a full target-space energy claim.

### Open-string modes

- **NN**: `Y = A + vτ + Σ a_n cos(nσ) cos(nτ+φ_n)`.
- **DD**: `Y = A + (B−A)σ/π + Σ a_n sin(nσ) cos(nτ+φ_n)`.
- **ND**: `Y = A + Σ a_n cos[(n−1/2)σ] cos[(n−1/2)τ+φ_n)`.
- **DN**: `Y = A + Σ a_n sin[(n−1/2)σ] cos[(n−1/2)τ+φ_n)`.

Zero-mode constant velocities are supported only by NN. Mixed modes use a **single common anchor** because a constant homogeneous affine solution with one Neumann condition cannot describe an arbitrary nonzero static endpoint separation. Arbitrarily different endpoint anchors are supported for DD only and rejected for other open boundary types. Boundary conditions are enforced in the basis and in finite-difference endpoint updates.

### Closed-string modes

`Y = A + vτ + Σ [L_n cos(n(σ+τ)+φ_L,n) + R_n cos(n(σ−τ)+φ_R,n)]`.

Amplitudes, phases and axes are editable independently; periodicity is exact at the analytic level. Nonzero flux from imbalance between left and right worldsheet momenta can violate the global closure condition and is surfaced. The solver does not silently project an invalid configuration onto a physical state.

### Numerics

Central-difference leapfrog spatial operator with periodic wrap or N/D reflected/fixed endpoints; CFL ratio `Δτ/Δσ ≤ 0.9`, bound of 30,000 internal steps. Diagnostic RMS transverse error compares the sampled numerical displacement against a known analytic mode expansion at the corresponding simulated time. The step is selected by the solver, not blindly taken from the UI. Convergence sample counts 64/128/256, subject to actual computational limits. The finite-difference solver solves the transverse PDE; the reconstructed longitudinal constraints have **approximation errors** that are not certified away. Numerical output status is `numerical_approximation_not_certified`.

### Physical validity warning

A full covariant string solution requires both equations of motion and stress-tensor constraints; solution of the free wave equation alone is not a guarantee. Local constraints are enforced algebraically in continuous form when defining the reconstructed field, but the sampled display embedding and its derivatives are approximate. Closed-string global closure is checked. Full computational certification of all gauge constraints for arbitrary high-frequency states and sampled worldsheets is **not supplied**.

## Critical-bosonic quantum model

A finite occupation-number state is described by `N=Σ_{n,i} n N_{n,i}`, `N_{n,i}≥0`; left/right versions exist for closed strings. A critical free bosonic background has 26 target dimensions and 24 transverse light-cone oscillators.

Non-compact open: `M²=(N−1)/α′`.

Non-compact closed: `M²=(2/α′)(N_L+N_R−2)` with `N_L=N_R`.

For one compact circular spatial coordinate of radius R with integer momentum quantum number n and winding w:

`M²=(n/R)²+(wR/α′)²+(2/α′)(N_L+N_R−2)`.

The implemented level-matching convention is `N_L−N_R+n w=0` and the 1D momenta are `p_L=n/R+wR/α′`, `p_R=n/R−wR/α′`.

Under `R′=α′/R`, `n′=w`, `w′=n`, `M²` and `p_L` are invariant while `p_R` changes sign. The code computes and reports these numerical invariants and the level-matching relation. These are exact finite arithmetic **within the selected critical free-bosonic Fock spectrum** and are not a full BRST, GSO-projected, fermionic, curved-background or interacting string calculation. Negative M² means a tachyonic mass parameter **in this theoretical spectrum**, not a physical particle discovery. Quantum oscillator states do not correspond uniquely to one animated classical 3D geometry.

## Higher-dimensional projection and brane-like example

Target dimension D in the classical solver can be 4–26. The projection picks three values from `{X⁺,X⁻,X¹,…,X^(D−2),σ}`. Because `σ` belongs to the worldsheet and not target spacetime, any projection including `σ` is specifically tagged **parameter-space diagram**; otherwise it is a three-coordinate view of a higher-dimensional target embedding. It is inherently non-invertible: hidden coordinates and full Lorentzian geometry are missing.

The example titled *Endpoints on separated supports* is **only DD boundary data**, which is mathematically a pedagogical reduction relevant to open strings fixed to supports. It contains no solved DBI action, no actual Dp-brane surfaces, no moving branes, and no brane tension/effective gauge field.

## Experiment classification

1. NN standing waves — analytical reduced flat string.
2. Closed left/right wave modes — analytical reduced model + closure check.
3. Open mode superposition — analytical reduced model.
4. α′/tension dependence of gauge-fixed Hamiltonian — analytical reduced model; **wave speed is not scaled by tension**.
5. Time-swept worldsheet geometry — projection of actual computed states; not complete spacetime worldsheet.
6. N/D open boundaries — analytical reduced model.
7. Critical bosonic oscillator levels — quantum arithmetic only.
8. Circular compactification momentum/winding — quantum arithmetic only; no compact manifold solver.
9. Radius T-duality — quantum arithmetic with invariant checking.
10. Two separated fixed endpoints — DD boundary data, not full dynamic branes.
11. High-dimensional coordinate selection — projection only.
12. Finite-difference mode convergence — numerical transverse wave model.

## Error thresholds and stability

- Closed global mismatch `abs(flux)/max(1,∫|density|dσ) < 1e-8` for analytical output classification; note that finite sampling may under-resolve high harmonic frequencies, so this is a **numerical diagnostic**, not a formal proof.
- Numerical leapfrog `dt/dsigma <= .9`, cap at 30,000 updates, 4,096 spatial samples and 32 configured modes.
- Numerical output additionally returns RMS error versus an analytical reference. This is a testable diagnostic—not an automatic validity certificate.
- Quantum T-dual mass invariance uses relative `1e-11` tolerance.
- No guarantee of floating-point identity across different NumPy, CPU, Python or library versions; reproducibility is intended within documented tolerances.
