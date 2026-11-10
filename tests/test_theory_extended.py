import math
import pytest
from stringlab.advanced import (closed_rns_spectrum,free_boson_cft,oscillator_character,
        brst_consistency,flat_torus_geodesic,quintic_tangent_metric)
from stringlab.physics import ModelError


def test_closed_rns_nsns_ground_and_massless():
    ground=closed_rns_spectrum({'left_sector':'NS','right_sector':'NS'})
    assert ground['mass_squared']==-2.  # 4*(0-.5) / alpha'
    assert ground['state_status']=='fails_level_matching_or_NS_GSO'
    oscs=[{'field':'fermion','mode':0,'axis':1,'occupation':1}]
    massless=closed_rns_spectrum({'left':oscs,'right':oscs})
    assert massless['mass_squared']==0
    assert massless['state_status']=='allowed_in_restricted_NS_model'


def test_closed_rns_ns_r_level_matching():
    ferm=[{'field':'fermion','mode':0,'axis':1,'occupation':1}]
    a=closed_rns_spectrum({'left_sector':'NS','right_sector':'R','left':ferm})
    assert a['mass_squared']==0 and a['state_status']=='R_sector_chirality_undetermined'


def test_cft_two_point_and_neutrality():
    a=free_boson_cft({'momenta':[[1],[-1]],'positions':[[0,0],[2,0]],'alpha_prime':2.})
    assert a['charge_neutral']
    assert a['correlator_magnitude']==pytest.approx(.25)
    assert a['conformal_weights_h_hbar'][0]['h']==pytest.approx(.5)
    b=free_boson_cft({'momenta':[[1],[1]],'positions':[[0,0],[2,0]]})
    assert not b['charge_neutral'] and b['correlator_magnitude'] is None
    with pytest.raises(ModelError):free_boson_cft({'momenta':[[1],[-1]],'positions':[[0,0],[0,0]]})


def test_character_partition_counts():
    assert oscillator_character({'dimensions':1,'max_level':6})['coefficients']==[1,1,2,3,5,7,11]
    assert oscillator_character({'dimensions':2,'max_level':2})['coefficients']==[1,2,5]


def test_brst_never_claims_cohomology():
    x=brst_consistency({'dimensions':26})
    assert x['necessary_conditions_satisfied'] and x['brst_cohomology']=='not_computed'
    assert brst_consistency({'dimensions':25})['central_obstruction_coefficient']==-.5
    assert brst_consistency({'theory':'RNS','dimensions':10,'sector':'R','intercept':0})['necessary_conditions_satisfied']


def test_flat_torus_geodesic_periodic():
    x=flat_torus_geodesic({'radius':2,'start':[0]*6,'end':[4*math.pi,0,0,0,0,0],
                           'wave_numbers':[1,2,0,0,0,0]})
    assert x['geodesic_distance']==pytest.approx(0)
    assert x['laplacian_eigenvalue']==pytest.approx(1.25)


def test_quintic_local_tangent_metric():
    v=quintic_tangent_metric({})
    assert v['complex_tangent_dimension']==3
    assert v['tangent_projector_trace']==pytest.approx(3.)
    assert v['positive_tangent_metric']
    assert v['projected_metric_eigenvalues'][0]==pytest.approx(0,abs=1e-12)
    with pytest.raises(ModelError):quintic_tangent_metric({'complex_coordinates':[[1,0],[0,0],[0,0],[0,0],[0,0]]})
