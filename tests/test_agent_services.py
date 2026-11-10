"""StringLab's agent services against the real SLAI STEM, Simulation and Animation agents (skipped without the checkout).

A skip is not evidence that an agent integration works; these must run in the SLAI release environment.
"""
from __future__ import annotations

import copy
import json
import threading
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

import pytest

pytest.importorskip("src.agents.stem_agent")
pytest.importorskip("src.agents.simulation_agent")
pytest.importorskip("src.agents.animation_agent")

from applications.tools.errors import BadRequest, DependencyMissing  # noqa: E402
from stringlab.agent_hub import Hub, clean_message  # noqa: E402
from stringlab.agents import AgentBridge  # noqa: E402
from stringlab.interop import new_string_document  # noqa: E402
from stringlab.physics import FDStepper, ModelError, frame_at, fd_series, sweep, template, validated  # noqa: E402


class DummyMemory:
    def __init__(self):
        self.data, self.messages = {}, []

    def set(self, key, value, ttl=None):
        self.data[key] = value

    def publish(self, channel, value):
        self.messages.append((channel, value))


@pytest.fixture(scope="module")
def bridge():
    return AgentBridge()


def fd(kind="open", duration=4.0):
    c = template(kind)
    c["solver"], c["duration"] = "finite_difference", duration
    return c


# --------------------------------------------------------------------------------------------------------------------------- hub
def test_status_names_the_integrated_agents_and_reports_the_rest(bridge):
    status = bridge.status()
    assert [a["key"] for a in status["agents"]] == ["stem", "simulation", "animation"]
    assert all(a["available"] for a in status["agents"])
    assert status["deterministic_core_requires_agents"] is False
    assert any("Verification" in row["label"] for row in status["not_used"])


def test_an_unavailable_agent_is_reported_not_faked():
    hub = Hub()
    hub._reasons["stem"] = "ImportError: simulated"
    assert hub.available("stem") is False
    with pytest.raises(DependencyMissing) as info:
        hub.require("stem")
    assert info.value.details["reason"] == "ImportError: simulated"
    with pytest.raises(DependencyMissing):
        AgentBridge(hub).stem_analysis(template("open"))


def test_agent_error_text_has_no_internal_bookkeeping(bridge):
    with pytest.raises(BadRequest) as info:
        bridge.convert_units({"value": 1, "from": "m", "to": "s"})
    assert "dimensionally" in info.value.message
    assert "BAS-" not in info.value.message and "severity=" not in info.value.message
    assert clean_message(ValueError("[BAS-1200] Nope severity=medium component=X")) == "Nope"


# --------------------------------------------------------------------------------------------------------------------------- SharedMemory
def test_published_diagnostics_are_bounded_and_revision_aware():
    bridge = AgentBridge()
    bridge.hub._memory = DummyMemory()
    a = bridge.publish_result(template("open"), 0., 2)
    b = bridge.publish_result(template("open"), 0., 3)
    assert a["published"] and b["published"]
    assert len(bridge.hub._memory.data) == 2 and len(bridge.hub._memory.messages) == 2
    assert a["result"]["revision"] == 2 and "geometry" not in a["result"]
    assert a["result"]["configuration_sha256"] == b["result"]["configuration_sha256"]


def test_publish_follows_the_selected_solver():
    bridge = AgentBridge()
    bridge.hub._memory = DummyMemory()
    assert bridge.publish_result(fd(), 1., 1)["result"]["solver"] == "finite_difference"


def test_a_failing_shared_memory_does_not_fail_the_calculation():
    class Broken(DummyMemory):
        def publish(self, channel, value):
            raise RuntimeError("bus down")
    bridge = AgentBridge()
    bridge.hub._memory = Broken()
    out = bridge.publish_result(template("open"), 0., 1)
    assert out["published"] is False and "bus down" in out["error"] and out["result"]["observables"]["energy"] > 0


def test_a_bad_revision_is_refused():
    with pytest.raises(ModelError):
        AgentBridge().publish_result(template("open"), 0., -1)
    with pytest.raises(ModelError):
        AgentBridge().publish_result(template("open"), 0., True)


# --------------------------------------------------------------------------------------------------------------------------- STEM
@pytest.mark.parametrize("kind", ["open", "closed"])
def test_stem_analysis_checks_pass_and_are_independent_of_the_solver(bridge, kind):
    out = bridge.stem_analysis(template(kind), 1.5)
    assert out["scales"]["dimensionless_check"]["passed"]
    assert {r["key"]: r["unit"] for r in out["scales"]["rows"]} == {"alpha_prime": "m²", "tension": "m⁻²", "string_mass": "m⁻¹"}
    assert out["quadrature"]["passed"] and out["quadrature"]["relative_difference"] < 1e-9
    assert out["wave_residual"]["passed"] and len(out["wave_residual"]["points"]) == 6
    assert out["sensitivity"]["available"] and out["sensitivity"]["combined_standard_uncertainty"] > 0


def test_stem_sensitivity_matches_the_closed_form_for_one_open_mode(bridge):
    s = bridge.stem_analysis(template("open"), 0.)["sensitivity"]
    assert s["closed_form_check"]["passed"] and s["closed_form_check"]["relative_error"] < 1e-6
    # relative uncertainties are inputs: doubling both doubles the combined uncertainty
    s2 = bridge.stem_analysis(template("open"), 0., {"amplitude": 0.02, "alpha_prime": 0.02})["sensitivity"]
    assert s2["combined_standard_uncertainty"] == pytest.approx(2 * s["combined_standard_uncertainty"], rel=1e-6)


def test_stem_analysis_says_so_when_there_is_nothing_to_vary(bridge):
    c = template("open")
    c["modes"][0]["enabled"] = False
    out = bridge.stem_analysis(c, 0.)
    assert out["sensitivity"]["available"] is False and out["quadrature"]["passed"] and out["wave_residual"]["passed"]


def test_stem_analysis_rejects_bad_input(bridge):
    with pytest.raises(ModelError):
        bridge.stem_analysis(template("open"), 99.)
    with pytest.raises(BadRequest):
        bridge.stem_analysis(template("open"), 0., {"amplitude": 5})


def test_unit_conversion_by_the_agent(bridge):
    assert bridge.convert_units({"value": 2, "from": "km", "to": "m"})["result"] == 2000.0
    with pytest.raises(BadRequest):
        bridge.convert_units({"value": "x", "from": "km", "to": "m"})
    with pytest.raises(BadRequest):
        bridge.convert_units({"value": 1, "from": "parsec-ish", "to": "m"})


# --------------------------------------------------------------------------------------------------------------------------- Simulation Agent
@pytest.mark.parametrize("kind", ["open", "closed"])
def test_rollout_is_bit_identical_to_the_direct_solver(bridge, kind):
    out = bridge.simulate({"configuration": fd(kind), "frames": 24, "revision": 5})
    assert len(out["frames"]) == 24
    assert out["verification"]["rollout_matches_direct_solver"] and out["verification"]["max_abs_difference"] == 0.0
    assert out["provenance"]["deterministic"] and out["provenance"]["seed"] == 0 and out["provenance"]["run_id"].startswith("sim-")
    assert out["provenance"]["transitions"] == 23
    assert out["verification"]["max_rms_error_vs_analytical"] < 1e-3
    assert all(f["status"] == "numerical_approximation_not_certified" for f in out["frames"])


def test_rollout_frames_equal_the_in_process_series_at_the_same_steps(bridge):
    c = fd("open")
    out = bridge.simulate({"configuration": c, "frames": 10})
    stepper = FDStepper(c)
    step = round(out["frames"][4]["time"] / stepper.dt)
    reference = fd_series(c, [step * stepper.dt])[0]
    assert out["frames"][4]["geometry"] == reference["geometry"]


def test_rollout_is_repeatable(bridge):
    a = bridge.simulate({"configuration": fd(), "frames": 8})
    b = bridge.simulate({"configuration": fd(), "frames": 8})
    assert a["frames"][-1]["geometry"] == b["frames"][-1]["geometry"]
    assert a["provenance"]["run_id"] != b["provenance"]["run_id"]


def test_rollout_limits_are_explained(bridge):
    big = fd()
    big["points"] = 1024
    with pytest.raises(BadRequest) as info:
        bridge.simulate({"configuration": big, "frames": 10})
    assert "512" in info.value.message
    long = fd()
    long["dt"], long["duration"] = 1e-4, 100.
    with pytest.raises(BadRequest):
        bridge.simulate({"configuration": long, "frames": 240})
    with pytest.raises(BadRequest):
        bridge.simulate({"configuration": fd(), "frames": 1})


# --------------------------------------------------------------------------------------------------------------------------- Animation Agent
@pytest.mark.parametrize("solver", ["analytical", "finite_difference"])
def test_animation_tracks_are_agent_evaluated_and_close_to_the_solver(bridge, solver):
    c = template("closed")
    c["solver"], c["duration"] = solver, 5.0
    out = bridge.animate({"configuration": c, "beads": 4, "keyframes": 60})
    assert out["agent"] == "SLAI Animation Agent" and out["schema_key"] == "slai.animation.v1"
    assert len(out["beads"]) == 4 and all(len(b["positions"]) == 60 for b in out["beads"])
    assert out["verification"]["passed"] and out["verification"]["relative_to_extent"] < 0.02
    assert out["times"][0] == 0.0 and out["times"][-1] == pytest.approx(5.0)


def test_sparser_keyframes_make_the_interpolation_error_visible(bridge):
    c = template("closed")
    dense = bridge.animate({"configuration": c, "beads": 3, "keyframes": 120})["verification"]["max_distance"]
    sparse = bridge.animate({"configuration": c, "beads": 3, "keyframes": 12})["verification"]["max_distance"]
    assert sparse > 10 * dense


def test_animated_sgeo_is_a_valid_native_package_with_the_agents_tracks(bridge):
    sgeo = pytest.importorskip("src.utils.sgeo")
    data = bridge.animated_sgeo({"configuration": template("open"), "beads": 3, "keyframes": 30})
    doc = sgeo.SGEODocument.from_bytes(data, mode="read")
    doc.validate(mode="strict", raise_on_error=True)
    spec = doc._model.metadata["slai.animation.v1"]
    assert len(spec["tracks"]) == 3 and all(t["property"] == "translation" and len(t["keyframes"]) == 30 for t in spec["tracks"])
    assert spec["duration"] == template("open")["duration"]


def test_animation_request_limits(bridge):
    for body in ({"beads": 0}, {"beads": 10}, {"keyframes": 4}, {"keyframes": 500}):
        with pytest.raises(BadRequest):
            bridge.animate({"configuration": template("open"), **body})


# --------------------------------------------------------------------------------------------------------------------------- solver consistency
def test_exports_use_the_selected_solver():
    c = fd()
    _, _, f = new_string_document(validated(c), 1.0)
    assert f["solver"] == "finite_difference"
    _, _, g = new_string_document(validated(template("open")), 1.0)
    assert g["solver"] == "analytical"


def test_frame_at_dispatches_and_tolerates_a_solver_step_that_overshoots_the_end():
    c = fd(duration=3.0)
    assert frame_at(c, 1.0)["solver"] == "finite_difference"
    end = fd_series(c, [3.0])[0]
    assert end["requested_time"] == 3.0
    assert frame_at(c, end["time"] + 1e-12)["time"] > 0           # a time a rounding error past the end is accepted ...
    with pytest.raises(ModelError):
        frame_at(c, 3.5)                                             # ... a real overshoot is not


def test_sweep_varies_the_first_enabled_mode():
    c = template("open")
    c["modes"] = [{"n": 2, "axis": 1, "amplitude": 0.0, "phase": 0.0, "enabled": False}, {"n": 1, "axis": 2, "amplitude": 0.4, "phase": 0.0, "enabled": True}]
    out = sweep(c, 0.1, 0.5, 3)
    assert out[0]["energy"] < out[-1]["energy"]
    c["modes"][1]["enabled"] = False
    with pytest.raises(ModelError):
        sweep(c, 0.1, 0.5, 3)


# --------------------------------------------------------------------------------------------------------------------------- server
@pytest.fixture()
def live(tmp_path):
    server_mod = pytest.importorskip("applications.tools.server")
    from applications.tools.storage import Prefs
    from stringlab.app import PREF_SCHEMA, StringLabApp, load_settings
    from stringlab.routes import build_router
    from stringlab.store import ExperimentStore

    app = StringLabApp(load_settings(data_dir=str(tmp_path)), ExperimentStore(tmp_path / "e"), Prefs(tmp_path / "prefs.json", PREF_SCHEMA), None,
                       pdf=False, sldc=False)
    options = server_mod.ServerOptions(token="t0ken", client_dir=Path(__file__).resolve().parents[1] / "dist", host="127.0.0.1", port=0,
                                      tools_web_dir=Path(__file__).resolve().parents[2] / "tools" / "web")
    server = server_mod.LocalServer(app, server_mod.Identity("stringlab", "StringLab"), build_router(), options)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
    opener.open(f"{server.base_url}/?token=t0ken", timeout=5).read()

    def call(path, body=None, method=None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(server.base_url + path, data=data, method=method or ("GET" if body is None else "POST"),
                                     headers={"Content-Type": "application/json", "X-SLAI-Stringlab": "1"})
        try:
            with opener.open(req, timeout=60) as response:
                raw = response.read()
                return response.status, (json.loads(raw) if "json" in response.headers.get("Content-Type", "") else raw)
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    yield call
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)


def test_agent_routes_end_to_end(live):
    status, body = live("/api/agents/status")
    assert status == 200 and [a["available"] for a in body["data"]["agents"]] == [True, True, True]
    c = template("open")
    status, body = live("/api/agents/stem", {"configuration": c, "time": 0.5})
    assert status == 200 and body["data"]["quadrature"]["passed"]
    status, body = live("/api/agents/convert", {"value": 3, "from": "m", "to": "cm"})
    assert status == 200 and body["data"]["result"] == pytest.approx(300.0)
    status, body = live("/api/agents/convert", {"value": 3, "from": "m", "to": "s"})
    assert status == 400 and body["error"]["code"] == "bad_request" and "severity" not in body["error"]["message"]
    status, body = live("/api/agents/simulate", {"configuration": fd(), "frames": 6})
    assert status == 200 and body["data"]["verification"]["rollout_matches_direct_solver"]
    status, body = live("/api/agents/animate", {"configuration": c, "beads": 2, "keyframes": 20})
    assert status == 200 and body["data"]["verification"]["passed"]
    status, raw = live("/api/export/sgeo-animated", {"configuration": c, "beads": 2, "keyframes": 20})
    assert status == 200 and raw.startswith(b"PK")
    status, body = live("/api/agents/publish", {"configuration": c, "time": 0, "revision": 1})
    assert status == 200 and body["data"]["result"]["revision"] == 1
    status, body = live("/api/agents/run", {"agent": "stem"})
    assert status == 404


def test_preferences_are_validated_and_persisted(live):
    status, body = live("/api/prefs", {"theme": "dark", "speed": 2.0, "trail": 10}, method="PATCH")
    assert status == 200 and body["data"]["theme"] == "dark" and body["data"]["speed"] == 2.0
    status, body = live("/api/prefs")
    assert body["data"]["trail"] == 10 and body["data"]["loop"] is True
    for bad in ({"theme": "neon"}, {"speed": 3.0}, {"trail": -1}, {"nonsense": 1}, {"loop": "yes"}):
        status, body = live("/api/prefs", bad, method="PATCH")
        assert status == 400, bad


def test_frame_route_follows_the_solver_and_accepts_the_end_of_the_run(live):
    c = fd(duration=3.0)
    status, body = live("/api/frame", {"configuration": c, "time": 3.0})
    assert status == 200 and body["data"]["solver"] == "finite_difference"
    status, body = live("/api/frame", {"configuration": copy.deepcopy(c), "time": 3.5})
    assert status == 400
