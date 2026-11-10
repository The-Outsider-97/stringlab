"""StringLab's view of the SLAI agent ecosystem.

StringLab copies no agent code and keeps no orchestration engine of its own. This module is the one place that knows which SLAI agents the
application talks to, loads them lazily from the SLAI checkout and reports, for each, whether StringLab uses it, for what, and (if it does
not) why. An agent counts as *available* only if it really imports in this installation; nothing here stands in for a missing agent.

The pattern is SPADRA's (``applications/SPADRA/agent_hub.py``). It is intentionally small: only the agents StringLab has a tested service
for are in the table, and the typed errors, the validators and the server come from ``applications.tools``.
"""
from __future__ import annotations

import importlib
import importlib.util
import re
import threading
from dataclasses import dataclass
from typing import Any, Mapping

from applications.tools.errors import BadRequest, DependencyMissing

AGENTS_PACKAGE = "src.agents"
MEMORY_MODULE = "src.agents.collaborative.shared_memory"


@dataclass(frozen=True)
class AgentSpec:
    key: str
    label: str
    module: str
    cls: str
    purpose: str            # what StringLab uses it for
    integrated: bool = True


SPECS: tuple[AgentSpec, ...] = (
    AgentSpec("stem", "STEM Agent", "stem_agent", "STEMAgent",
              "Unit-aware scales and dimension checks, independent numerical quadrature and differentiation of the analytical solution, "
              "and sensitivity / uncertainty propagation of the string energy"),
    AgentSpec("simulation", "Simulation Agent", "simulation_agent", "SimulationAgent",
              "Runs the finite-difference string solver as a rollout (seed, run id, lineage, termination reason)"),
    AgentSpec("animation", "Animation Agent", "animation_agent", "AnimationAgent",
              "Holds material-point trajectories as native SGEO keyframe tracks and evaluates them (also the playback clock of the export)"),
)
BY_KEY = {s.key: s for s in SPECS}

#: Agents StringLab does not use, with the reason. Only reasons that follow from what the agents' own documentation says they are for.
NOT_USED: tuple[tuple[str, str], ...] = (
    ("Verification Agent", "Limited by its own documentation to formal objects (contracts, SAT/SMT, model checking). String solutions are checked "
                           "numerically instead: against the analytical solution, by independent quadrature and by the wave-equation residual."),
    ("Spatial Agent", "No StringLab feature needs proximity, contact or relation queries; a single string has no neighbouring elements."),
    ("Language, Planning, Reasoning and learning agents", "StringLab's results are deterministic; it never asks a generative or learned agent to produce physics."),
)


class Hub:
    """Loads the integrated agents once, on first use, and records every call StringLab makes (so the panel reports only real calls)."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._agents: dict[str, Any] = {}
        self._reasons: dict[str, str] = {}
        self._memory: Any = None
        self.calls: list[dict[str, Any]] = []

    # ------------------------------------------------------------------------------------------------------------------ loading
    def memory(self) -> Any:
        with self._lock:
            if self._memory is None:
                self._memory = importlib.import_module(MEMORY_MODULE).SharedMemory()
            return self._memory

    def load(self, key: str) -> Any | None:
        spec = BY_KEY[key]
        with self._lock:
            if key in self._agents:
                return self._agents[key]
            if key in self._reasons:
                return None
            try:
                cls = getattr(importlib.import_module(f"{AGENTS_PACKAGE}.{spec.module}"), spec.cls)
                self._agents[key] = cls() if key == "animation" else cls(self.memory(), None)
            except Exception as exc:                      # a missing module, dependency or configuration file: reported, never hidden
                self._reasons[key] = f"{type(exc).__name__}: {exc}"
                return None
            return self._agents[key]

    def available(self, key: str) -> bool:
        return self.load(key) is not None

    def reason(self, key: str) -> str | None:
        self.load(key)
        return self._reasons.get(key)

    def require(self, key: str) -> Any:
        agent = self.load(key)
        if agent is None:
            raise DependencyMissing(f"The SLAI {BY_KEY[key].label} is not available.", details={"reason": self._reasons.get(key)},
                                    hint="Start StringLab inside a SLAI checkout that contains src/agents (use --slai-root).")
        return agent

    @property
    def lock(self) -> threading.RLock:
        return self._lock

    # ------------------------------------------------------------------------------------------------------------------ calls
    def record(self, agent: str, operation: str, request_id: Any = None) -> None:
        with self._lock:
            self.calls.append({"agent": agent, "operation": operation, "request_id": request_id})
            del self.calls[:-100]

    def task(self, key: str, request: Mapping[str, Any]) -> Any:
        """One ``perform_task`` call on an integrated agent. The agents' typed errors become ordinary 400 answers with the agent's message."""
        agent = self.require(key)
        with self._lock:
            try:
                answer = agent.perform_task(dict(request))
            except Exception as exc:
                raise translate(exc) from exc
        self.record(BY_KEY[key].label, str(request.get("domain", "")) + ("." if request.get("domain") else "") + str(request.get("operation", "")),
                    answer.get("request_id") if isinstance(answer, Mapping) else None)
        return answer

    def stem(self, domain: str, operation: str, args: list[Any] | None = None, kwargs: Mapping[str, Any] | None = None) -> Any:
        """One STEM operation, exactly as the agent runs it (no cache, nothing published). Returns the agent's own ``result``."""
        answer = self.task("stem", {"domain": domain, "operation": operation, "args": list(args or []), "kwargs": dict(kwargs or {}),
                                    "cache": False, "publish": False})
        if not isinstance(answer, Mapping) or answer.get("status") not in ("success", "completed_with_warning"):
            raise BadRequest("The STEM Agent did not return a result.", details={"answer": str(answer)[:400]})
        return answer.get("result")

    # ------------------------------------------------------------------------------------------------------------------ report
    def present(self, spec: AgentSpec) -> bool:
        try:
            return importlib.util.find_spec(f"{AGENTS_PACKAGE}.{spec.module}") is not None
        except (ImportError, ValueError):
            return False

    def status(self) -> dict[str, Any]:
        rows = []
        for spec in SPECS:
            row: dict[str, Any] = {"key": spec.key, "label": spec.label, "purpose": spec.purpose, "present": self.present(spec),
                                   "available": self.available(spec.key)}
            if not row["available"]:
                row["reason"] = self.reason(spec.key) or "not importable"
            rows.append(row)
        with self._lock:
            calls = list(self.calls[-12:])
        return {"agents": rows, "not_used": [{"label": a, "why": w} for a, w in NOT_USED], "recent_calls": calls,
                "deterministic_core_requires_agents": False, "shared_memory": self._memory is not None}


def translate(exc: Exception) -> Exception:
    """Agents and SGEO raise their own typed errors for bad input; the application reports them as ordinary 400 answers."""
    module = type(exc).__module__
    if module.startswith(("src.agents", "src.utils")):
        return BadRequest(clean_message(exc) or type(exc).__name__, details={"error": type(exc).__name__})
    return exc


_AGENT_NOISE = re.compile(r"^\[[A-Z]{2,4}-\d+\]\s*|\s+severity=.*$", re.S)


def clean_message(exc: Exception) -> str:
    """The agent's message without its internal error code and trailing ``severity=… component=…`` bookkeeping."""
    return _AGENT_NOISE.sub("", str(exc)).strip()
