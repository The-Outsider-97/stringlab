"""Exactly finite bosonic Fock occupation arithmetic; not a quantum field simulator.

For the *critical* bosonic string (D=26), light-cone transverse Fock states
with non-negative integer occupations. A closed string on S¹ additionally
requires N_L-N_R+n*w=0. α' and R are expressed in the same model length units.
"""
from __future__ import annotations

from copy import deepcopy
from math import isfinite, pi
from typing import Any

from .physics import ModelError


def _int(x: Any, label: str, lo: int, hi: int) -> int:
    if type(x) is not int or not lo <= x <= hi:
        raise ModelError(f"{label} must be an integer from {lo} to {hi}.")
    return x


def _positive(x: Any, label: str) -> float:
    if isinstance(x, bool) or not isinstance(x, (float, int)) or not isfinite(float(x)) or x <= 0 or x > 1e6:
        raise ModelError(f"{label} must be positive, finite and at most 1,000,000.")
    return float(x)


def occupation_level(oscillators: list[dict[str, int]]) -> int:
    if not isinstance(oscillators, list) or len(oscillators) > 64:
        raise ModelError("oscillators must contain at most 64 entries.")
    level = 0
    for item in oscillators:
        if not isinstance(item, dict):
            raise ModelError("Each oscillator needs a mode number and occupation.")
        n = _int(item.get("mode"), "mode", 1, 100)
        occupation = _int(item.get("occupation"), "occupation", 0, 100)
        axis = item.get("axis", 1)
        _int(axis, "transverse axis", 1, 24)
        level += n * occupation
    return level


def spectrum(raw: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ModelError("Quantum state must be an object.")
    theory = raw.get("theory", "critical_bosonic")
    if theory != "critical_bosonic":
        raise ModelError("Only critical light-cone bosonic oscillator spectra are implemented.")
    d = _int(raw.get("dimensions", 26), "spacetime dimension", 4, 26)
    alpha = _positive(raw.get("alpha_prime", 1.), "Regge slope alpha_prime")
    kind = raw.get("kind", "closed")
    if kind not in ("open", "closed"):
        raise ModelError("kind must be open or closed.")
    left = occupation_level(raw.get("left", []))
    right = occupation_level(raw.get("right", [])) if kind == "closed" else 0
    compact = raw.get("compact", False)
    if type(compact) is not bool:
        raise ModelError("compact must be boolean.")
    if compact and kind != "closed":
        raise ModelError("The implemented S¹ momentum/winding spectrum requires a closed string.")
    n, w, radius = 0, 0, None
    if compact:
        n = _int(raw.get("momentum", 0), "momentum quantum number", -100, 100)
        w = _int(raw.get("winding", 0), "winding quantum number", -100, 100)
        radius = _positive(raw.get("radius", 2.), "compactification radius")
    mismatch = left - right + n * w if kind == "closed" else 0
    matching = mismatch == 0
    if kind == "closed":
        mass2 = (2. / alpha) * (left + right - 2)
        if compact:
            mass2 += (n / radius)**2 + (w * radius / alpha)**2
    else:
        mass2 = (left - 1) / alpha
    is_critical = d == 26
    verdict = ("valid_in_this_light_cone_fock_model" if is_critical and matching
               else "level_matching_failed" if not matching else "not_evaluated_noncritical_dimension")
    return {"theory": theory, "kind": kind, "target_dimensions": d,
            "level_left": left, "level_right": right if kind == "closed" else None,
            "level_matching_integer": mismatch, "level_matching": matching,
            "mass_squared": mass2, "mass_unit": "model length^(-2)",
            "tachyonic": mass2 < 0, "physical_state": verdict,
            "oscillator_model": "Critical bosonic, transverse light-cone Fock basis",
            "compact": compact, "momentum": n if compact else None,
            "winding": w if compact else None, "radius": radius,
            "p_left": n / radius + w * radius / alpha if compact else None,
            "p_right": n / radius - w * radius / alpha if compact else None,
            "description": "State mass spectrum only; no unique classical trajectory is implied."}


def t_dual(raw: dict[str, Any]) -> dict[str, Any]:
    if not raw.get("compact") or raw.get("kind") != "closed":
        raise ModelError("T-duality needs a compact closed-string configuration.")
    old = spectrum(raw)
    dual = deepcopy(raw)
    dual["radius"] = _positive(raw.get("alpha_prime", 1.), "alpha_prime") / _positive(raw.get("radius"), "radius")
    dual["momentum"], dual["winding"] = old["winding"], old["momentum"]
    new = spectrum(dual)
    err = abs(old["mass_squared"] - new["mass_squared"])
    scale = max(1., abs(old["mass_squared"]), abs(new["mass_squared"]))
    # p_L is invariant; p_R changes sign under the chosen worldsheet convention.
    return {"original": old, "dual": new, "dual_configuration": dual,
            "mass_squared_difference": err, "mass_squared_relative_error": err / scale,
            "p_left_error": abs(old["p_left"] - new["p_left"]),
            "p_right_reflection_error": abs(old["p_right"] + new["p_right"]),
            "level_matching_preserved": old["level_matching_integer"] == new["level_matching_integer"],
            "valid": (err / scale < 1e-11 and old["level_matching_integer"] == new["level_matching_integer"])}


def quantum_template() -> dict[str, Any]:
    return {"theory": "critical_bosonic", "kind": "closed", "dimensions": 26,
            "alpha_prime": 1., "compact": True, "radius": 2., "momentum": 1,
            "winding": 0, "left": [{"mode": 1, "occupation": 1, "axis": 1}],
            "right": [{"mode": 1, "occupation": 1, "axis": 1}]}
