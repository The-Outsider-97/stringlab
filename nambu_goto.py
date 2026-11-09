"""Nonlinear Nambu--Goto static-gauge Hamiltonian string evolution.

X=(t,σ,Y^I(t,σ)) in flat Minkowski or prescribed spatially-flat exponential FRW target. Dirichlet endpoints for the
noncompact open string, or winding-one compact X¹=σ for the closed string.
The canonical momentum and stress flux follow from varying the actual
nonlinear Nambu--Goto square root, not a free-wave equation. No claims of
arbitrary gauge, arbitrary curved targets, topology change, or quantum dynamics.
"""
from __future__ import annotations
from math import pi
from typing import Any
import numpy as np
from .physics import ModelError
from .covariant import _number, _integer


def _deriv(y: np.ndarray, dx: float, closed: bool) -> np.ndarray:
    if closed:
        return (np.roll(y,-1,axis=0)-np.roll(y,1,axis=0))/(2*dx)
    return np.gradient(y,dx,axis=0,edge_order=2)


def _velocity(momentum: np.ndarray, s: np.ndarray, tension: float, electric: float, scale: float = 1.) -> np.ndarray:
    b = 1+np.sum(s*s,axis=1,keepdims=True)
    q = (momentum+np.sum(s*momentum,axis=1,keepdims=True)*s)/(tension*scale**4*b)
    m_q = b*q-np.sum(s*q,axis=1,keepdims=True)*s
    d = (scale**2*b-electric**2)/(1+scale**4*np.sum(q*m_q,axis=1,keepdims=True))
    if np.any(d<=1e-12):
        raise ModelError("Timelike Nambu–Goto / DBI induced determinant became degenerate.")
    return q*np.sqrt(d)


def _state(y: np.ndarray, p: np.ndarray, dx: float, closed: bool, tension: float, electric: float, scale: float = 1.) -> tuple[np.ndarray,np.ndarray,np.ndarray,np.ndarray]:
    s = _deriv(y,dx,closed)
    v = _velocity(p,s,tension,electric,scale)
    ss=np.sum(s*s,axis=1,keepdims=True)
    vv=np.sum(v*v,axis=1,keepdims=True)
    vs=np.sum(v*s,axis=1,keepdims=True)
    det = scale**2*((1-scale**2*vv)*(1+ss)+scale**2*vs**2)-electric**2
    if np.any(det<=1e-12):
        raise ModelError("Induced worldsheet ceased to be timelike.")
    flux=tension*scale**4*((1-scale**2*vv)*s+scale**2*vs*v)/np.sqrt(det) / scale**2
    # Include the full electric Hamiltonian when treating F01 as a dynamical
    # worldvolume field; the present background-E evolution does NOT solve
    # the gauge-field equation. For E=0 this is the physical total energy.
    energy=tension*scale**2*(1+ss)/np.sqrt(det)
    return v,flux,energy,det


def _divflux(flux:np.ndarray, dx:float, closed:bool)->np.ndarray:
    if closed:
        return (np.roll(flux,-1,axis=0)-np.roll(flux,1,axis=0))/(2*dx)
    return np.gradient(flux,dx,axis=0,edge_order=2)


def nambu_goto_series(raw:dict[str,Any])->list[dict[str,Any]]:
    if not isinstance(raw,dict):raise ModelError("Nambu–Goto configuration must be an object.")
    kind=raw.get("kind","open")
    if kind not in ("open","closed"):raise ModelError("Choose open or closed Nambu–Goto string.")
    n=_integer(raw,"points",96,32,512)
    nf=_integer(raw,"frames",80,2,160)
    duration=_number(raw,"duration",3.,.02,20.)
    amplitude=_number(raw,"amplitude",.2,0.,1.)
    alpha=_number(raw,"alpha_prime",1.,1e-6,1e6)
    # 2π α′ F01; fixed external electric field only. The gauge-field equation
    # is not evolved; do not interpret E != 0 as a complete DBI solution.
    electric=_number(raw,"electric",0.,-.8,.8)
    hubble=_number(raw,"hubble",0.,-.2,.2)
    if electric and hubble:raise ModelError("The prescribed electric DBI background supports flat target only (H=0).")
    closed=kind=="closed"
    length=2*pi if closed else pi
    dx=length/(n if closed else n-1)
    sigma=np.linspace(0,length,n,endpoint=not closed)
    y=np.zeros((n,2));y[:,0]=amplitude*(np.cos(sigma) if closed else np.sin(sigma))
    p=np.zeros_like(y)
    tension=1/(2*pi*alpha)
    nsteps=max(nf-1,int(np.ceil(duration/(.10*dx))))
    nsteps=int(np.ceil(nsteps/(nf-1)))*(nf-1)
    if nsteps>30000:raise ModelError("Nambu–Goto run exceeds the 30,000 step budget.")
    dt=duration/nsteps;stride=nsteps//(nf-1)
    energy0=None;results=[]
    for k in range(nsteps+1):
        scale=float(np.exp(hubble*k*dt))
        v,flux,energy,det=_state(y,p,dx,closed,tension,electric,scale)
        if k%stride==0:
            total=(float(np.mean(energy)*length) if closed else float(np.trapezoid(energy[:,0],dx=dx)))
            if energy0 is None:energy0=total
            pos=np.column_stack((sigma,y))
            results.append({"time":float(k*dt),"solver":"nambu_goto_static_gauge",
                "geometry":pos.round(10).tolist(),"projection":["X1","X2","X3"],
                "closed":closed,"status":"nonlinear_dbi_background_field" if electric else "nonlinear_nambu_goto",
                "projection_kind":"target_space_coordinate_projection",
                "diagnostics":{"energy":total,"relative_energy_drift":abs(total-energy0)/max(1.,abs(energy0)),
                    "minimum_timelike_determinant":float(np.min(det)),
                    "maximum_transverse_speed":float(np.max(np.linalg.norm(v,axis=1))),
                    "effective_dt":dt,"cfl":dt/dx,"electric_background":electric,"hubble":hubble,
                    "energy_conservation_expected":not bool(hubble),
                    "boundary":"compact_winding_one" if closed else "fixed_endpoint_Dirichlet",
                    "constraint_status":"nonlinear_static_gauge_no_conformal_constraint"},"samples":n,
                "model_assumptions":("Flat target" if hubble==0 else "Exponential FRW target (spatial metric e^(2Ht))") + "; static gauge X⁰=t, X¹=σ; bounded scalar deformation;" + (" prescribed F01, Maxwell equation not enforced" if electric else " F=0")})
        if k==nsteps:break
        # Kick-drift-kick staggered canonical momentum integration.
        dp0=_divflux(flux,dx,closed)
        pmid=p+.5*dt*dp0
        if not closed:pmid[[0,-1]]=0
        mid_scale=float(np.exp(hubble*(k+.5)*dt))
        vmid=_velocity(pmid,_deriv(y,dx,closed),tension,electric,mid_scale)
        ynext=y+dt*vmid
        if not closed:ynext[[0,-1]]=0
        next_scale=float(np.exp(hubble*(k+1)*dt))
        _,fluxnew,_,_=_state(ynext,pmid,dx,closed,tension,electric,next_scale)
        pnext=pmid+.5*dt*_divflux(fluxnew,dx,closed)
        if not closed:pnext[[0,-1]]=0
        y,p=ynext,pnext
        if not np.isfinite(y).all() or not np.isfinite(p).all() or np.max(np.abs(y))>1e5:
            raise ModelError("Nambu–Goto numerical trajectory diverged.")
    return results
