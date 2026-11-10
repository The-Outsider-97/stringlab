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


def affine_dbi(raw: dict[str, Any]) -> dict[str, Any]:
    """Genuinely embedded affine Dp-brane, possibly moving, with constant F.

    Embedding X^0=t, X^i=x0^i+v^i t+T_a^i σ^a. Returns the induced
    γ_ab and sqrt(-det(γ+2πα′F)). This is an algebraic exact density for an
    affine embedding, not a spatially varying brane solver or gauge dynamics.
    """
    if not isinstance(raw,dict):raise ModelError("Dp-brane configuration must be an object.")
    p=raw.get('p',2);d=raw.get('dimensions',10)
    if type(p) is not int or not 0<=p<=9:raise ModelError('p must be an integer from 0 to 9.')
    if type(d) is not int or not p+1<=d<=26:raise ModelError('dimensions must be at least p+1 and at most 26.')
    alpha=raw.get('alpha_prime',1.);tension=raw.get('tension',1.)
    if any(type(t) not in (int,float) or not isfinite(t) or t<=0 or t>1e6 for t in (alpha,tension)):
        raise ModelError('alpha_prime and tension must be positive finite numbers.')
    velocity=raw.get('velocity',[0.]*(d-1))
    if not isinstance(velocity,list) or len(velocity)!=d-1:
        raise ModelError(f'velocity must have {d-1} spatial components.')
    tangents=raw.get('tangents',[[1. if j==i else 0. for j in range(d-1)] for i in range(p)])
    if not isinstance(tangents,list) or len(tangents)!=p or any(not isinstance(t,list) or len(t)!=d-1 for t in tangents):
        raise ModelError(f'tangents must have shape ({p}, {d-1}).')
    field=raw.get('field_strength',[[0.]*(p+1) for _ in range(p+1)])
    if not isinstance(field,list) or len(field)!=p+1 or any(not isinstance(row,list) or len(row)!=p+1 for row in field):
        raise ModelError(f'field_strength must have shape ({p+1}, {p+1}).')
    try:
        v=np.asarray(velocity,dtype=float);t=np.asarray(tangents,dtype=float).reshape(p,d-1)
        f=np.asarray(field,dtype=float)
    except (ValueError,OverflowError,TypeError) as exc:
        raise ModelError('Dp-brane embedding and F must contain valid finite numbers.') from exc
    if (not np.isfinite(v).all() or not np.isfinite(t).all() or not np.isfinite(f).all()
            or np.max(np.abs(v))>100 or (t.size and np.max(np.abs(t))>100) or np.max(np.abs(f))>100):
        raise ModelError('Dp-brane embedding and F must be finite and bounded.')
    if not np.allclose(f,-f.T,atol=1e-12,rtol=0):
        raise ModelError('F must be antisymmetric.')
    if p and np.linalg.matrix_rank(t, tol=1e-10)!=p:
        raise ModelError('Worldvolume spatial tangents must be linearly independent.')
    # Rows are worldvolume derivative vectors of Minkowski embedding.
    deriv=np.vstack((v,t))
    g=deriv@deriv.T
    g[0,0]-=1
    if float(np.linalg.eigvalsh(g)[0])>=-1e-12 or np.sum(np.linalg.eigvalsh(g)<0)!=1:
        raise ModelError('Induced metric is not Lorentzian (one timelike direction required).')
    mat=g+2*pi*float(alpha)*f
    sign,logabs=np.linalg.slogdet(mat)
    if sign>=0 or logabs>500:
        raise ModelError('DBI matrix determinant is not negative finite (supercritical field or degeneracy).')
    density=-float(tension)*np.exp(.5*logabs)
    return {'model':'affine_Dp_DBI','scientific_category':'exact_affine_embedding_density',
            'p':p,'target_dimensions':d,'velocity':v.tolist(),'spatial_tangents':t.tolist(),
            'induced_metric':g.tolist(),'field_strength':f.tolist(),
            'dbi_determinant_sign':float(sign),'dbi_log_abs_determinant':float(logabs),
            'lagrangian_density':float(density),
            'on_shell_claim':'none; constant affine motion with F=0 is a translation-invariant classical solution',
            'limitations':'Constant embedding derivatives and prescribed constant F; no Maxwell, topology, gravity, fermions or brane intersections.'}


def brane_trajectory(raw: dict[str,Any]) -> dict[str,Any]:
    """Flat homogeneous Dp-brane translation, satisfying DBI with F=0.

    The normal velocity is fixed. Constant velocity and affine spatial
    tangents yield constant induced metric and solve the embedding E-L PDE.
    """
    if not isinstance(raw,dict):raise ModelError('Dp-brane configuration must be an object.')
    if 'field_strength' in raw and any(any(x!=0 for x in row) for row in raw['field_strength']):
        raise ModelError('Homogeneous brane evolution supports F=0 only; use affine_dbi to inspect prescribed F.')
    p=raw.get('p',2);d=raw.get('dimensions',10)
    if type(p) is not int or type(d) is not int or not 0<=p<=9 or not p+2<=d<=26:
        raise ModelError('Homogeneous brane evolution needs at least one target-space transverse spatial direction.')
    vel=raw.get('velocity',[0.]*(d-1))
    if not isinstance(vel,list) or len(vel)!=d-1:raise ModelError('velocity has wrong dimension.')
    if any(type(x) not in (int,float) or not isfinite(x) for x in vel):raise ModelError('velocity must be finite.')
    if any(abs(x)>1e-12 for x in vel[:p]):
        raise ModelError('Only normal velocities are supported; tangential motion is gauge-dependent.')
    if sum(float(x)**2 for x in vel) >= 1:
        raise ModelError('Normal brane speed must be strictly below light speed.')
    from .covariant import _number, _integer
    duration=_number(raw,'duration',3.,0.,20.)
    nframes=_integer(raw,'frames',50,2,160)
    output=affine_dbi({**raw,'velocity':vel,'field_strength':[[0.]*(p+1) for _ in range(p+1)]})
    gamma=1/sqrt(1-sum(float(x)**2 for x in vel))
    origin=raw.get('origin',[0.]*(d-1))
    if not isinstance(origin,list) or len(origin)!=d-1 or any(type(z) not in (int,float) or not isfinite(z) for z in origin):
        raise ModelError('origin must be a finite spatial position.')
    timeline=[{'time':float(t),'origin':[(float(z)+float(v)*float(t)) for z,v in zip(origin,vel)]}
              for t in np.linspace(0,duration,nframes)]
    return {**output,'model':'homogeneous_Dp_DBI_trajectory','mass_density':float(raw.get('tension',1.)),
            'energy_density':gamma*float(raw.get('tension',1.)), 'lorentz_factor':gamma,
            'trajectory':timeline,'euler_lagrange_residual_exact':0.,
            'limitations':'Exact homogeneous flat F=0 Dp translation, not dynamical curved or spatially varying brane geometry.'}
