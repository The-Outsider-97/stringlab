"""Mathematically restricted flat static Dp-branes and homogeneous DBI densities.

A Dp-brane spans p spatial axes and one target-space time axis, with no
backreaction. Homogeneous gauge fields enter the DBI determinant exactly.
No simulation of brane gravity, string interactions, brane recoil, or nonlinear
spatially varying embeddings is claimed.
"""
from __future__ import annotations

from math import isfinite, pi, sqrt
from typing import Any

import numpy as np

from .physics import ModelError


def flat_dbi(raw: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ModelError("D-brane configuration must be an object.")
    p = raw.get("p", 2)
    if type(p) is not int or not 0 <= p <= 9:
        raise ModelError("p must be an integer from 0 to 9.")
    d = raw.get("dimensions", 10)
    if type(d) is not int or not p+1 <= d <= 26:
        raise ModelError("Spacetime dimensions must exceed p and be at most 26.")
    alpha = raw.get("alpha_prime", 1.)
    tension = raw.get("tension", 1.)
    if any(type(v) not in (int,float) or not isfinite(v) or v <= 0 or v > 1e6 for v in [alpha,tension]):
        raise ModelError("alpha_prime and tension must be positive finite numbers at most 1e6.")
    position = raw.get("position", [0.]*(d-1))
    if not isinstance(position,list) or len(position)!=d-1 or any(type(v) not in (int,float) or not isfinite(v) or abs(v)>1e6 for v in position):
        raise ModelError(f"position must have {d-1} finite spatial coordinates.")
    # Antisymmetric F_ab; a=0 is worldvolume time, i>0 are spatial tangents.
    f = raw.get("field_strength", [[0.]*(p+1) for _ in range(p+1)])
    if not isinstance(f,list) or len(f)!=p+1 or any(not isinstance(row,list) or len(row)!=p+1 for row in f):
        raise ModelError("field_strength must be a (p+1) × (p+1) matrix.")
    try:
        f = np.array(f,dtype=float)
    except (ValueError,TypeError,OverflowError) as exc:
        raise ModelError("field_strength must be a finite numeric matrix.") from exc
    if not np.all(np.isfinite(f)) or np.max(np.abs(f))>1e6 or not np.allclose(f, -f.T, atol=1e-12, rtol=0):
        raise ModelError("field_strength must be finite and antisymmetric (F_ab=-F_ba).")
    induced=np.diag([-1.]+[1.]*p)
    matrix=induced+2*pi*float(alpha)*f
    det=float(np.linalg.det(matrix))
    if det>1e-12:
        raise ModelError("DBI square root is imaginary: electric field exceeds the real-action domain.")
    density=-float(tension)*sqrt(max(0.,-det))
    return {"model":"flat_static_Dp_DBI", "scientific_category":"reduced_effective_action",
            "p":p,"target_dimensions":d,"worldvolume_dimensions":p+1,
            "spatial_embedding_axes":list(range(1,p+1)),"normal_dirichlet_axes":list(range(p+1,d)),
            "position":position, "induced_metric":induced.tolist(), "gauge_field":f.tolist(),
            "dbi_matrix_determinant":det,"lagrangian_density":density,
            "real_action":det<=0,"degenerate_critical_field":abs(det)<=1e-12,
            "boundary_conditions":"Neumann along brane tangent directions, Dirichlet along normal directions",
            "theory_note":"The Dp-brane type and stability require additional theory-specific (e.g. type-II parity/GSO) conditions not evaluated here.",
            "limitations":"Only flat static embedding and constant Abelian F. No dynamical brane PDE, endpoint coupling, backreaction, or tachyon dynamics."}
