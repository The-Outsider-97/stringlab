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
