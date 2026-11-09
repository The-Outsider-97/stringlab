"""Numerical and analytical checks against explicit mathematically known invariants."""
from __future__ import annotations

from copy import deepcopy
from math import pi

import numpy as np
import pytest

from stringlab.physics import (
    ModelError, template, validated, frame, transverse, sigma_grid,
    fd_series, series, sweep, convergence,
)


def test_open_default_valid_and_standing_wave():
    c = template("open")
    assert frame(c, .5)["status"] == "physical_classical"
    sig = sigma_grid(c)
    y, v, spatial = transverse(validated(c), sig, .31)
    assert np.max(np.abs(spatial[0])) < 1e-12
    assert np.max(np.abs(spatial[-1])) < .012  # endpoint is excluded? Open grid includes π, exact 0
    assert y.shape == (c["points"], c["dimensions"] - 2)


@pytest.mark.parametrize("bc", ["NN", "DD", "ND", "DN"])
def test_open_endpoints_satisfy_all_four_boundary_types(bc):
    c = template("open")
    c["bc"] = bc
    c["modes"][0]["phase"] = .7
    if bc == "DD": c["anchor_end"][0] = 1.2
    cc = validated(c)
    sig = sigma_grid(cc)
    y, vt, vs = transverse(cc, sig, .27)
    if bc[0] == "N": assert np.max(np.abs(vs[0])) < 1e-12
    else: assert np.max(np.abs(vt[0])) < 1e-12
    if bc[1] == "N": assert np.max(np.abs(vs[-1])) < 1e-12
    else: assert np.max(np.abs(vt[-1])) < 1e-12


def test_free_wave_equation_is_not_only_constraint():
    c = template("closed")
    assert frame(c, 0.25)["status"] == "physical_classical"
    c["modes"][0]["right"] = 0
    assert frame(c, 0.25)["status"] == "constraint_violating_free_field"
    assert frame(c, 0.25)["diagnostics"]["level_matching_residual"] > 1e-3


def test_periodic_boundary_closed_including_derivatives():
    c = validated(template("closed"))
    s = np.array([0., 2 * pi])
    a = transverse(c, s, .7)
    for value in a: np.testing.assert_allclose(value[0], value[1], atol=1e-12)


def test_analytical_pde_second_derivative():
    c = validated(template("open"))
    s = np.linspace(.1, pi - .1, 30)
    tau, eps = .22, 1e-4
    y, _, _ = transverse(c, s, tau)
    yp, _, _ = transverse(c, s, tau + eps)
    ym, _, _ = transverse(c, s, tau - eps)
    yss = np.zeros_like(y)
    yss[:, 1] = -(c["modes"][0]["n"] ** 2) * y[:, 1]
    np.testing.assert_allclose((yp - 2 * y + ym)/eps**2, yss, atol=2e-8)


def test_tension_scales_gauge_energy_not_wave_speed():
    a = template("open")
    b = deepcopy(a); b["alpha_prime"] = 2 * a["alpha_prime"]
    fa, fb = frame(a, .4), frame(b, .4)
    assert fa["geometry"] == fb["geometry"]
    assert fa["diagnostics"]["energy"] == pytest.approx(2 * fb["diagnostics"]["energy"])


def test_numerical_solver_is_accurate_and_convergent():
    c = template("open")
    x = fd_series(c, [.25])[0]
    assert x["diagnostics"]["rms_error_vs_analytical"] < 1e-4
    study = convergence(c, target_time=.5)
    assert study[0]["rms_error"] > study[1]["rms_error"] > study[2]["rms_error"]


def test_closed_numerical_evolution():
    c = template("closed")
    res = fd_series(c, [0., .2, .4])
    assert all(r["diagnostics"]["rms_error_vs_analytical"] < 1e-3 for r in res)
    assert res[-1]["solver"] == "finite_difference"


def test_sweep_uses_real_analytical_engine():
    c = template("open")
    res = sweep(c, .1, .5, 5)
    assert len(res) == 5
    assert res[0]["energy"] < res[-1]["energy"]
    assert res[2]["amplitude"] == pytest.approx(.3)


def test_config_invalid_data_refused():
    c = template("open")
    for prop, value in (("alpha_prime", -1), ("p_plus", 0), ("points", 100000), ("duration", float('nan'))):
        x=deepcopy(c); x[prop]=value
        with pytest.raises(ModelError): validated(x)
    x=deepcopy(c); x["projection"]=["X1","X1","X2"]
    with pytest.raises(ModelError, match="distinct"): validated(x)
    x=deepcopy(c); x["bc"]="DD"; x["zero_velocity"]=[1,0,0]
    with pytest.raises(ModelError, match="velocity"): validated(x)


def test_3d_frame_projection_is_not_full_target_space():
    c=template('open')
    f=frame(c,0)
    assert f['projection_kind']=='parameter_space_diagram'
    assert f['geometry'][0][0]==0.
    c['projection']=['X+','X-','X2']
    f=frame(c,.5)
    assert f['projection_kind']=='target_space_coordinate_projection'


def test_oversized_numerical_runs_capped():
    c=template('open');c['dt']=1e-5;c['duration']=90
    with pytest.raises(ModelError, match="steps"): fd_series(c,[80.])


def test_all_twelve_presets_use_valid_classical_configurations():
    from stringlab.presets import library
    items=library()
    assert len(items)==12
    for p in items:
        validated(p['configuration'])
        f=frame(p['configuration'],.2)
        assert f['samples'] > 0


def test_restricted_on_shell_nambu_goto_polyakov_actions_agree():
    from stringlab.physics import evaluate_actions
    a=evaluate_actions(template('open'),time_samples=12)
    assert a['relative_difference'] < 1e-10
    assert a['nambu_goto_on_shell'] <= 0
    assert a['polyakov_conformal_gauge_on_shell'] <= 0
    assert a['globally_admissible_closed_string'] is True


def test_high_mode_must_be_resolved_before_validity_claim():
    from stringlab.physics import validated, ModelError
    import pytest
    c=template('closed');c['points']=32;c['modes'][0]['n']=16
    with pytest.raises(ModelError, match='resolution'):
        validated(c)
