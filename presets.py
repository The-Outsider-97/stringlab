"""Twelve real parameterized learning workflows, with explicitly scoped semantics."""
from __future__ import annotations

from copy import deepcopy
from .physics import template
from .quantum import quantum_template


def library() -> list[dict]:
    specs = [
        ("open", "01 · Open string fundamental", "Classical analytical", "Check the first Neumann standing-wave mode."),
        ("closed", "02 · Closed traveling waves", "Classical analytical", "Contrast left and right movers; check global level matching."),
        ("open", "03 · Mode superposition", "Classical analytical", "Combine Fourier modes and examine their contribution."),
        ("open", "04 · Tension and α′", "Classical analytical", "Change α′ and inspect gauge-fixed energy; the wave speed stays one."),
        ("closed", "05 · Worldsheet evolution", "Projection only", "Trace computed curves over τ to form a projected worldsheet."),
        ("open", "06 · Boundary conditions", "Classical analytical", "Compare NN, DD, ND and DN mode bases."),
        ("closed", "07 · Quantum excitations", "Quantum spectrum", "Inspect discrete oscillator levels, mass² and physical-state restrictions."),
        ("closed", "08 · S¹ compactification", "Quantum spectrum", "Inspect compact momentum, winding and R-dependent mass²."),
        ("closed", "09 · Circular T-duality", "Quantum spectrum", "Swap n and w and invert R while checking spectral invariance."),
        ("open", "10 · Endpoints on separated supports", "Reduced Dirichlet model", "Constrain endpoints to fixed positions; not a general D-brane action."),
        ("closed", "11 · Higher-D projections", "Projection only", "Re-select coordinates from a 26D configuration."),
        ("open", "12 · Numerical convergence", "Numerical PDE", "Compare leapfrog results at three increasing resolutions."),
    ]
    out = []
    for i, (kind, title, category, objective) in enumerate(specs, 1):
        c = template(kind)
        if i == 3:
            c["modes"].append({"n": 2, "axis": 2, "amplitude": .23, "phase": 1., "enabled": True})
        if i == 5:
            c["display"]["worldsheet"] = True
        if i == 6:
            c["bc"] = "DD"
        if i == 10:
            c["bc"] = "DD"; c["anchor_end"] = [1., 0., 0.]
        if i == 11:
            c["modes"].append({"n": 2, "axis": 6, "left": .15, "right": .15,
                               "phase_left": .3, "phase_right": .3, "enabled": True})
            c["projection"] = ["X1", "X2", "X6"]
        if i == 12:
            c["solver"] = "finite_difference"; c["duration"] = 2.
        out.append({"id": i, "kind": kind, "title": title, "category": category,
                    "objective": objective, "configuration": c,
                    "quantum": ({**quantum_template(), "compact": False} if i == 7 else quantum_template()) if i in (7, 8, 9) else None,
                    "limitation": "Quantum spectrum is not a classical shape" if i in (7, 8, 9) else
                                  "Supports treated as fixed Dirichlet boundary data, not dynamic branes" if i == 10 else
                                  "3D projection omits hidden coordinates" if i in (5, 11) else None})
    return out
