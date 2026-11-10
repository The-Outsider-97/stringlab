"""StringLab's services built on SLAI agents (STEM, Simulation, Animation) and SharedMemory.

The deterministic physics never needs an agent. Each service here asks an agent for something StringLab does not implement itself and
then *checks* the answer against StringLab's own solver, reporting the check; nothing an agent says is taken on trust:

* **STEM Agent** (unit-aware evaluator, numerical methods, uncertainty): the string's scales with units and a dimension check, an
  independent Simpson quadrature of the energy, the wave-equation residual by the agent's central differences, and the sensitivity of
  the energy to its inputs with the propagated uncertainty.
* **Simulation Agent** (``rollout``): the finite-difference solver (``physics.FDStepper``, the only implementation) advanced as a
  rollout with a seed, run id, lineage and termination reason, verified bit-for-bit against the same solver run directly.
* **Animation Agent** (native SGEO animation): material points riding on the string as ``slai.animation.v1`` translation tracks, evaluated
  by the agent and compared with the solver; the same scene is the animated ``.sgeo`` export.

Which agents exist, load and are used is ``agent_hub``'s business.
"""
from __future__ import annotations

import hashlib
import json
import math
from typing import Any, Mapping

import numpy as np

from applications.tools.errors import BadRequest
from applications.tools.validation import integer, number, text

from .agent_hub import Hub, translate
from .interop import new_string_document, _sgeo
from .physics import FDStepper, MAX_STEPS, ModelError, _time, fd_series, frame, frame_at, series, transverse, validated

MAX_SIM_POINTS = 512
RESULT_TTL = 1800


def _digest(c: dict) -> str:
    return hashlib.sha256(json.dumps(c, sort_keys=True, allow_nan=False).encode()).hexdigest()


def _revision(value: Any) -> int:
    if type(value) is not int or not 0 <= value < 2**31:
        raise ModelError("Agent request revision must be a nonnegative integer.")
    return value


_BASE_SYMBOLS = {"L": "m", "M": "kg", "T": "s", "I": "A", "Θ": "K", "N": "mol", "J": "cd"}
_SUPERSCRIPT = str.maketrans("-0123456789.", "⁻⁰¹²³⁴⁵⁶⁷⁸⁹·")


def _unit_text(dimension: Mapping[str, float], symbol: str) -> str:
    """The unit written from its dimension exponents (m⁻², kg·m …); the agent's own symbol when it uses a base this does not know."""
    parts = []
    for key, exponent in dimension.items():
        if key not in _BASE_SYMBOLS:
            return symbol or "1"
        if exponent:
            number_ = f"{exponent:g}"
            parts.append(_BASE_SYMBOLS[key] + ("" if exponent == 1 else number_.translate(_SUPERSCRIPT)))
    return "·".join(parts) or "1"


def _quantity(item: Mapping[str, Any]) -> dict[str, Any]:
    """A STEM quantity as plain JSON: its magnitude, unit text and dimension exponents."""
    unit = item.get("unit") or {}
    dimension = {k: float(v) for k, v in (unit.get("dimension") or {}).items()}
    return {"magnitude": float(item["magnitude"]), "unit": _unit_text(dimension, unit.get("symbol") or "1"), "dimension": dimension}


class AgentBridge:
    def __init__(self, hub: Hub | None = None) -> None:
        self.hub = hub or Hub()
        self._error: str | None = None

    # ------------------------------------------------------------------------------------------------------------------ status
    def status(self) -> dict[str, Any]:
        out = self.hub.status()
        out["last_error"] = self._error
        out["connected"] = any(a["available"] for a in out["agents"])
        return out

    # ------------------------------------------------------------------------------------------------------------------ SharedMemory
    def _publish(self, topic: str, key: str, data: dict[str, Any]) -> tuple[bool, str | None]:
        """Best-effort publication of a bounded record (no geometry arrays). A SharedMemory failure never fails the calculation."""
        try:
            memory = self.hub.memory()
            memory.set(key, data, ttl=RESULT_TTL)
            memory.publish(topic, data)
            self._error = None
            return True, None
        except Exception as exc:
            self._error = f"SLAI SharedMemory unavailable: {type(exc).__name__}: {exc}"
            return False, self._error

    def publish_result(self, configuration: dict, time: float, revision: int) -> dict[str, Any]:
        """Publish bounded verified solver diagnostics by revision. Consumers check revision and configuration digest before using
        a record, so a stale one is never mistaken for current."""
        revision = _revision(revision)
        c = validated(configuration)
        f = frame_at(c, time)
        data = {"schema": 1, "application": "stringlab", "revision": revision, "configuration_sha256": _digest(c), "model": c["theory"],
                "solver": f["solver"], "time": f["time"], "status": f["status"],
                "observables": {key: f["diagnostics"].get(key) for key in ("energy", "level_matching_residual", "constraint_status", "boundary_status")}}
        ok, error = self._publish("stringlab.simulation.results", f"stringlab:results:{data['configuration_sha256']}:{revision}", data)
        return {"published": ok, "result": data, **({"error": error} if error else {})}

    # ------------------------------------------------------------------------------------------------------------------ STEM
    def convert_units(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        """A unit conversion by the STEM Agent. Incompatible dimensions are rejected by the agent with its own message."""
        value = number(payload.get("value"), "value", -1e300, 1e300)
        source = text(payload.get("from"), "from", 40)
        target = text(payload.get("to"), "to", 40)
        result = self.hub.stem("units", "convert", [value, source, target])
        return {"agent": "SLAI STEM Agent", "value": value, "from": source, "to": target, "result": float(result)}

    def stem_analysis(self, configuration: dict, time: float = 0., uncertainty: Mapping[str, Any] | None = None) -> dict[str, Any]:
        """Four checks of one configuration by the STEM Agent. See the module docstring."""
        c = validated(configuration)
        tau = _time(time, c["duration"])
        self.hub.require("stem")
        uncertainty = dict(uncertainty or {})
        u_amp = number(uncertainty.get("amplitude", 0.01), "amplitude uncertainty", 0., 0.5)
        u_alpha = number(uncertainty.get("alpha_prime", 0.01), "alpha_prime uncertainty", 0., 0.5)
        solver_energy = float(frame_at({**c, "solver": "analytical"}, tau)["diagnostics"]["energy"])
        return {"schema": 1, "agent": "SLAI STEM Agent", "time": tau, "configuration_sha256": _digest(c),
                "scales": self._scales(c),
                "quadrature": self._quadrature(c, tau, solver_energy),
                "wave_residual": self._wave_residual(c),
                "sensitivity": self._sensitivity(c, tau, solver_energy, u_amp, u_alpha),
                "note": "Every number below was computed by the STEM Agent and compared with StringLab's own solver; "
                        "model lengths are read as metres (the SGEO export convention) and ħ = c = 1."}

    def _scales(self, c: dict) -> dict[str, Any]:
        out = self.hub.stem("parametric", "evaluate_serializable", [
            {"alpha_prime": "ls**2", "tension": "1/(2*pi*alpha_prime)", "string_mass": "1/ls", "closure": "2*pi*tension*alpha_prime"},
            {"ls": {"value": math.sqrt(c["alpha_prime"]), "unit": "m"}}])
        rows = [{"key": key, "label": label, **_quantity(out[key])} for key, label in
                (("alpha_prime", "Regge slope α′"), ("tension", "Tension T = 1/(2πα′)"), ("string_mass", "String mass scale 1/ℓs"))]
        closure = _quantity(out["closure"])
        passed = abs(closure["magnitude"] - 1.0) < 1e-12 and not any(closure["dimension"].values())
        return {"inputs": {"string_length_m": math.sqrt(c["alpha_prime"])}, "rows": rows,
                "dimensionless_check": {"expression": "2π · T · α′", "value": closure["magnitude"], "dimension": closure["dimension"], "passed": bool(passed)}}

    def _quadrature(self, c: dict, tau: float, solver_energy: float) -> dict[str, Any]:
        tension = 1 / (2 * math.pi * c["alpha_prime"])
        upper = math.pi if c["kind"] == "open" else 2 * math.pi
        highest = max((m["n"] for m in c["modes"] if m["enabled"]), default=1)
        n = max(400, 80 * highest) // 2 * 2

        def density(sigma: float) -> float:
            _, vt, vs = transverse(c, np.array([float(sigma)]), tau)
            return float(.5 * tension * np.sum(vt ** 2 + vs ** 2))

        energy = float(self.hub.stem("numerical_methods", "simpson", [density, 0., upper], {"n": n}))
        scale = max(abs(solver_energy), 1e-300)
        relative = abs(energy - solver_energy) / scale if solver_energy else abs(energy)
        return {"method": "Simpson quadrature of ½T(|Ẏ|²+|Y′|²) over σ", "intervals": n, "agent_energy": energy, "solver_energy": solver_energy,
                "relative_difference": relative, "tolerance": 1e-6, "passed": bool(relative < 1e-6)}

    def _wave_residual(self, c: dict) -> dict[str, Any]:
        """Ÿ − Y″ at fixed sample points from the analytical first derivatives, differentiated by the agent's central differences."""
        enabled = [m for m in c["modes"] if m["enabled"]]
        if not enabled:
            return {"method": "central differences", "points": [], "max_abs": 0., "relative": 0., "passed": True, "note": "No enabled modes: Y is static."}
        axis = max(enabled, key=lambda m: abs(m.get("amplitude", m.get("left", 0.))) + abs(m.get("right", 0.)))["axis"] - 1
        upper = math.pi if c["kind"] == "open" else 2 * math.pi
        golden = (math.sqrt(5) - 1) / 2

        def vt_at(tau: float, sigma: float) -> float:
            return float(transverse(c, np.array([sigma]), tau)[1][0, axis])

        def vs_at(tau: float, sigma: float) -> float:
            return float(transverse(c, np.array([sigma]), tau)[2][0, axis])

        points = []
        for k in range(1, 7):
            sigma = upper * ((k * golden) % 1.0) * 0.9 + 0.05 * upper
            tau = 0.15 + ((k * golden * 2.3) % 1.0) * max(c["duration"] - 0.3, 0.05)
            d_tt = float(self.hub.stem("numerical_methods", "central_difference", [lambda t, s=sigma: vt_at(t, s), tau]))
            d_ss = float(self.hub.stem("numerical_methods", "central_difference", [lambda s, t=tau: vs_at(t, s), sigma]))
            points.append({"sigma": sigma, "tau": tau, "y_tt": d_tt, "y_ss": d_ss, "residual": d_tt - d_ss})
        peak = max(max(abs(p["y_tt"]), abs(p["y_ss"])) for p in points) or 1.
        worst = max(abs(p["residual"]) for p in points)
        return {"method": "Ÿ − Y″ with both second derivatives by STEM central differences of the analytical first derivatives",
                "axis": axis + 1, "points": points, "max_abs": worst, "relative": worst / peak, "tolerance": 1e-5, "passed": bool(worst / peak < 1e-5)}

    def _sensitivity(self, c: dict, tau: float, solver_energy: float, u_amp: float, u_alpha: float) -> dict[str, Any]:
        enabled = [i for i, m in enumerate(c["modes"]) if m["enabled"]]
        if not enabled:
            return {"available": False, "note": "No enabled mode, so the energy does not depend on an amplitude."}
        index = enabled[0]
        key = "amplitude" if c["kind"] == "open" else "left"
        amplitude = float(c["modes"][index][key])
        if abs(amplitude) < 1e-12:
            return {"available": False, "note": "The first enabled mode has zero amplitude."}

        def energy(a: float, alpha: float) -> float:
            x = json.loads(json.dumps(c))
            x["modes"][index][key] = float(a)
            x["alpha_prime"] = float(alpha)
            x["solver"] = "analytical"
            return float(frame_at(x, tau)["diagnostics"]["energy"])

        point = [amplitude, c["alpha_prime"]]
        gradient = [float(v) for v in self.hub.stem("uncertainty", "sensitivity_coefficients", [energy, point])]
        sigma = [abs(amplitude) * u_amp, c["alpha_prime"] * u_alpha]
        combined = float(self.hub.stem("uncertainty", "jacobian_propagation", [gradient, sigma]))
        single = len(enabled) == 1 and c["kind"] == "open" and not any(abs(v) > 0 for v in c["zero_velocity"])
        out: dict[str, Any] = {
            "available": True, "energy": solver_energy, "varied_mode": index + 1, "inputs": [
                {"name": key, "value": amplitude, "relative_uncertainty": u_amp, "d_energy": gradient[0]},
                {"name": "alpha_prime", "value": c["alpha_prime"], "relative_uncertainty": u_alpha, "d_energy": gradient[1]}],
            "combined_standard_uncertainty": combined,
            "relative_combined": combined / abs(solver_energy) if solver_energy else None}
        if single:
            expected = [2 * solver_energy / amplitude, -solver_energy / c["alpha_prime"]]
            error = max(abs(g - e) / max(abs(e), 1e-300) for g, e in zip(gradient, expected))
            out["closed_form_check"] = {"law": "E ∝ A²/α′ for one open-string mode", "expected": expected, "relative_error": error, "passed": bool(error < 1e-5)}
        return out

    # ------------------------------------------------------------------------------------------------------------------ Simulation Agent
    def simulate(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        """Run the finite-difference solver as a Simulation Agent rollout and verify it against the same solver run directly."""
        if not isinstance(payload, Mapping):
            raise ModelError("The simulation request must be an object.")
        c = validated(payload.get("configuration"))
        if c["points"] > MAX_SIM_POINTS:
            raise BadRequest(f"Agent rollouts keep every state, so they are limited to {MAX_SIM_POINTS} spatial points (this experiment has {c['points']}).",
                             hint="Lower the number of points, or use the in-process finite-difference solver.")
        frames = integer(payload.get("frames", 60), "frames", 2, 240)
        revision = _revision(payload.get("revision", 0))
        stepper = FDStepper(c)
        substeps = max(1, round(c["duration"] / (frames - 1) / stepper.dt))
        total = substeps * (frames - 1)
        if total > MAX_STEPS:
            raise BadRequest(f"The run needs {total} solver steps; the limit is {MAX_STEPS}.", hint="Shorten the duration, raise dt or use fewer frames.")
        sim_dt = substeps * stepper.dt
        previous0, current0 = stepper.start()
        axes = [i for i in range(current0.shape[1]) if np.any(np.abs(current0[:, i]) > 0) or np.any(np.abs(previous0[:, i]) > 0)] or [0]
        width = current0.shape[1]

        def pack(a: np.ndarray) -> list[list[float]]:
            return a[:, axes].tolist()

        def unpack(rows: list[list[float]]) -> np.ndarray:
            full = np.zeros((len(rows), width))
            full[:, axes] = np.asarray(rows, dtype=float)
            return full

        def transition(state: Mapping[str, Any], action: Any, **_: Any) -> dict[str, Any]:
            before, now = stepper.advance(unpack(state["previous"]), unpack(state["current"]), int(action))
            return {"previous": pack(before), "current": pack(now)}

        from src.agents.simulation.simulation_models import CallableSimulationModel
        model = CallableSimulationModel(transition, model_id="stringlab.fd-leapfrog", version="1", stochastic=False,
                                        metadata={"scheme": "second-order central-difference leapfrog", "cfl": stepper.dt / stepper.dx})
        digest = _digest(c)
        run = self.hub.task("simulation", {
            "operation": "rollout", "model": model, "initial_state": {"previous": pack(previous0), "current": pack(current0)},
            "actions": [substeps] * (frames - 1), "time_step": sim_dt, "mode": "deterministic", "seed": 0,
            "parameters": {"points": c["points"], "dt": stepper.dt, "substeps": substeps},
            "metadata": {"application": "stringlab", "configuration_sha256": digest, "revision": revision}})
        steps = run["trajectory"]["steps"]
        if len(steps) != frames:
            raise BadRequest(f"The Simulation Agent returned {len(steps)} states for {frames} frames ({run.get('termination_reason')}).")
        out_frames, energies = [], []
        for k, item in enumerate(steps):
            f = stepper.observe(k * substeps, unpack(item["state"]["previous"]), unpack(item["state"]["current"]))
            f["requested_time"] = float(item["simulation_time"])
            out_frames.append(f)
            energies.append(f["diagnostics"]["energy"])
        # Verification: the same solver run directly, without the agent, must give the identical final state.
        direct_previous, direct_current = stepper.advance(*stepper.start(), total)
        final = unpack(steps[-1]["state"]["current"])
        difference = float(np.max(np.abs(final - direct_current)))
        e0 = energies[0] or 1.
        verification = {
            "rollout_matches_direct_solver": bool(difference == 0.0), "max_abs_difference": difference,
            "max_rms_error_vs_analytical": max(f["diagnostics"]["rms_error_vs_analytical"] for f in out_frames),
            "relative_energy_drift": (max(energies) - min(energies)) / abs(e0), "cfl": stepper.dt / stepper.dx}
        runtime = run.get("runtime") or {}
        provenance = {"executor": "SLAI Simulation Agent (rollout)", "run_id": run.get("run_id"), "seed": run.get("seed"),
                      "deterministic": runtime.get("deterministic"), "termination": run.get("termination_reason"),
                      "transitions": runtime.get("transition_count"), "model": "stringlab.fd-leapfrog v1",
                      "configuration_sha256": digest, "solver_steps": total, "steps_per_frame": substeps, "dt": stepper.dt,
                      "state_axes": [a + 1 for a in axes], "warnings": list(run.get("warnings") or [])}
        summary = {"schema": 1, "application": "stringlab", "kind": "simulation", "revision": revision, "configuration_sha256": digest,
                   "run_id": run.get("run_id"), "frames": frames, "verification": verification}
        published, error = self._publish("stringlab.simulation.runs", f"stringlab:run:{digest}:{revision}", summary)
        return {"schema": 1, "frames": out_frames, "provenance": provenance, "verification": verification,
                "published": published, **({"publish_error": error} if error else {}),
                "note": "Finite-difference approximation of the transverse wave equation; the status of every frame stays numerical_approximation_not_certified."}

    # ------------------------------------------------------------------------------------------------------------------ Animation Agent
    def _animated_scene(self, configuration: dict, beads: int, keyframes: int, worldsheet: bool = False):
        c = validated(configuration)
        beads = integer(beads, "beads", 1, 9)
        keyframes = integer(keyframes, "keyframes", 8, 240)
        doc, head, first = new_string_document(c, 0., name="StringLab animated material points", worldsheet=worldsheet)
        sampled = series(c, keyframes)
        rows = len(first["geometry"])
        picks = [int(round(k * (rows - 1) / (beads - 1))) if beads > 1 else rows // 2 for k in range(beads)] if c["kind"] == "open" \
            else [int(round(k * rows / beads)) % rows for k in range(beads)]
        times = [float(f.get("requested_time", f["time"])) for f in sampled]
        tracks, ids, base = [], [], []
        for k, row in enumerate(picks):
            start = sampled[0]["geometry"][row]
            oid = doc.add_point(start, parent=head, name=f"Material point {k + 1}")
            doc.attach_semantics(oid, {"role": "material point at fixed σ", "sigma_index": row, "solver": c["solver"]}, namespace="stringlab")
            ids.append(oid)
            base.append(start)
            tracks.append({"object_id": oid, "property": "translation", "interpolation": "linear",
                           "keyframes": [{"time": t, "value": [round(p - q, 9) for p, q in zip(f["geometry"][row], start)]} for t, f in zip(times, sampled)]})
        spec = {"duration": float(c["duration"]), "tracks": tracks}
        return c, doc, ids, spec, picks, times, sampled, base

    def animate(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        """Material-point tracks held by the Animation Agent, evaluated by it and compared with the solver at the midpoints between keyframes."""
        if not isinstance(payload, Mapping):
            raise ModelError("The animation request must be an object.")
        agent = self.hub.require("animation")
        c, doc, ids, spec, picks, times, sampled, base = self._animated_scene(payload.get("configuration"), payload.get("beads", 5), payload.get("keyframes", 90))
        scene = doc._model
        with self.hub.lock:
            sid = agent.bind_scene(scene)
            try:
                self.hub.task("animation", {"operation": "set_animation", "scene_id": sid, "payload": {"animation": spec}})
                mids = [(a + b) / 2 for a, b in zip(times[:-1], times[1:])]
                step = max(1, len(mids) // 24)
                probe = mids[::step][:24]
                evaluated = []
                for t in probe:
                    try:
                        state = agent.evaluate_state(sid, float(t))
                    except Exception as exc:
                        raise translate(exc) from exc
                    evaluated.append([list(state.world_bounds(oid)[0]) for oid in ids])
                self.hub.record("Animation Agent", "evaluate_state (midpoint samples)")
                info = self.hub.task("animation", {"operation": "get_animation", "scene_id": sid, "payload": {}})
            finally:
                agent.unbind_scene(sid)
        if c["solver"] == "finite_difference":
            truth = fd_series(c, [float(t) for t in probe])
        else:
            truth = [frame(c, float(t)) for t in probe]
        worst = 0.
        for pos, f in enumerate(truth):
            for k, row in enumerate(picks):
                want, got = f["geometry"][row], evaluated[pos][k]
                worst = max(worst, math.dist(want, got))
        size = max(max(max(p[i] for p in f["geometry"]) - min(p[i] for p in f["geometry"]) for i in range(3)) for f in sampled) or 1.
        return {"schema": 1, "agent": "SLAI Animation Agent", "schema_key": "slai.animation.v1", "duration": spec["duration"], "times": times,
                "beads": [{"id": oid, "sigma_index": row, "positions": [f["geometry"][row] for f in sampled]} for oid, row in zip(ids, picks)],
                "keyframes": len(times), "agent_revision": (info or {}).get("revision"),
                "verification": {"samples": len(probe), "max_distance": worst, "relative_to_extent": worst / size,
                                 "note": "Agent-evaluated positions at the midpoints between keyframes against the solver at those times: the error of the linear interpolation.",
                                 "passed": bool(worst / size < 0.05)}}

    def animated_sgeo(self, payload: Mapping[str, Any]) -> bytes:
        """The animated native SGEO package: the string at τ = 0 plus the material points with their tracks, through the Animation Agent."""
        if not isinstance(payload, Mapping):
            raise ModelError("The export request must be an object.")
        agent = self.hub.require("animation")
        c, doc, ids, spec, *_ = self._animated_scene(payload.get("configuration"), payload.get("beads", 5), payload.get("keyframes", 90),
                                                      bool(payload.get("worldsheet", False)))
        with self.hub.lock:
            sid = agent.bind_scene(doc._model)
            try:
                self.hub.task("animation", {"operation": "set_animation", "scene_id": sid, "payload": {"animation": spec}})
            finally:
                agent.unbind_scene(sid)
        doc.validate(mode="strict", raise_on_error=True)
        data = doc.dumps()
        _sgeo().from_bytes(data, mode="read").validate(raise_on_error=True)
        return data
