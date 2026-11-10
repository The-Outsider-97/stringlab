# StringLab v0.5 — finite theoretical modules and verification boundaries

The `advanced.py` and `branes.py` modules implement small, mathematically specified calculations. They do **not** provide a general superstring/CFT/BRST, Calabi–Yau metric, or dynamical-brane simulator. UI and API identify these as reduced or educational computations. The native light-cone bosonic classical solver remains the authoritative engine for animated transverse strings.

## RNS open-string spectrum

For open RNS strings in light-cone gauge, in natural units, the truncated Fock-level arithmetic is

\[\alpha' M^2 = N-a,\quad a_{\rm NS}=\tfrac12,\quad a_{\rm R}=0.\]

Bosonic oscillators contribute integer `mode × occupation`, NS fermionic oscillators contribute `(k+1/2) × occupation` with `k=0,1,...`, and positive R fermionic oscillators contribute integer `k × occupation` with `k=1,2,...`. Fermionic mode occupation is restricted to 0 or 1 per transverse axis. NS GSO odd parity is checked. R zero-mode spinor representation and GSO chirality projection are **not** constructed; the returned R physical-state status remains `not_fully_evaluated`. This is free open RNS physics only; no closed RNS sectors, interactions, or partition functions. Critical target dimension D=10 is checked.

## Conformal charge and BRST anomaly prerequisite

For critical free matter plus worldsheet ghosts, the central charge is `c_total = D−26` for the bosonic theory and `c_total = 3D/2−15` for RNS. The central coefficient in the Virasoro commutator is

\[[L_m,L_n]=(m-n)L_{m+n}+\frac{c}{12}(m^3-m)\delta_{m+n,0}.\]

The program calculates this finite coefficient, and checks whether total central charge vanishes. That is a **necessary anomaly-cancellation condition** for the relevant BRST consistency, not a construction or test of the BRST charge, nilpotency on a Hilbert space, or BRST cohomology.

## Flat Dp-brane DBI calculation

The effective homogeneous Abelian DBI Lagrangian density for a static planar Dp-brane in flat target space is

\[\mathcal{L}_{\mathrm{DBI}}=-T_p\sqrt{-\det(\gamma_{ab}+2\pi\alpha' F_{ab})}.\]

The implementation uses `gamma = diag(-1,1,...,1)` on the (p+1)-dimensional worldvolume, with `p=0..9`, a real antisymmetric constant field strength `F`, and finite positive `T_p,alpha'`. Timelike signature, real square-root domain and degeneracy warnings are checked. The `position` describes the fixed spatial embedding; brane tangent axes use Neumann endpoint conditions and normal directions use Dirichlet conditions as *boundary-description metadata*. String motion is not coupled to the brane, nor is the brane time evolved. The spectrum/stability of Dp species is theory-dependent and is not checked. The user should **not** interpret this calculator as a full Dp-brane geometry/dynamics implementation.

## Calabi–Yau examples

The algebraic **Fermat quintic** `F(z)=Σ_{i=0}^4 z_i^5=0` in projective `CP^4` has zero first Chern class by adjunction. The gradient `∂_iF=5 z_i^4` has no common projective zero, so the hypersurface is smooth. Its Hodge numbers `(h¹¹,h²¹)=(1,101)` and Euler number `−200` are established reference properties, **not computed dynamically**. A supplied projective point is tested against `F=0` under scale-normalized numerical tolerance. The **flat complex 3-torus** `T^6=C^3/Λ` example evaluates periodic coordinates and an illustrative product-of-circles embedding; its trivial holonomy lies inside `SU(3)` and its flat metric is Ricci-flat. Neither module computes the nontrivial Ricci-flat quintic metric, Kähler moduli, bundle data, worldsheet CFT on a curved compactification, or 4D effective particle spectra.

## Agent and SharedMemory integration

The user explicitly chooses an SLAI STEM or Verification request. `AgentFactory.create_agent` resolves it from the installed SLAI runtime; no AI is invoked by ordinary simulation. SharedMemory publication is an explicit `set` and `publish` with a bounded (no full geometry arrays) result carrying schema, revision and SHA-256 of the validated configuration. Consumers must compare revision **and** digest; SharedMemory is process-local by default and not a durability substitute for saved experiments. Agent outcomes are advisory and never update solver state automatically. A failed/missing plugin reports a typed `available:false` response, leaving the mathematical engine operational.

## Verification

Run `python -m pytest stringlab/tests -q` from SLAI's parent directory, `npm.cmd run typecheck`, and the conditional native integration tests inside the genuine SLAI checkout. Tests must not be presented as evidence for missing general covariant Nambu–Goto/Polyakov numerical solvers, canonical SGEO WebGL renderer, or complete interacting quantum string theory.

Sources: D. Tong, *String Theory* (Cambridge lecture notes, 2009); K. Wray, *An Introduction to String Theory* (revised 2011), especially chapters 11–13.
