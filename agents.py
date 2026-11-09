"""Optional, explicit SLAI agent and SharedMemory integration.

Deterministic physics never calls generative agents. When a user expressly asks
for agent analysis, this adapter delegates to the existing SLAI AgentFactory,
passes a revision-tagged, bounded scientific context and returns a typed result.
No second orchestration engine is created here.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

from .physics import ModelError, frame, validated


class AgentBridge:
    def __init__(self) -> None:
        self._memory: Any = None
        self._factory: Any = None
        self._error: str | None = None

    def status(self) -> dict[str, Any]:
        return {"connected": self._factory is not None, "shared_memory": self._memory is not None,
                "supported_agents": ["stem", "verification"],
                "last_error": self._error, "deterministic_core_requires_agents": False}

    def _connect_memory(self):
        if self._memory is None:
            from src.agents.collaborative.shared_memory import SharedMemory
            self._memory = SharedMemory()
        return self._memory

    def _connect_factory(self):
        if self._factory is None:
            from src.agents.agent_factory import AgentFactory
            self._factory = AgentFactory()
        return self._factory

    @staticmethod
    def _checked_revision(revision: Any) -> int:
        if type(revision) is not int or not 0 <= revision < 2**31:
            raise ModelError("Agent request revision must be a nonnegative integer.")
        return revision

    @staticmethod
    def _digest(c: dict) -> str:
        return hashlib.sha256(json.dumps(c,sort_keys=True,allow_nan=False).encode()).hexdigest()

    def publish_result(self, configuration: dict, time: float, revision: int) -> dict[str, Any]:
        """Publish bounded verified solver diagnostics by revision; no geometry arrays.

        Every revision has a distinct key. Consumers check both revision and
        configuration digest before using the record, avoiding stale overwrite.
        """
        revision = self._checked_revision(revision)
        c = validated(configuration)
        f = frame(c,time)
        data = {"schema":1,"application":"stringlab","revision":revision,
                "configuration_sha256":self._digest(c), "model":c["theory"],
                "time":f["time"], "status":f["status"],
                "observables":{key:f["diagnostics"].get(key) for key in
                               ("energy","level_matching_residual","constraint_status","boundary_status")}}
        try:
            mem = self._connect_memory()
            mem.set(f"stringlab:results:{data['configuration_sha256']}:{revision}",data,ttl=1800)
            mem.publish("stringlab.simulation.results",data)
            self._error = None
        except (ImportError, RuntimeError, ValueError, TypeError, AttributeError) as exc:
            self._error = f"SLAI SharedMemory unavailable: {type(exc).__name__}: {exc}"
            return {"published":False,"error":self._error,"result":data}
        return {"published":True,"result":data}

    def run(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(payload,dict):
            raise ModelError("Agent request must be a JSON object.")
        agent_type = payload.get("agent")
        if agent_type not in ("stem","verification"):
            raise ModelError("Only explicitly supported STEM and Verification Agent calls are enabled.")
        revision = self._checked_revision(payload.get("revision"))
        c = validated(payload.get("configuration"))
        task = payload.get("task")
        if not isinstance(task,dict) or len(json.dumps(task))>12000:
            raise ModelError("Agent task must be a bounded JSON object (maximum 12,000 characters).")
        f = frame(c, payload.get("time",0.))
        context = {"application":"stringlab", "revision":revision,
                   "configuration_sha256":self._digest(c), "model":c["theory"],
                   "status":f["status"], "diagnostics":{
                       "energy":f["diagnostics"].get("energy"),
                       "level_matching_residual":f["diagnostics"].get("level_matching_residual")}}
        try:
            mem = self._connect_memory()
            factory = self._connect_factory()
            agent = factory.create_agent(agent_type, shared_memory=mem)
            # The caller selects the existing agent's official operation
            # contract. We do not translate prompts into executable Python.
            request = {**task, "stringlab_context":context}
            outcome = agent.perform_task(request)
            result = json.loads(json.dumps(outcome,default=str,ensure_ascii=False))
            if len(json.dumps(result))>200000:
                raise ModelError("Agent response exceeded the 200 KB output budget.")
            self._error = None
            return {"schema":1, "agent":agent_type,"context":context,"result":result,
                    "advisory_only":True,"applied_parameter_changes":False}
        except ModelError:
            raise
        except (ImportError, RuntimeError, TypeError, AttributeError, ValueError) as exc:
            self._error = f"Optional SLAI {agent_type} Agent unavailable: {type(exc).__name__}: {exc}"
            return {"schema":1,"agent":agent_type,"available":False,
                    "context":context,"error":self._error,"advisory_only":True}
