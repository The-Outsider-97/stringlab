"""Nonlinear worldsheet integration with target-space tensors.

Polyakov conformal gauge: Ẍ^μ-X″^μ + Γ^μ_{αβ}(X)
(Ẋ^α Ẋ^β-X′^α X′^β)=0. Target Minkowski or spatially flat
exponential FRW ds²=-dt²+exp(2Ht) Σdx_i². These are independently
integrated target coordinates (including X^0), not the light-cone solver.

Constraint diagnostics are *measurements*, not a numerical projection.
Gauge choice, backgrounds and prescribed initial data remain restricted;
this is not an arbitrary-metric, topology-changing string solver.
"""
from __future__ import annotations
from math import pi
from typing import Any
import numpy as np
from .physics import ModelError, scalar, whole


def _number(raw: dict, key: str, default: float, lo: float, hi: float) -> float:
    return scalar(raw.get(key, default), key, lo, hi)


def _integer(raw: dict, key: str, default: int, lo: int, hi: int) -> int:
    return whole(raw.get(key, default), key, lo, hi)


def _derivatives(x: np.ndarray, dx: float, closed: bool) -> tuple[np.ndarray, np.ndarray]:
    if closed:
        first = (np.roll(x, -1, 0) - np.roll(x, 1, 0)) / (2 * dx)
        second = (np.roll(x, -1, 0) - 2 * x + np.roll(x, 1, 0)) / dx**2
    else:
        first = np.gradient(x, dx, axis=0, edge_order=2)
        first[0] = 0; first[-1] = 0
        second = np.zeros_like(x)
        second[1:-1] = (x[:-2] - 2*x[1:-1] + x[2:]) / dx**2
        second[0] = 2*(x[1]-x[0]) / dx**2
        second[-1] = 2*(x[-2]-x[-1]) / dx**2
    return first, second


def _metric_norm(x: np.ndarray, a: np.ndarray, b: np.ndarray, hubble: float) -> np.ndarray:
    scale_sq = np.exp(2 * hubble * np.clip(x[:, 0], -50, 50))
    return -a[:, 0]*b[:, 0] + scale_sq * np.sum(a[:, 1:]*b[:, 1:], axis=1)


def _acceleration(x: np.ndarray, v: np.ndarray, dx: float, closed: bool, hubble: float) -> np.ndarray:
    s, second = _derivatives(x, dx, closed)
    if hubble:
        a2 = np.exp(2*hubble*np.clip(x[:, 0], -50, 50))
        second[:, 0] -= hubble*a2*(np.sum(v[:, 1:]**2, axis=1)-np.sum(s[:, 1:]**2, axis=1))
        second[:, 1:] -= 2*hubble*(v[:, 0, None]*v[:, 1:] - s[:, 0, None]*s[:, 1:])
    return second


def _diagnostics(x: np.ndarray, v: np.ndarray, dx: float, closed: bool, h: float, tension: float) -> dict:
    s, _ = _derivatives(x, dx, closed)
    vv = _metric_norm(x, v, v, h); ss = _metric_norm(x, s, s, h); vs = _metric_norm(x, v, s, h)
    c1 = vv+ss; c2 = vs; det = vv*ss-vs**2
    # Discrete spatial differentiation has second-order truncation and may
    # violate exact constraints even for exact continuum solutions.
    scale = max(float(np.max(np.abs(vv)+np.abs(ss))), 1e-12)
    integrate = (lambda y: float(np.mean(y)*2*pi) if closed else float(np.trapezoid(y, dx=dx)))
    p_density = .5*tension*(vv-ss)
    ng_density = -tension*np.sqrt(np.clip(-det,0,None))
    return {"constraint_tautau_rms": float(np.sqrt(np.mean(c1**2))/scale),
            "constraint_tausigma_rms": float(np.sqrt(np.mean(c2**2))/scale),
            "constraint_tautau_max": float(np.max(np.abs(c1))/scale),
            "constraint_tausigma_max": float(np.max(np.abs(c2))/scale),
            "timelike_fraction": float(np.mean(det < -1e-9)),
            "polyakov_lagrangian_integral_sigma": integrate(p_density),
            "nambu_goto_lagrangian_integral_sigma": integrate(ng_density),
            "max_embedding_coordinate": float(np.max(np.abs(x))),
            "coordinate_time_monotonic": bool(np.min(v[:, 0]) > 0),
            "curvature_hubble": h,
            "constraint_status": "numerically_monitored_not_projected"}


def polyakov_series(raw: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(raw, dict):
        raise ModelError("Polyakov configuration must be an object.")
    kind = raw.get("kind", "closed")
    if kind not in ("closed", "open"):
        raise ModelError("Polyakov kind must be closed or open.")
    d = _integer(raw, "dimensions", 4, 3, 8)
    n = _integer(raw, "points", 96, 32, 512)
    nf = _integer(raw, "frames", 80, 2, 160)
    duration = _number(raw, "duration", 4.0, .02, 20.)
    amplitude = _number(raw, "amplitude", 1., .02, 5.)
    hubble = _number(raw, "hubble", 0., -.2, .2)
    alpha = _number(raw, "alpha_prime", 1., 1e-6, 1e6)
    tension = 1/(2*pi*alpha)
    closed = kind == "closed"
    length = 2*pi if closed else pi
    dx = length/(n if closed else n-1)
    # Small enough step for explicit propagation of curved target data. Outputs
    # sampled at integer substeps to avoid interpolating across constraints.
    nsteps = max(nf-1, int(np.ceil(duration/(.2*dx))))
    nsteps = int(np.ceil(nsteps/(nf-1)))*(nf-1)
    if nsteps > 30000:
        raise ModelError("Polyakov run exceeds the 30,000 step budget.")
    dt = duration/nsteps
    sigma = np.linspace(0,length,n,endpoint=not closed)
    x = np.zeros((n,d), dtype=float)
    v = np.zeros_like(x)
    if closed:
        x[:, 1] = amplitude*np.cos(sigma)
        x[:, 2] = amplitude*np.sin(sigma)
        v[:, 0] = amplitude
    else:
        # Open rotating rod: X^1=A cosσ cosτ, X^2=A cosσ sinτ,
        # X^0=Aτ. Both Virasoro constraints hold analytically at τ=0.
        x[:, 1] = amplitude*np.cos(sigma)
        v[:, 2] = amplitude*np.cos(sigma)
        v[:, 0] = amplitude
    results = []
    stride = nsteps//(nf-1)
    for k in range(nsteps+1):
        if k % stride == 0:
            diag = _diagnostics(x, v, dx, closed, hubble, tension)
            pos = np.zeros((n,3)); pos[:,:min(d-1,3)] = x[:,1:1+min(d-1,3)]
            results.append({"time": float(k*dt), "solver": "covariant_polyakov",
                            "geometry": pos.round(10).tolist(), "projection": ["X1","X2","X3"],
                            "closed": closed, "status": "numerical_constraints_checked",
                            "projection_kind": "target_space_coordinate_projection",
                            "diagnostics": {**diag, "effective_dt":dt,"cfl":dt/dx,
                                            "spatial_boundary": "periodic" if closed else "Neumann"},
                            "samples":n, "model_assumptions":"Conformal worldsheet gauge; flat or exponential spatially-flat FRW target; no gauge projection."})
        if k == nsteps: break
        a0 = _acceleration(x,v,dx,closed,hubble)
        vmid = v+.5*dt*a0
        xnew = x+dt*vmid
        a1 = _acceleration(xnew,vmid,dx,closed,hubble)
        vnew = vmid+.5*dt*a1
        x,v = xnew,vnew
        if not (np.isfinite(x).all() and np.isfinite(v).all()) or np.max(np.abs(x))>1e5:
            raise ModelError("Polyakov evolution diverged; reduce duration or background H.")
    return results
