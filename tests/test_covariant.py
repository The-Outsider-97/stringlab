import math
import numpy as np
import pytest

from stringlab.covariant import polyakov_series
from stringlab.nambu_goto import nambu_goto_series, _state, _velocity
from stringlab.branes import affine_dbi, brane_trajectory
from stringlab.physics import ModelError


def test_polyakov_exact_closed_circle_constraint_convergence():
    low=polyakov_series({'kind':'closed','frames':12,'points':64,'duration':1.})
    hi=polyakov_series({'kind':'closed','frames':12,'points':128,'duration':1.})
    assert len(hi)==12
    assert max(f['diagnostics']['constraint_tautau_rms'] for f in hi) < .003
    assert hi[0]['diagnostics']['constraint_tautau_rms'] < low[0]['diagnostics']['constraint_tautau_rms']
    assert hi[0]['closed']
    assert hi[0]['geometry'][0][0] == pytest.approx(1.)


def test_polyakov_open_rod_and_curved_frw_numerical():
    open_run=polyakov_series({'kind':'open','frames':10,'points':64,'duration':1.})
    assert open_run[0]['diagnostics']['constraint_tausigma_rms'] < 1e-8
    assert open_run[-1]['diagnostics']['constraint_tautau_rms'] < .003
    curved=polyakov_series({'kind':'closed','hubble':.04,'frames':10,'points':64,'duration':1.})
    flat=polyakov_series({'kind':'closed','frames':10,'points':64,'duration':1.})
    assert curved[-1]['diagnostics']['curvature_hubble'] == .04
    assert not np.allclose(curved[-1]['geometry'],flat[-1]['geometry'])


def test_nambu_goto_flat_zero_amplitude_is_static():
    run=nambu_goto_series({'amplitude':0.,'duration':1.,'points':64,'frames':12})
    assert max(f['diagnostics']['relative_energy_drift'] for f in run)<1e-10
    assert run[0]['geometry']==run[-1]['geometry']
    assert run[-1]['diagnostics']['minimum_timelike_determinant']==pytest.approx(1.)


def test_nambu_goto_nonlinear_energy_and_boundary():
    run=nambu_goto_series({'amplitude':.35,'duration':2.,'points':64,'frames':20})
    assert run[-1]['diagnostics']['relative_energy_drift']<.001
    assert run[0]['geometry'][32][1]!=run[10]['geometry'][32][1]
    for frame in run:
        assert frame['geometry'][0][1]==0.
        assert frame['geometry'][-1][1]==0.
        assert frame['diagnostics']['minimum_timelike_determinant']>0.


def test_nambu_closed_winding_and_electric_background():
    run=nambu_goto_series({'kind':'closed','amplitude':.2,'electric':.1,'duration':.5,'frames':6})
    assert run[-1]['status']=='nonlinear_dbi_background_field'
    assert run[-1]['diagnostics']['minimum_timelike_determinant']>0


def test_canonical_momentum_inverse():
    s=np.array([[.3,-.2]]);v=np.array([[.2,.1]]);T=.8;D=(1-np.sum(v*v,1))*(1+np.sum(s*s,1))+np.sum(v*s,1)**2
    p=T*((1+np.sum(s*s,1,keepdims=True))*v-np.sum(v*s,1,keepdims=True)*s)/np.sqrt(D[:,None])
    assert np.allclose(_velocity(p,s,T,0),v)


def test_affine_dbi_induced_worldvolume_and_motion():
    data=affine_dbi({'p':2,'dimensions':6,'velocity':[0,0,.3,0,0]})
    assert data['induced_metric'][0][0]==pytest.approx(-.91)
    assert data['lagrangian_density']==pytest.approx(-math.sqrt(.91))
    traj=brane_trajectory({'p':2,'dimensions':6,'velocity':[0,0,.3,0,0],'duration':2.,'frames':5})
    assert traj['euler_lagrange_residual_exact']==0
    assert traj['trajectory'][-1]['origin'][2]==pytest.approx(.6)


def test_affine_dbi_rejects_nonphysical_inputs():
    with pytest.raises(ModelError):affine_dbi({'p':2,'dimensions':4,'tangents':[[0,0,0],[0,0,0]]})
    with pytest.raises(ModelError):affine_dbi({'p':1,'dimensions':4,'velocity':[0,1.1,0]})
    with pytest.raises(ModelError):brane_trajectory({'p':2,'dimensions':5,'velocity':[.1,0,0,0]})


def test_frw_canonical_momentum_map_inversion():
    """Induced FRW determinant must be used in the Legendre inversion."""
    slope=np.array([[.30,-.20],[.10,.45]],dtype=float)
    velocity=np.array([[.12,.08],[-.21,.04]],dtype=float)
    tension=.8
    a=1.27
    b=1+np.sum(slope*slope,axis=1,keepdims=True)
    v2=np.sum(velocity*velocity,axis=1,keepdims=True)
    sv=np.sum(slope*velocity,axis=1,keepdims=True)
    determinant=a*a*((1-a*a*v2)*b+a*a*sv*sv)
    momentum=tension*a**4*(b*velocity-sv*slope)/np.sqrt(determinant)
    assert np.allclose(_velocity(momentum,slope,tension,0,a),velocity,rtol=1e-13,atol=1e-14)


def test_ng_curved_frw_energy_is_not_claimed_conserved():
    frames=nambu_goto_series({'hubble':.06,'duration':1.,'frames':10,'points':64,'amplitude':0.})
    assert frames[-1]['diagnostics']['energy_conservation_expected'] is False
    assert frames[-1]['diagnostics']['energy']>frames[0]['diagnostics']['energy']
    assert frames[-1]['diagnostics']['minimum_timelike_determinant']>0
