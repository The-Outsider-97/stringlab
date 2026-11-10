from __future__ import annotations

from copy import deepcopy

import pytest

from stringlab.physics import ModelError
from stringlab.quantum import spectrum, t_dual, quantum_template, occupation_level


def test_quantum_fock_level_weighting():
    assert occupation_level([{"mode":1,"axis":1,"occupation":2}, {"mode":3,"axis":4,"occupation":4}]) == 14


def test_open_bosonic_mass_spectrum():
    c={"kind":"open","dimensions":26,"theory":"critical_bosonic","alpha_prime":2.,
       "left":[{"mode":1,"axis":1,"occupation":1}],"compact":False}
    assert spectrum(c)['mass_squared'] == 0
    c['left'][0]['occupation'] = 0
    assert spectrum(c)['mass_squared'] == pytest.approx(-.5)
    assert spectrum(c)['tachyonic'] is True


def test_closed_bosonic_mass_formula_and_matching():
    c=quantum_template();c['compact']=False
    assert spectrum(c)['mass_squared'] == 0
    c['right'][0]['occupation'] = 2
    assert spectrum(c)['level_matching'] is False
    assert spectrum(c)['physical_state'] == 'level_matching_failed'


@pytest.mark.parametrize('n,w,rad,a', [(0,0,1,1),(1,0,2,1),(3,-1,.5,1.5),(-2,-3,3,.75)])
def test_t_duality_invariance(n,w,rad,a):
    c=quantum_template();c.update(momentum=n,winding=w,radius=rad,alpha_prime=a)
    result=t_dual(c)
    assert result['mass_squared_relative_error'] < 1e-11
    assert result['p_left_error'] < 1e-11
    assert result['p_right_reflection_error'] < 1e-11
    assert result['level_matching_preserved']


def test_level_matching_includes_momentum_winding():
    c=quantum_template();c.update(momentum=1,winding=1)
    c['left'][0]['occupation']=0;c['right'][0]['occupation']=1
    assert spectrum(c)['level_matching'] is True
    assert spectrum(c)['physical_state'] == 'valid_in_this_light_cone_fock_model'


def test_noncritical_dimensions_not_evaluated():
    c=quantum_template();c['dimensions']=10
    assert spectrum(c)['physical_state']=='not_evaluated_noncritical_dimension'


def test_invalid_quantum_parameters_refused():
    c=quantum_template()
    c['radius']=-.1
    with pytest.raises(ModelError): spectrum(c)
    c=quantum_template();c['kind']='open'
    with pytest.raises(ModelError): spectrum(c)
    c=quantum_template();c['left'][0]['occupation']=.5
    with pytest.raises(ModelError): spectrum(c)
