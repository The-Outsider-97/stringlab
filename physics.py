"""Classical free Polyakov-string solutions in flat target spacetime.

Light-cone gauge: ds²=-2 dX⁺dX⁻+dY·dY; X⁺=p⁺τ, p⁺>0.
The transverse equations Ÿ-Y''=0 are solved analytically or by leapfrog.
Virasoro constraints reconstruct longitudinal derivatives; closed strings
additionally require the global level-matching/closure integral.
All angles are radians, τ and σ are dimensionless, lengths are in model units.
"""
from __future__ import annotations

from copy import deepcopy
from math import pi
from typing import Any

import re

import numpy as np

from applications.tools.errors import BadRequest
from applications.tools.validation import integer as _checked_integer, number as _checked_number

SCHEMA = 1
MAX_POINTS = 4096
MAX_MODES = 32
MAX_STEPS = 30000

class ModelError(BadRequest, ValueError):
    """User-facing domain/configuration error. It is the shared 400 ``BadRequest``, so the server reports it without any wrapper."""


def scalar(value: Any, label: str, low: float, high: float) -> float:
    """A finite number in [low, high], checked by the shared validator (``applications.tools.validation.number``)."""
    try:
        return _checked_number(value, label, low, high)
    except BadRequest as exc:
        raise ModelError(exc.message) from exc


def whole(value: Any, label: str, low: int, high: int) -> int:
    """A whole number in [low, high], checked by the shared validator."""
    try:
        return _checked_integer(value, label, low, high)
    except BadRequest as exc:
        raise ModelError(exc.message) from exc


def template(kind: str = "open") -> dict[str, Any]:
    if kind not in ("open", "closed"):
        raise ModelError("Choose 'open' or 'closed'.")
    return {
        "schema": SCHEMA, "kind": kind, "theory": "classical_free_bosonic",
        "description": "Classical light-cone gauge, flat Minkowski target space",
        "dimensions": 26, "p_plus": 2.0, "alpha_prime": 1.0,
        "bc": "NN" if kind == "open" else "periodic",
        "zero_velocity": [0.0, 0.0, 0.0],
        "anchor_start": [0.0, 0.0, 0.0], "anchor_end": [0.0, 0.0, 0.0],
        "modes": ([{"n": 1, "axis": 2, "amplitude": 0.4, "phase": 0.0, "enabled": True}]
                  if kind == "open" else [
                    {"n": 1, "axis": 1, "left": 0.22, "right": 0.22,
                     "phase_left": 0.0, "phase_right": 0.0, "enabled": True},
                    {"n": 1, "axis": 2, "left": 0.22, "right": 0.22,
                     "phase_left": -pi/2, "phase_right": -pi/2, "enabled": True}]),
        "solver": "analytical", "points": 128, "dt": 0.005,
        "duration": 12.0,
        "projection": (["σ", "X2", "X3"] if kind == "open" else ["X1", "X2", "X3"]),
        "display": {"worldsheet": False, "grid": True, "color": "#48b4df"},
    }


_scalar = scalar


CONFIG_KEYS = frozenset({"schema", "kind", "theory", "description", "dimensions", "p_plus", "alpha_prime", "bc", "zero_velocity", "anchor_start",
                         "anchor_end", "modes", "solver", "points", "dt", "duration", "projection", "display"})
_COLOUR = re.compile(r"#[0-9a-fA-F]{6}")


def _display(raw: Any) -> dict[str, Any]:
    """Presentation fields stored with an experiment, validated like everything else (an unknown key is dropped)."""
    raw = raw if isinstance(raw, dict) else {}
    colour = raw.get("color", "#48b4df")
    return {"worldsheet": raw.get("worldsheet") is True, "grid": raw.get("grid", True) is not False,
            "color": colour if isinstance(colour, str) and _COLOUR.fullmatch(colour) else "#48b4df"}


def _time(value: Any, duration: float) -> float:
    """A time in [0, duration]. A value a rounding error beyond the end (a solver step that overshot it) is accepted and clamped."""
    return min(_scalar(value, "time", 0., duration * (1 + 1e-9) + 1e-12), duration)


def validated(raw: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ModelError("The experiment must be an object.")
    # Only the keys of the model are kept: whatever else a file or request carries is dropped, never stored or echoed.
    c = {key: deepcopy(value) for key, value in raw.items() if key in CONFIG_KEYS}
    if c.get("schema") != SCHEMA:
        raise ModelError(f"Expected experiment schema {SCHEMA}.")
    kind = c.get("kind")
    if kind not in ("open", "closed"):
        raise ModelError("Unsupported classical model; expected open or closed.")
    if c.get("theory") != "classical_free_bosonic":
        raise ModelError("Only the flat-space classical free bosonic model is supported here.")
    d = c.get("dimensions")
    if type(d) is not int or not 4 <= d <= 26:
        raise ModelError("Target spacetime dimensions must be an integer between 4 and 26.")
    axes = d - 2
    c["p_plus"] = _scalar(c.get("p_plus"), "p_plus", 0.001, 1000)
    c["alpha_prime"] = _scalar(c.get("alpha_prime"), "alpha_prime", 1e-6, 1e6)
    bc = c.get("bc")
    if bc not in (("NN", "DD", "ND", "DN") if kind == "open" else ("periodic",)):
        raise ModelError("Unsupported boundary condition for this string type.")
    for name in ("anchor_start", "anchor_end", "zero_velocity"):
        xs = c.get(name)
        if not isinstance(xs, list) or not 1 <= len(xs) <= axes:
            raise ModelError(f"{name} must have 1–{axes} components.")
        c[name] = [_scalar(x, name, -100, 100) for x in xs] + [0.] * (axes - len(xs))
    if kind == "open" and bc != "DD" and any(abs(a - b) > 1e-14 for a, b in zip(c["anchor_start"], c["anchor_end"])):
        raise ModelError("Different fixed endpoint positions are supported for DD only; NN/ND/DN use a single common anchor.")
    if kind == "open" and bc != "NN" and any(abs(v) > 1e-14 for v in c["zero_velocity"]):
        raise ModelError("A nonzero transverse zero-mode velocity is allowed only for NN/periodic boundaries.")
    modes = c.get("modes")
    if not isinstance(modes, list) or len(modes) > MAX_MODES:
        raise ModelError(f"modes must be a list of at most {MAX_MODES} modes.")
    for i, mode in enumerate(modes):
        if not isinstance(mode, dict):
            raise ModelError(f"Mode {i + 1} must be an object.")
        n, axis = mode.get("n"), mode.get("axis")
        if type(n) is not int or not 1 <= n <= 32:
            raise ModelError(f"Mode {i + 1}: n must be 1–32.")
        if type(axis) is not int or not 1 <= axis <= axes:
            raise ModelError(f"Mode {i + 1}: axis must be 1–{axes}.")
        if type(mode.get("enabled")) is not bool:
            raise ModelError(f"Mode {i + 1}: enabled must be boolean.")
        for prop in (("amplitude", "phase") if kind == "open" else
                     ("left", "right", "phase_left", "phase_right")):
            lim = 5 if prop in ("amplitude", "left", "right") else 200 * pi
            mode[prop] = _scalar(mode.get(prop), f"mode {i + 1}.{prop}", -lim, lim)
    points = c.get("points")
    if type(points) is not int or not 32 <= points <= MAX_POINTS:
        raise ModelError(f"points must be an integer between 32 and {MAX_POINTS}.")
    # Prevent undersampled high-harmonic curves from appearing to satisfy all
    # closure/boundary conditions merely because discrete sample nodes alias.
    highest = max((m["n"] for m in modes if m["enabled"]), default=0)
    min_points = (8 * highest if kind == "closed" else 4 * highest + 1)
    if points < min_points:
        raise ModelError(f"Spatial resolution is too low for mode n={highest}: use at least {min_points} points (8+ samples per spatial cycle).")
    c["dt"] = _scalar(c.get("dt"), "dt", 1e-5, .2)
    c["duration"] = _scalar(c.get("duration"), "duration", 0.01, 100.)
    if c.get("solver") not in ("analytical", "finite_difference"):
        raise ModelError("Choose analytical or finite_difference solver.")
    projection = c.get("projection")
    valid = ["σ", "X+", "X-"] + [f"X{i}" for i in range(1, axes + 1)]
    if not isinstance(projection, list) or len(projection) != 3 or len(set(projection)) != 3 or any(x not in valid for x in projection):
        raise ModelError(f"projection must contain three distinct coordinates from {valid}.")
    c["display"] = _display(c.get("display"))
    description = c.get("description", "")
    c["description"] = description[:200] if isinstance(description, str) else ""
    return c


def sigma_grid(c: dict[str, Any], count: int | None = None) -> np.ndarray:
    n = count or c["points"]
    return np.linspace(0., pi if c["kind"] == "open" else 2 * pi, n,
                       endpoint=c["kind"] == "open")


def transverse(c: dict[str, Any], sigma: np.ndarray, tau: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return Y, ∂τY and ∂σY (shape: grid × D-2)."""
    m = c["dimensions"] - 2
    y = np.zeros((sigma.size, m), dtype=float)
    vt = np.zeros_like(y)
    vs = np.zeros_like(y)
    start = np.asarray(c["anchor_start"])
    end = np.asarray(c["anchor_end"])
    y += start
    if c["kind"] == "open":
        if c["bc"] == "DD":
            y += (sigma / pi)[:, None] * (end - start)
            vs += (end - start) / pi
        if c["bc"] == "NN":
            velocity = np.asarray(c["zero_velocity"])
            y += tau * velocity
            vt += velocity
        for mode in c["modes"]:
            if not mode["enabled"]:
                continue
            idx = mode["axis"] - 1
            k = float(mode["n"]) if c["bc"] in ("NN", "DD") else mode["n"] - .5
            arg = k * tau + mode["phase"]
            if c["bc"] in ("NN", "ND"):
                profile = np.cos(k * sigma)
                dp = -k * np.sin(k * sigma)
            else:
                profile = np.sin(k * sigma)
                dp = k * np.cos(k * sigma)
            amplitude = mode["amplitude"]
            y[:, idx] += amplitude * profile * np.cos(arg)
            vt[:, idx] += -amplitude * k * profile * np.sin(arg)
            vs[:, idx] += amplitude * dp * np.cos(arg)
    else:
        y += tau * np.asarray(c["zero_velocity"])
        vt += np.asarray(c["zero_velocity"])
        for mode in c["modes"]:
            if not mode["enabled"]:
                continue
            idx = mode["axis"] - 1
            n = mode["n"]
            left = n * (sigma + tau) + mode["phase_left"]
            right = n * (sigma - tau) + mode["phase_right"]
            a, b = mode["left"], mode["right"]
            y[:, idx] += a * np.cos(left) + b * np.cos(right)
            vt[:, idx] += -a * n * np.sin(left) + b * n * np.sin(right)
            vs[:, idx] += -a * n * np.sin(left) - b * n * np.sin(right)
    return y, vt, vs


def _integral(values: np.ndarray, sig: np.ndarray, closed: bool) -> float:
    if closed:
        return float(values.mean() * 2 * pi)
    return float(np.trapezoid(values, sig))


def _reconstruct(c: dict[str, Any], sig: np.ndarray, tau: float, y: np.ndarray,
                 vt: np.ndarray, vs: np.ndarray) -> dict[str, Any]:
    p = c["p_plus"]
    dxm_sigma = np.sum(vt * vs, axis=1) / p
    dxm_tau = np.sum(vt * vt + vs * vs, axis=1) / (2 * p)
    closed = c["kind"] == "closed"
    flux = _integral(dxm_sigma, sig, closed)
    # ∂σX⁻ has zero integral only if closed-string global constraint holds.
    flux_scale = max(1., _integral(np.abs(dxm_sigma), sig, closed))
    closure_ratio = abs(flux) / flux_scale if closed else 0.
    # Compute a *display* X⁻ by quadrature. In constrained configurations,
    # its sigma derivative agrees with the Virasoro constraint as resolution increases.
    # Longitudinal zero-mode evolves according to constant transverse Hamiltonian.
    cum = np.zeros(sig.size)
    cum[1:] = np.cumsum((dxm_sigma[:-1] + dxm_sigma[1:]) * np.diff(sig) * .5)
    xminus = cum - np.mean(cum) + tau * np.mean(dxm_tau)
    energy_density = np.sum(vt**2 + vs**2, axis=1)
    tension = 1 / (2 * pi * c["alpha_prime"])
    energy = .5 * tension * _integral(energy_density, sig, closed)
    # Evaluate induced metric after algebraically reconstructing longitudinal
    # derivatives. This is an ON-SHELL action-density comparison, NOT an
    # independent variation or solver for Nambu-Goto's nonlinear equations.
    gamma_tt = -2 * p * dxm_tau + np.sum(vt * vt, axis=1)
    gamma_ts = -p * dxm_sigma + np.sum(vt * vs, axis=1)
    gamma_ss = np.sum(vs * vs, axis=1)
    determinant = gamma_tt * gamma_ss - gamma_ts**2
    area_density = np.sqrt(np.maximum(0., -determinant))
    ng_density = -tension * area_density
    poly_density = .5 * tension * (gamma_tt - gamma_ss)
    ng_spatial = _integral(ng_density, sig, closed)
    poly_spatial = _integral(poly_density, sig, closed)
    # Analytical Virasoro derivatives are defined algebraically above, not
    # inferred from the projected mesh. Global closure is separately verified.
    return {"xminus": xminus, "energy": energy, "flux": flux,
            "level_matching_residual": closure_ratio,
            "constraint_status": "valid" if closure_ratio < 1e-8 else "invalid",
            "boundary_status": "valid", "energy_density": energy_density,
            "ng_on_shell_density_integral_sigma": ng_spatial,
            "polyakov_on_shell_density_integral_sigma": poly_spatial,
            "on_shell_action_density_difference": abs(ng_spatial - poly_spatial),
            "induced_metric_degenerate_sample_count": int(np.count_nonzero(np.abs(determinant) < 1e-15)),
            "max_transverse_speed": float(np.max(np.linalg.norm(vt, axis=1))),
            "tension": tension, "dXminus_dt_mean": float(np.mean(dxm_tau))}


def _project(c: dict[str, Any], tau: float, y: np.ndarray, xm: np.ndarray) -> list[list[float]]:
    mapping = {"σ": sigma_grid(c, len(y)), "X+": np.full(len(y), c["p_plus"] * tau), "X-": xm}
    mapping.update({f"X{i+1}": y[:, i] for i in range(y.shape[1])})
    return np.stack([mapping[k] for k in c["projection"]], axis=1).round(9).tolist()


def frame(raw: dict[str, Any], tau: float, *, count: int | None = None) -> dict[str, Any]:
    c = validated(raw)
    tau = _time(tau, c["duration"])
    if count is not None and (type(count) is not int or not 32 <= count <= MAX_POINTS):
        raise ModelError("Invalid sampling resolution.")
    sig = sigma_grid(c, count)
    y, vt, vs = transverse(c, sig, tau)
    detail = _reconstruct(c, sig, tau, y, vt, vs)
    valid = detail["constraint_status"] == "valid"
    return {"time": tau, "solver": "analytical", "geometry": _project(c, tau, y, detail["xminus"]),
            "projection": c["projection"], "closed": c["kind"] == "closed",
            "status": "physical_classical" if valid else "constraint_violating_free_field",
            "projection_kind": "parameter_space_diagram" if "σ" in c["projection"] else "target_space_coordinate_projection",
            "diagnostics": {k: (float(v) if isinstance(v, np.floating) else v)
                            for k, v in detail.items() if k not in ("energy_density", "xminus")},
            "samples": len(sig), "model_assumptions": c["description"]}


def laplacian(u: np.ndarray, dx: float, bc: str) -> np.ndarray:
    if bc == "periodic":
        return (np.roll(u, 1, axis=0) - 2 * u + np.roll(u, -1, axis=0)) / dx**2
    out = np.zeros_like(u)
    out[1:-1] = (u[:-2] - 2 * u[1:-1] + u[2:]) / dx**2
    if bc[0] == "N":
        out[0] = 2 * (u[1] - u[0]) / dx**2
    if bc[1] == "N":
        out[-1] = 2 * (u[-2] - u[-1]) / dx**2
    return out


class FDStepper:
    """Central-difference leapfrog for the transverse wave equation (the one finite-difference implementation).

    ``fd_series`` and the Simulation Agent rollout in ``agents.py`` both advance a string with this class, so the solver exists once.
    The state is the pair (previous, current) of grid arrays; a step advances both by ``dt``. The CFL number is kept at or below 0.9.
    """

    def __init__(self, raw: dict[str, Any]) -> None:
        self.c = validated(raw)
        c = self.c
        self.sig = sigma_grid(c)
        self.dx = float(self.sig[1] - self.sig[0])
        self.dt = float(min(c["dt"], 0.9 * self.dx))
        self.y0, self.v0, _ = transverse(c, self.sig, 0.)
        self.bc = c["bc"]

    def steps_for(self, time: float) -> int:
        return int(round(time / self.dt))

    def start(self) -> tuple[np.ndarray, np.ndarray]:
        """(previous, current) at step 0; the previous level is a second-order Taylor step back."""
        previous = self.y0 - self.dt * self.v0 + .5 * self.dt**2 * laplacian(self.y0, self.dx, self.bc)
        if self.c["kind"] == "open":
            if self.bc[0] == "D": previous[0] = self.y0[0]
            if self.bc[1] == "D": previous[-1] = self.y0[-1]
        return previous, self.y0.copy()

    def advance(self, previous: np.ndarray, current: np.ndarray, steps: int = 1) -> tuple[np.ndarray, np.ndarray]:
        for index in range(steps):
            following = 2 * current - previous + self.dt**2 * laplacian(current, self.dx, self.bc)
            if self.c["kind"] == "open":
                if self.bc[0] == "D": following[0] = self.y0[0]
                if self.bc[1] == "D": following[-1] = self.y0[-1]
            previous, current = current, following
            if not np.isfinite(current).all():
                raise ModelError(f"Numerical instability detected after {index + 1} step(s).")
        return previous, current

    def observe(self, step: int, previous: np.ndarray, current: np.ndarray) -> dict[str, Any]:
        """The frame for the state at ``step`` (time = step*dt), with diagnostics against the analytical solution."""
        c, dt, dx = self.c, self.dt, self.dx
        # Backward velocity corrected by +dt*a/2, second-order accurate.
        v = (current - previous) / dt + .5 * dt * laplacian(current, dx, self.bc)
        vs = ((np.roll(current, -1, axis=0) - np.roll(current, 1, axis=0)) / (2 * dx)
              if c["kind"] == "closed" else np.gradient(current, dx, axis=0, edge_order=2))
        if c["kind"] == "open":
            if self.bc[0] == "N": vs[0] = 0.
            if self.bc[1] == "N": vs[-1] = 0.
        time = step * dt
        info = _reconstruct(c, self.sig, time, current, v, vs)
        exact, _, _ = transverse(c, self.sig, time)
        rms = float(np.sqrt(np.mean((current - exact)**2)))
        return {"time": float(time), "solver": "finite_difference",
                "geometry": _project(c, time, current, info["xminus"]),
                "projection": c["projection"], "closed": c["kind"] == "closed",
                "status": "numerical_approximation_not_certified",
                "projection_kind": "parameter_space_diagram" if "σ" in c["projection"] else "target_space_coordinate_projection",
                "diagnostics": {"energy": info["energy"], "rms_error_vs_analytical": rms,
                                "level_matching_residual": info["level_matching_residual"],
                                "cfl": float(dt / dx), "effective_dt": float(dt),
                                "constraint_status": "approximate_numerical"},
                "samples": len(self.sig)}


def fd_series(raw: dict[str, Any], times: list[float]) -> list[dict[str, Any]]:
    """FD frames at the requested times (each rounded to the nearest solver step; ``requested_time`` keeps what was asked).

    This advances the *transverse* free wave equation only. The 3D view uses longitudinal reconstruction with numerical
    derivatives and reports that its worldsheet constraints are approximate, not automatically physical.
    """
    stepper = FDStepper(raw)
    c = stepper.c
    if not isinstance(times, list) or not 1 <= len(times) <= 360:
        raise ModelError("Request between 1 and 360 output times.")
    times = [_time(t, c["duration"]) for t in times]
    max_index = stepper.steps_for(max(times))
    if max_index > MAX_STEPS:
        raise ModelError(f"Numerical run needs {max_index} steps; reduce duration or increase dt. Limit: {MAX_STEPS}.")
    requested: dict[int, list[int]] = {}
    for pos, t in enumerate(times):
        requested.setdefault(stepper.steps_for(t), []).append(pos)
    outputs: list[dict[str, Any] | None] = [None] * len(times)
    previous, current = stepper.start()
    done = 0
    for step in sorted(requested):
        previous, current = stepper.advance(previous, current, step - done)
        done = step
        out = stepper.observe(step, previous, current)
        for pos in requested[step]:
            outputs[pos] = {**out, "requested_time": times[pos]}
    return [x for x in outputs if x is not None]


def frame_at(raw: dict[str, Any], tau: float) -> dict[str, Any]:
    """One frame from the solver the experiment selects (analytical or finite difference), so a viewer, an export and a
    report built from the same experiment can never disagree about which solver produced the geometry."""
    c = validated(raw)
    if c["solver"] == "finite_difference":
        return fd_series(c, [_time(tau, c["duration"])])[0]
    return frame(c, tau)


def series(raw: dict[str, Any], steps: int = 100) -> list[dict[str, Any]]:
    c = validated(raw)
    if not isinstance(steps, int) or not 2 <= steps <= 240:
        raise ModelError("frames must be between 2 and 240.")
    times = np.linspace(0, c["duration"], steps).tolist()
    if c["solver"] == "finite_difference":
        return fd_series(c, times)
    return [frame(c, t) for t in times]


def convergence(raw: dict[str, Any], target_time: float | None = None) -> list[dict[str, float]]:
    c = validated(raw)
    end = float(target_time if target_time is not None else min(1., c["duration"]))
    results = []
    for count in (64, 128, 256):
        x = deepcopy(c)
        x["points"] = count
        x["dt"] = min(x["dt"], .5 * ((pi if c["kind"] == "open" else 2*pi) / count))
        output = fd_series(x, [end])[0]
        results.append({"points": count, "rms_error": output["diagnostics"]["rms_error_vs_analytical"],
                        "effective_dt": output["diagnostics"]["effective_dt"]})
    return results


def sweep(raw: dict[str, Any], amplitude_start: float, amplitude_end: float, steps: int) -> list[dict[str, float | str]]:
    c = validated(raw)
    enabled = [i for i, m in enumerate(c["modes"]) if m["enabled"]]
    if not enabled:
        raise ModelError("Sweep requires at least one enabled mode.")
    if not isinstance(steps, int) or not 2 <= steps <= 80:
        raise ModelError("Sweep steps must be from 2 to 80.")
    start = _scalar(amplitude_start, "sweep start", -5., 5.)
    stop = _scalar(amplitude_end, "sweep end", -5., 5.)
    result = []
    key = "amplitude" if c["kind"] == "open" else "left"
    for value in np.linspace(start, stop, steps):
        x = deepcopy(c)
        x["modes"][enabled[0]][key] = float(value)
        f = frame(x, 0.)
        result.append({"amplitude": float(value), "energy": f["diagnostics"]["energy"],
                       "constraint_residual": f["diagnostics"]["level_matching_residual"],
                       "status": f["status"]})
    return result


def evaluate_actions(raw: dict[str, Any], *, time_samples: int = 40) -> dict[str, Any]:
    """Evaluate both classical action integrals on the restricted reconstructed field.

    The Polyakov integral uses conformal gauge. Equality with Nambu-Goto is an
    ON-SHELL consistency identity. At degenerate worldsheet patches the
    non-linear Nambu-Goto variational problem may be singular; no such solver
    is implemented. A globally invalid closed-string state is explicitly flagged.
    """
    c = validated(raw)
    if type(time_samples) is not int or not 8 <= time_samples <= 128:
        raise ModelError("time_samples must be an integer from 8 to 128.")
    ts = np.linspace(0., c["duration"], time_samples)
    ng = []
    poly = []
    closure = []
    degeneracy = 0
    for t in ts:
        sig = sigma_grid(c)
        y, vt, vs = transverse(c, sig, float(t))
        item = _reconstruct(c, sig, float(t), y, vt, vs)
        ng.append(item["ng_on_shell_density_integral_sigma"])
        poly.append(item["polyakov_on_shell_density_integral_sigma"])
        closure.append(item["level_matching_residual"])
        degeneracy = max(degeneracy, item["induced_metric_degenerate_sample_count"])
    s1 = float(np.trapezoid(ng, ts))
    s2 = float(np.trapezoid(poly, ts))
    return {"nambu_goto_on_shell": s1, "polyakov_conformal_gauge_on_shell": s2,
            "absolute_difference": abs(s1-s2),
            "relative_difference": abs(s1-s2) / max(1., abs(s1), abs(s2)),
            "worldsheet_time_interval": [0., c["duration"]],
            "spatial_samples": c["points"], "temporal_quadrature_samples": time_samples,
            "maximum_global_closure_residual": float(max(closure)),
            "globally_admissible_closed_string": bool(max(closure) < 1e-8),
            "possible_degenerate_metric_samples_per_frame": degeneracy,
            "scientific_scope": "On-shell numerical quadrature in flat light-cone gauge; not an independent nonlinear Nambu-Goto/Polyakov solver.",
            "references": ["Tong2009:1.13,1.22,1.31-1.33", "Wray2011:2.28-2.35"]}
