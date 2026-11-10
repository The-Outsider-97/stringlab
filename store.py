"""Persistent local experiments; validate before atomic save; path-safe opaque IDs."""
from __future__ import annotations

import json
import threading
from pathlib import Path

from applications.tools.errors import Conflict, NotFound
from applications.tools.validation import new_id, record_id, text, utc_now

from .physics import ModelError, validated
from .quantum import spectrum
from .covariant import _number, _integer

def _validated_numerical(raw: object) -> dict | None:
    """Validate a saved numerical solver request without re-running the PDE on disk I/O."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ModelError("Numerical solver configuration must be an object.")
    model = raw.get("model")
    if model not in ("polyakov", "nambu_goto", "dbi_d1"):
        raise ModelError("Unknown numerical solver model.")
    kind = raw.get("kind")
    if kind not in ("open", "closed"):
        raise ModelError("Numerical endpoint topology must be open or closed.")
    options = {"model": model, "kind": kind}
    for key, default, low, high in (("points", 96, 32, 512), ("frames", 80, 2, 160)):
        options[key] = _integer(raw, key, default, low, high)
    for key, default, low, high in (("duration", 4., .02, 20.),
             ("amplitude", .4, 0., 5.), ("alpha_prime", 1., 1e-6, 1e6),
             ("hubble", 0., -.2, .2), ("electric", 0., -.8, .8)):
        options[key] = _number(raw, key, default, low, high)
    if model == "polyakov":
        options["dimensions"] = _integer(raw, "dimensions", 4, 3, 8)
        if options["amplitude"] < .02:
            raise ModelError("Polyakov amplitude must be at least 0.02.")
    elif options["amplitude"] > 1.:
        raise ModelError("Nambu–Goto amplitude cannot exceed 1.")
    if model == "dbi_d1":
        if options["hubble"] != 0. and options["electric"] != 0.:
            raise ModelError("Prescribed electric background and FRW are incompatible.")
    else:
        options["electric"] = 0.
    return options


class ExperimentStore:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()

    def _path(self, uid: str) -> Path:
        return self.root / (record_id(uid, "Experiment identifier") + ".json")

    def save(self, payload: dict) -> dict:
        from applications.tools.storage import atomic_write_json
        if not isinstance(payload, dict):
            raise ModelError("Experiment must be an object.")
        c = validated(payload.get("configuration"))
        quantum = payload.get("quantum")
        if quantum is not None:
            spectrum(quantum)  # validates full finite oscillator configuration; do not silently alter it.
        numerical = _validated_numerical(payload.get("numerical"))
        title = text(payload.get("title", "Untitled experiment"), "Title", 120)
        uid = payload.get("id") or new_id()
        target = self._path(uid)
        with self.lock:
            previous = None
            if target.exists():
                try:
                    previous = json.loads(target.read_text(encoding="utf-8"))
                except (ValueError, OSError) as exc:
                    raise ModelError("Stored experiment is unreadable; it was not overwritten.") from exc
            expected = payload.get("expected_revision", 0)
            if type(expected) is not int or expected < 0 or (previous or {}).get("revision", 0) != expected:
                raise Conflict("Revision conflict.", hint="Reload before saving to avoid overwriting a newer experiment.")
            result = {"id": uid, "schema": 1, "title": title, "revision": expected + 1,
                      "created_utc": (previous or {}).get("created_utc") or utc_now(),
                      "updated_utc": utc_now(), "configuration": c, "quantum": quantum, "numerical": numerical,
                      "provenance": {"engine": "stringlab.physics", "engine_schema": 1,
                                     "category": "covariant or nonlinear numerical PDE" if numerical else "classical analytical/numerical reduced light-cone model",
                                     "references": ["Tong2009:1.2-1.4", "Wray2011:2-3"]}}
            atomic_write_json(target, result)
            return result

    def read(self, uid: str) -> dict:
        with self.lock:
            path = self._path(uid)
            if not path.is_file():
                raise NotFound("Experiment not found.")
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                validated(data["configuration"])
                _validated_numerical(data.get("numerical"))
                if data.get("quantum") is not None:
                    spectrum(data["quantum"])
                return data
            except (OSError, ValueError, KeyError, TypeError) as exc:
                raise ModelError("Saved experiment is damaged or incompatible.") from exc

    def list(self) -> list[dict]:
        with self.lock:
            items = []
            for path in self.root.glob("*.json"):
                try:
                    item = self.read(path.stem)
                except (ModelError, NotFound):
                    continue
                items.append({k: item[k] for k in ("id", "title", "revision", "updated_utc")})
            return sorted(items, key=lambda x: x["updated_utc"], reverse=True)

    def delete(self, uid: str) -> None:
        with self.lock:
            path = self._path(uid)
            if path.exists():
                path.unlink()
