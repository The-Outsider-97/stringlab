"""Finite, explicitly scoped string-theory calculations; not a full quantum string simulator.

RNS spectra: free critical light-cone *open* RNS sectors; no BRST cohomology or
spinor construction. CFT: Virasoro central-extension coefficient for a free
matter + ghost system. CY: exact algebraic properties of the Fermat quintic
and pointwise complex-torus distances; no Ricci-flat metric solver.
"""
from __future__ import annotations

from math import isfinite, pi, sqrt
from typing import Any

from .physics import ModelError


def _int(value: Any, name: str, lo: int, hi: int) -> int:
    if type(value) is not int or not lo <= value <= hi:
        raise ModelError(f"{name} must be an integer in [{lo}, {hi}].")
    return value


def _positive(value: Any, name: str) -> float:
    if type(value) not in (float, int) or not isfinite(value) or not 0 < value <= 1e6:
        raise ModelError(f"{name} must be finite and greater than zero (max 1e6).")
    return float(value)


def rns_spectrum(raw: dict[str, Any]) -> dict[str, Any]:
    """Open free RNS light-cone occupation count, α'M²=N−a.

    NS fermions have half-integer labels r=k+1/2 and occupation 0/1 per
    transverse axis; R fermions have positive integer modes and occupation
    0/1. R zero modes create an unexamined spinor ground-state representation.
    The NS GSO projection retains odd fermionic oscillator parity. In the
    R sector the chirality projection cannot be evaluated from this input.
    """
    if not isinstance(raw, dict):
        raise ModelError("RNS configuration must be an object.")
    sector = raw.get("sector", "NS")
    if sector not in ("NS", "R"):
        raise ModelError("Supported open RNS sectors are NS and R.")
    d = _int(raw.get("dimensions", 10), "dimensions", 4, 10)
    alpha = _positive(raw.get("alpha_prime", 1.0), "alpha_prime")
    oscillators = raw.get("oscillators", [])
    if not isinstance(oscillators, list) or len(oscillators) > 128:
        raise ModelError("oscillators must be a list of up to 128 entries.")
    level = 0.0
    fermion_parity = 0
    occupied_fermion_slots: set[tuple[int, int]] = set()
    for item in oscillators:
        if not isinstance(item, dict):
            raise ModelError("Each oscillator must be an object.")
        field = item.get("field", "boson")
        if field not in ("boson", "fermion"):
            raise ModelError("Oscillator field must be boson or fermion.")
        k = _int(item.get("mode", 1), "mode", 0 if field == "fermion" and sector == "NS" else 1, 100)
        axis = _int(item.get("axis", 1), "transverse axis", 1, d-2)
        number = _int(item.get("occupation", 1), "occupation", 0, 1 if field == "fermion" else 100)
        if field == "boson" and k == 0:
            raise ModelError("Bosonic oscillator modes begin at integer 1.")
        if field == "fermion":
            slot = (axis, k)
            if slot in occupied_fermion_slots:
                raise ModelError("Duplicate fermionic mode/axis: Pauli exclusion is violated.")
            occupied_fermion_slots.add(slot)
            fermion_parity += number
            level += number * (k + 0.5 if sector == "NS" else k)
        else:
            level += number * k
    intercept = 0.5 if sector == "NS" else 0.0
    gso = "passes_NS_odd_fermion_parity" if sector == "NS" and fermion_parity % 2 else (
        "rejected_NS_even_fermion_parity" if sector == "NS" else "R_spinor_chirality_not_evaluated")
    return {"model": "free_open_RNS_light_cone", "scientific_category": "reduced_finite_spectrum",
            "sector": sector, "dimensions": d, "alpha_prime": alpha,
            "excitation_level": level, "intercept": intercept, "mass_squared": (level-intercept)/alpha,
            "mass_unit": "model length^-2", "fermion_parity": fermion_parity,
            "gso_status": gso, "critical_dimension": d == 10,
            "physical_state": ("rejected_by_GSO" if sector == "NS" and fermion_parity % 2 == 0
                               else "not_fully_evaluated" if sector == "R" or d != 10
                               else "allowed_in_this_restricted_model"),
            "limitations": "No R-sector spinor/chirality construction, super-Virasoro/BRST physical-state test, interactions, or closed-string sectors."}


def conformal_anomaly(raw: dict[str, Any]) -> dict[str, Any]:
    """Evaluate exact Virasoro central term on an integer pair (m,n).

    Uses the standard free bosonic matter (c=D), bc ghosts (c=-26), or
    free RNS matter (c=3D/2), bc (c=-26) and beta-gamma (c=11).
    """
    if not isinstance(raw, dict):
        raise ModelError("CFT configuration must be an object.")
    theory = raw.get("theory", "bosonic")
    if theory not in ("bosonic", "RNS"):
        raise ModelError("CFT theory must be bosonic or RNS.")
    d = _int(raw.get("dimensions", 26 if theory == "bosonic" else 10), "dimensions", 2, 52)
    m = _int(raw.get("m", 2), "Virasoro mode m", -100, 100)
    n = _int(raw.get("n", -2), "Virasoro mode n", -100, 100)
    matter = float(d) if theory == "bosonic" else 1.5*d
    ghost = -26 if theory == "bosonic" else -15
    total = matter+ghost
    central = total*(m**3-m)/12 if m+n == 0 else 0.0
    return {"model": "free_CFT_central_charge", "theory": theory,
            "matter_c": matter, "ghost_c": ghost, "total_c": total,
            "virasoro_modes": [m,n], "central_extension_coefficient": central,
            "formal_commutator": "[L_m,L_n]=(m-n)L_(m+n)+(c/12)(m^3-m)delta_(m+n,0)",
            "critical_dimension": total == 0,
            "brst_necessary_condition": "central_charge_anomaly_cancels" if total == 0 else "central_charge_anomaly_nonzero",
            "brst_cohomology": "not_computed",
            "limitations": "Checks necessary conformal anomaly cancellation only; does not construct Q_BRST, cohomology, or physical states."}


def calabi_yau_example(raw: dict[str, Any]) -> dict[str, Any]:
    """Finite exact mathematics for two standard CY3 examples, not a metric solver.

    Complex three-torus C^3 / Λ has a flat Calabi-Yau structure with trivial
    holonomy (contained in SU(3)). The Fermat quintic in CP^4 is smooth:
    grad(F)=5 z_i^4; common zero implies all z_i=0, forbidden projectively.
    Adjunction K_X=(K_CP4+5H)|_X=0. Hodge numbers are reference facts, not
    outputs of a numerical Hodge-theory computation.
    """
    if not isinstance(raw, dict):
        raise ModelError("Calabi-Yau configuration must be an object.")
    kind = raw.get("example", "fermat_quintic")
    if kind == "fermat_quintic":
        z = raw.get("complex_coordinates", [[1,0],[0,0],[0,0],[0,0],[0,0]])
        if not isinstance(z, list) or len(z) != 5 or any(not isinstance(v,list) or len(v)!=2 for v in z):
            raise ModelError("Provide five complex projective coordinates as [real,imag] pairs.")
        values=[]
        for pair in z:
            if any(type(t) not in (float,int) or not isfinite(t) or abs(t)>1e3 for t in pair):
                raise ModelError("Coordinates must be finite with absolute value <= 1e3.")
            values.append(complex(*pair))
        if all(v == 0 for v in values):
            raise ModelError("All-zero homogeneous coordinates are not a point in CP^4.")
        f = sum(v**5 for v in values)
        grad = [5*v**4 for v in values]
        scale = max(abs(v) for v in values)
        return {"model": "fermat_quintic_projective_CY3", "degree": 5,
                "polynomial_F": [f.real, f.imag], "normalized_F_abs": abs(f)/scale**5,
                "gradient_abs": [abs(g)/scale**4 for g in grad],
                "point_on_hypersurface": abs(f)/scale**5 < 1e-12,
                "global_smoothness_proof": "grad F=0 forces all z_i=0, excluded in projective space",
                "canonical_bundle": "trivial by adjunction (degree 5 in CP^4)",
                "hodge_numbers_reference": {"h11":1,"h21":101}, "euler_characteristic_reference":-200,
                "scope": "algebraic property inspector, not a Ricci-flat metric or string-vacuum solver"}
    if kind == "flat_torus":
        radius = _positive(raw.get("radius",1.), "radius")
        a = raw.get("angles", [0.0]*6)
        if not isinstance(a,list) or len(a)!=6 or any(type(v) not in (float,int) or not isfinite(v) for v in a):
            raise ModelError("angles must have six finite real components.")
        angles=[float(v)%(2*pi) for v in a]
        embedded=[[radius*__import__('math').cos(t),radius*__import__('math').sin(t)] for t in angles]
        return {"model":"flat_complex_torus_CY3","complex_dimensions":3,"real_dimensions":6,
                "radius":radius,"periodic_angles":angles,"circle_embeddings":embedded,
                "holonomy":"trivial (subset of SU(3))", "ricci_curvature":"zero for the flat torus metric",
                "scope":"exact flat-torus geometry; no Calabi-Yau phenomenology"}
    raise ModelError("Supported Calabi-Yau examples: fermat_quintic or flat_torus.")


def closed_rns_spectrum(raw: dict[str, Any]) -> dict[str, Any]:
    """Finite free type-II-like closed RNS oscillator levels (no spinor GSO).

    For noncompact flat D=10: α′M²/4=N_L-a_L=N_R-a_R.
    NS oscillators half-integral, R fermion nonzero modes integral. The
    R ground-state 2^(D-2)/2 zero-mode Clifford module is NOT constructed.
    """
    if not isinstance(raw,dict):raise ModelError('Closed RNS configuration must be an object.')
    d=_int(raw.get('dimensions',10),'dimensions',4,10)
    alpha=_positive(raw.get('alpha_prime',1.),'alpha_prime')
    sectors=[];exc=[];gso=[]
    for side in ('left','right'):
        sector=raw.get(side+'_sector','NS')
        if sector not in ('NS','R'):raise ModelError(f'{side}_sector must be NS or R.')
        state=rns_spectrum({'dimensions':d,'alpha_prime':alpha,'sector':sector,
                            'oscillators':raw.get(side,[])})
        sectors.append(sector);exc.append(state['excitation_level']-state['intercept']);gso.append(state['gso_status'])
    mismatch=exc[0]-exc[1]
    physical=(abs(mismatch)<1e-9 and all(not s.startswith('rejected') for s in gso))
    mass=4*exc[0]/alpha if abs(mismatch)<1e-9 else None
    return {'model':'free_closed_RNS_noncompact','sectors':sectors,'dimensions':d,
            'critical_dimension':d==10,'left_mass_shell_level':exc[0],
            'right_mass_shell_level':exc[1], 'level_matching_residual':mismatch,
            'mass_squared':mass,'gso_checks':gso,
            'state_status': ('fails_level_matching_or_NS_GSO' if not physical else
                'R_sector_chirality_undetermined' if 'R' in sectors or d!=10 else 'allowed_in_restricted_NS_model'),
            'limitations':'Free oscillator spectrum only. No R zero-mode spinor, spacetime SUSY, type IIA/IIB chirality selection, BRST cohomology, or interactions.'}


def free_boson_cft(raw: dict[str, Any]) -> dict[str, Any]:
    """Exact finite free-boson vertex correlator on the complex plane.

    Normal ordering and charge neutrality assumed. For normalized worldsheet
    S=(4πα′)^(-1)∫∂X·∂X, ∏|zi-zj|^(α′ ki·kj).
    This is Euclidean CFT, not a complete interacting string amplitude.
    """
    import numpy as np
    if not isinstance(raw,dict):raise ModelError('CFT configuration must be an object.')
    alpha=_positive(raw.get('alpha_prime',1.),'alpha_prime')
    momenta=raw.get('momenta',[]);positions=raw.get('positions',[])
    if not isinstance(momenta,list) or not isinstance(positions,list) or not 2<=len(momenta)==len(positions)<=20:
        raise ModelError('CFT requires 2–20 momentum vectors and matching [Re,Im] positions.')
    dim=len(momenta[0]) if isinstance(momenta[0],list) else 0
    if not 1<=dim<=26 or any(not isinstance(k,list) or len(k)!=dim for k in momenta):
        raise ModelError('All CFT momentum vectors must have the same dimension in [1,26].')
    if any(not isinstance(z,list) or len(z)!=2 for z in positions):
        raise ModelError('Positions must be [real,imaginary] pairs.')
    try:k=np.asarray(momenta,dtype=float);z=np.asarray(positions,dtype=float)
    except (TypeError,ValueError,OverflowError) as exc:raise ModelError('CFT arrays must be numeric.') from exc
    if not np.isfinite(k).all() or not np.isfinite(z).all() or np.max(np.abs(k))>100 or np.max(np.abs(z))>1e5:
        raise ModelError('Nonfinite or excessive CFT coordinates or momenta.')
    charge=np.sum(k,axis=0)
    neutral=bool(np.linalg.norm(charge)<1e-10*max(1.,float(np.max(np.abs(k)))))
    logmag=0.
    for i in range(len(k)):
        for j in range(i):
            sep=float(np.linalg.norm(z[i]-z[j]))
            if sep<=1e-12:raise ModelError('Coincident vertex insertions require additional regularization.')
            logmag+=alpha*float(np.dot(k[i],k[j]))*__import__('math').log(sep)
    weights=(alpha*np.sum(k*k,axis=1)/4).tolist()
    return {'model':'Euclidean_free_boson_vertex_CFT','momentum_dimension':dim,
            'charge_neutral':neutral,'total_momentum':charge.tolist(),
            'conformal_weights_h_hbar':[{'h':float(w),'hbar':float(w)} for w in weights],
            'correlator_log_magnitude':float(logmag) if neutral else None,
            'correlator_magnitude':float(np.exp(logmag)) if neutral and abs(logmag)<700 else None,
            'status':'correlator_evaluated' if neutral and abs(logmag)<700 else ('zero_by_neutrality' if not neutral else 'log_domain_only'),
            'limitations':'Flat Euclidean free-boson CFT, normally ordered scalar vertices; no ghost insertions, modular integration, or full string S-matrix.'}


def oscillator_character(raw: dict[str, Any]) -> dict[str, Any]:
    """Exact integer coefficients of ∏_{n≥1}(1-q^n)^(-D), through q^L."""
    if not isinstance(raw,dict):raise ModelError('Character configuration must be an object.')
    dims=_int(raw.get('dimensions',1),'dimensions',1,26)
    lev=_int(raw.get('max_level',12),'max_level',0,60)
    # D colors of independent ordinary boson partitions; dynamic programming.
    coeff=[0]*(lev+1);coeff[0]=1
    for mode in range(1,lev+1):
        for _ in range(dims):
            for energy in range(mode,lev+1):coeff[energy]+=coeff[energy-mode]
    return {'model':'free_boson_Fock_character','dimension':dims,'max_level':lev,
            'coefficients':coeff,'formula':'prod_{n>=1}(1-q^n)^(-D)',
            'exact_integer_arithmetic':True,
            'limitations':'Finite q-expansion of oscillator generating function. No momentum zero modes, ghosts, modular invariance, or physical-state projection.'}


def _nonnegative_intercept(v: Any) -> float:
    if type(v) not in (int,float) or not isfinite(v) or not 0 <= v <= 5:
        raise ModelError('intercept must be finite and between 0 and 5.')
    return float(v)


def brst_consistency(raw: dict[str, Any]) -> dict[str, Any]:
    """Necessary anomaly and intercept checks for standard BRST quantization.

    Do not mistake c_total=0 for a computation of the operator Q_B, its
    nilpotency on a Hilbert space or Q_B cohomology.
    """
    if not isinstance(raw,dict):raise ModelError('BRST configuration must be an object.')
    theory=raw.get('theory','bosonic')
    if theory not in ('bosonic','RNS'):raise ModelError('BRST theory must be bosonic or RNS.')
    d=_int(raw.get('dimensions',26 if theory=='bosonic' else 10),'dimensions',2,52)
    sector=raw.get('sector','NS')
    if theory=='RNS' and sector not in ('NS','R'):raise ModelError('RNS BRST sector must be NS or R.')
    intercept=_nonnegative_intercept(raw.get('intercept')) if raw.get('intercept',None) is not None else (1. if theory=='bosonic' else .5 if sector=='NS' else 0.)
    expected=1. if theory=='bosonic' else (.5 if sector=='NS' else 0.)
    ctotal=(d-26) if theory=='bosonic' else (1.5*d-15)
    m=_int(raw.get('mode',2),'mode',-100,100)
    obstruction=ctotal*(m**3-m)/12
    return {'model':'BRST_necessary_consistency','theory':theory,'sector':sector if theory=='RNS' else None,
            'dimensions':d,'total_central_charge':float(ctotal),'intercept':intercept,
            'required_intercept':expected,'tested_virasoro_mode':m,'central_obstruction_coefficient':float(obstruction),
            'central_anomaly_cancels':bool(ctotal==0),'intercept_matches_standard':abs(intercept-expected)<1e-12,
            'necessary_conditions_satisfied':bool(ctotal==0 and abs(intercept-expected)<1e-12),
            'brst_nilpotency_operator_test':'not_implemented', 'brst_cohomology':'not_computed',
            'limitations':'Only central anomaly and normal-order intercept conditions. Finite checks do NOT prove nilpotency or compute BRST cohomology.'}


def flat_torus_geodesic(raw:dict[str,Any])->dict[str,Any]:
    """Exact 6-torus geodesic lift and scalar-Laplacian Fourier eigenvalue."""
    import numpy as np
    if not isinstance(raw,dict):raise ModelError('Flat-torus configuration must be an object.')
    r=_positive(raw.get('radius',1.),'radius')
    a=raw.get('start',[0.]*6);b=raw.get('end',[0.]*6)
    n=raw.get('wave_numbers',[0]*6)
    if any(not isinstance(x,list) or len(x)!=6 for x in (a,b,n)):
        raise ModelError('Torus start/end/wave_numbers need six components.')
    if any(type(x) is not int or abs(x)>100 for x in n):raise ModelError('wave_numbers must be integers in [-100,100].')
    if any(type(x) not in (int,float) or not isfinite(x) or abs(x)>1e6 for x in a+b):
        raise ModelError('Torus coordinates must be finite.')
    dx=np.asarray(b,dtype=float)-np.asarray(a,dtype=float)
    period=2*pi*r
    winding=np.round(dx/period).astype(int)
    shortest=dx-period*winding
    return {'model':'flat_complex_T3_exact_geodesic','radius':r,'period':period,
            'lattice_lift':winding.tolist(),'shortest_displacement':shortest.tolist(),
            'geodesic_distance':float(np.linalg.norm(shortest)),
            'laplacian_eigenvalue':float(sum(x*x for x in n)/r**2),
            'ricci_scalar_exact':0.,'complex_dimension':3,
            'limitations':'Exact flat complex torus T6; trivial SU(3)-contained holonomy. Not a generic SU(3)-holonomy CY metric.'}


def quintic_tangent_metric(raw:dict[str,Any])->dict[str,Any]:
    """Hermitian Fubini--Study metric restricted to smooth Fermat quintic tangent.

    The induced Fubini--Study metric is *not* Ricci-flat; no Yau PDE solved.
    Projective chart j with z_j !=0; tangent ker dF dim_C=3 at F=0.
    """
    import numpy as np
    if not isinstance(raw,dict):raise ModelError('Quintic configuration must be an object.')
    data=calabi_yau_example({'example':'fermat_quintic','complex_coordinates':raw.get('complex_coordinates',[[1,0],[-1,0],[0,0],[0,0],[0,0]])})
    if not data['point_on_hypersurface']:
        raise ModelError('Fermat quintic tangent metric requires a point on F=0.')
    z=np.array([complex(*a) for a in raw.get('complex_coordinates',[[1,0],[-1,0],[0,0],[0,0],[0,0]])])
    j=int(np.argmax(np.abs(z)))
    indices=[i for i in range(5) if i!=j]
    u=z[indices]/z[j]
    norm=1.+np.vdot(u,u).real
    g=(norm*np.eye(4)-np.outer(np.conj(u),u))/norm**2
    grad=5*u**4
    if np.linalg.norm(grad)<1e-12:
        raise ModelError('Projective tangent gradient degenerates in this numerical chart.')
    normal=np.conj(grad)/np.linalg.norm(grad)
    proj=np.eye(4)-np.outer(normal,np.conj(normal))
    projected=proj.conj().T@g@proj
    spectrum=np.linalg.eigvalsh(projected)
    return {'model':'fermat_quintic_induced_Fubini_Study_tangent','selected_projective_chart':j,
            'complex_tangent_dimension':3,'projected_metric_eigenvalues':spectrum.clip(0).tolist(),
            'tangent_projector_trace':float(np.trace(proj).real),
            'quintic_polynomial_residual':data['normalized_F_abs'],
            'positive_tangent_metric':bool(np.sum(spectrum>1e-10)==3),
            'ricci_flat_metric':'not_computed','kahler_metric':'induced_Fubini_Study_not_Ricci_flat',
            'limitations':'Local tangent-space Hermitian metric from projective Fubini–Study; not the Calabi–Yau Ricci-flat metric.'}
