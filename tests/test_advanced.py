import math
import pytest
from stringlab.advanced import rns_spectrum, conformal_anomaly, calabi_yau_example
from stringlab.branes import flat_dbi
from stringlab.physics import ModelError


def test_ns_ground_state_rejected_by_gso():
    result=rns_spectrum({'sector':'NS'})
    assert result['mass_squared']==-.5
    assert result['physical_state']=='rejected_by_GSO'


def test_ns_first_fermion_massless():
    result=rns_spectrum({'sector':'NS','oscillators':[{'field':'fermion','mode':0,'axis':1,'occupation':1}]})
    assert result['mass_squared']==0
    assert result['physical_state']=='allowed_in_this_restricted_model'


def test_fermion_exclusion():
    with pytest.raises(ModelError,match='Duplicate'):
        rns_spectrum({'oscillators':[{'field':'fermion','mode':0},{'field':'fermion','mode':0}]})


def test_r_sector_refuses_full_physical_state_claim():
    assert rns_spectrum({'sector':'R'})['physical_state']=='not_fully_evaluated'


def test_cft_anomaly_and_brst_conditions():
    b=conformal_anomaly({'theory':'bosonic','dimensions':26,'m':3,'n':-3})
    assert b['total_c']==0 and b['central_extension_coefficient']==0
    r=conformal_anomaly({'theory':'RNS','dimensions':10,'m':2,'n':-2})
    assert r['critical_dimension']
    off=conformal_anomaly({'theory':'bosonic','dimensions':25,'m':2,'n':-2})
    assert off['central_extension_coefficient']==-.5
    assert off['brst_cohomology']=='not_computed'


def test_fermat_quintic_exact_smoothness_and_point_check():
    z=[[1,0],[-1,0],[0,0],[0,0],[0,0]]
    r=calabi_yau_example({'complex_coordinates':z})
    assert r['point_on_hypersurface']
    assert r['euler_characteristic_reference']==-200
    with pytest.raises(ModelError):calabi_yau_example({'complex_coordinates':[[0,0]]*5})


def test_torus_projection():
    r=calabi_yau_example({'example':'flat_torus','angles':[0.]*6})
    assert r['real_dimensions']==6 and r['circle_embeddings'][0]==[1.,0.]


def test_static_brane_zero_field_and_magnetic_field():
    r=flat_dbi({'p':2,'dimensions':10})
    assert r['lagrangian_density']==-1
    assert r['normal_dirichlet_axes']==list(range(3,10))
    f=[[0,0,0],[0,0,0.2],[0,-0.2,0]]
    r=flat_dbi({'p':2,'field_strength':f})
    assert math.isclose(r['lagrangian_density'],-math.sqrt(1+(2*math.pi*.2)**2))


def test_dbi_electric_critical_limit_and_bad_antisymmetry():
    with pytest.raises(ModelError,match='imaginary'):
        flat_dbi({'p':1,'field_strength':[[0,1],[-1,0]]})
    with pytest.raises(ModelError,match='antisymmetric'):
        flat_dbi({'p':1,'field_strength':[[0,1],[1,0]]})
