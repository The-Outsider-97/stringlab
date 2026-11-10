"""StringLab application object and entry point (``python -m applications.stringlab``).

Everything that is not string physics comes from ``applications.tools``: the server, the SLAI-root and SLDC discovery, the configuration
repository, the schema-checked preferences file and the default data folder.
"""
from __future__ import annotations

import argparse
import secrets
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from applications.tools import slai
from applications.tools.config import Field, load_section
from applications.tools.errors import AppError
from applications.tools.server import Identity, LocalServer, ServerOptions, add_server_arguments, refuse_remote_host, serve
from applications.tools.storage import Pref, Prefs, default_data_dir
from . import __version__
from .agents import AgentBridge
from .store import ExperimentStore

SLUG, TITLE, DEFAULT_PORT = "stringlab", "StringLab", 8776
HERE = Path(__file__).resolve().parent
DEFAULT_CONFIG = HERE / "configs" / "config.yaml"

SETTINGS_FIELDS = {
    "port": Field(DEFAULT_PORT, 1, 65535),
    "max_request_bytes": Field(8 * 1024 * 1024, 16_384, 8 * 1024 * 1024),
}

#: What a person can set and have remembered between sessions. The scientific content of an experiment is never a preference.
PREF_SCHEMA = {
    "theme": Pref(str, allowed=("system", "light", "dark", "contrast")),
    "scale": Pref(float, low=0.85, high=1.4),
    "motion": Pref(str, allowed=("system", "reduce")),
    "speed": Pref(float, allowed=(0.25, 0.5, 1.0, 2.0, 4.0)),
    "loop": Pref(bool),
    "trail": Pref(int, low=0, high=240),
    "beads": Pref(int, low=0, high=48),
    "camera_mode": Pref(str, allowed=("perspective", "orthographic")),
    "colour_by": Pref(str, allowed=("plain", "speed", "energy", "depth")),
    "show_grid": Pref(bool),
    "show_axes": Pref(bool),
    "show_worldsheet": Pref(bool),
    "auto_orbit": Pref(bool),
    "source": Pref(str, allowed=("solver", "simulation")),
}
PREF_DEFAULTS: dict[str, Any] = {
    "theme": "system", "scale": 1.0, "motion": "system", "speed": 1.0, "loop": True, "trail": 40, "beads": 5, "camera_mode": "perspective",
    "colour_by": "energy", "show_grid": True, "show_axes": True, "show_worldsheet": False, "auto_orbit": False, "source": "solver",
}


@dataclass
class Settings:
    port: int
    max_request_bytes: int
    data_dir: Path
    config_path: Path
    note: str | None = None


def load_settings(config: str | None = None, data_dir: str | None = None, port: int | None = None) -> Settings:
    path = Path(config) if config else DEFAULT_CONFIG
    values, note = load_section(path, "app", SETTINGS_FIELDS, label="StringLab configuration", overrides={"port": port})
    return Settings(data_dir=Path(data_dir) if data_dir else default_data_dir(SLUG, TITLE), config_path=path, note=note, **values)


class StringLabApp:
    def __init__(self, settings: Settings, store: ExperimentStore, prefs: Prefs, root: Path | None, *, pdf: bool, sldc: bool) -> None:
        self.settings = settings
        self.store = store
        self.prefs = prefs
        self.root = root
        self.pdf_available = pdf
        self.sldc_available = sldc
        self.agents = AgentBridge()

    def preferences(self) -> dict[str, Any]:
        return {**PREF_DEFAULTS, **self.prefs.snapshot()}

    def notices(self) -> list[dict[str, str]]:
        found: list[dict[str, str]] = []
        if self.settings.note:
            found.append({"kind": "info", "text": self.settings.note})
        if self.prefs.recovered:
            found.append({"kind": "warn", "text": self.prefs.recovered})
        if self.root is None:
            found.append({"kind": "warn", "text": "The SLAI checkout was not found, so SGEO/SDRW/SLDC export and the SLAI agents are unavailable. "
                                                    "Start StringLab inside the SLAI folder or pass --slai-root."})
        return found


def check(app_root: Path | None) -> int:
    import numpy
    from .interop import availability
    try:
        import reportlab  # noqa: F401
        pdf = True
    except ImportError:
        pdf = False
    formats = availability()
    print(f"StringLab {__version__}: Python {sys.version.split()[0]}, NumPy {numpy.__version__}, PDF {'enabled' if pdf else 'dependency missing'}, "
          f"SLAI {app_root or 'NOT FOUND'}")
    print(f"  Native adapters: SGEO {'available' if formats['sgeo'] else 'UNAVAILABLE'}, SDRW {'available' if formats['sdrw'] else 'UNAVAILABLE'}, "
          f"SLDC {'available' if slai.sldc_info()['available'] else 'UNAVAILABLE'}")
    bridge = AgentBridge()
    for row in bridge.status()["agents"]:
        print(f"  {row['label']}: {'available' if row['available'] else 'UNAVAILABLE (' + str(row.get('reason')) + ')'}")
    if not (pdf and formats["sgeo"] and formats["sdrw"]):
        print("  CHECK FAILED: install the declared dependencies in the SLAI environment and verify the native spatial facades.", file=sys.stderr)
        return 2
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m applications.stringlab", description=f"{TITLE}: classical and quantum string physics.")
    add_server_arguments(parser, title=TITLE, default_port=DEFAULT_PORT)
    parser.add_argument("--check", action="store_true", help="verify the installation and the SLAI agents, then exit")
    args = parser.parse_args(argv)
    if refuse_remote_host(args.host, TITLE, "your experiments"):
        return 2
    root = slai.activate(slai.find_slai_root(args.slai_root))
    if args.check:
        return check(root)
    try:
        import numpy  # noqa: F401
    except ImportError:
        print("NumPy is required: python -m pip install numpy", file=sys.stderr)
        return 2
    client_dir = Path(args.client_dir) if args.client_dir else HERE / "dist"
    entry = client_dir / "js" / "stringlab" / "src" / "client" / "main.js"
    if not (client_dir / "index.html").is_file() or not entry.is_file():
        print(f"The web client is not built ({entry} is missing). Run `npm run build` in {HERE}.", file=sys.stderr)
        return 2
    try:
        settings = load_settings(args.config, args.data_dir, args.port)
        try:
            import reportlab  # noqa: F401
            pdf = True
        except ImportError:
            pdf = False
        app = StringLabApp(settings, ExperimentStore(settings.data_dir / "experiments"),
                           Prefs(settings.data_dir / "prefs.json", PREF_SCHEMA), root, pdf=pdf, sldc=bool(slai.sldc_info()["available"]))
        from .routes import build_router
        options = ServerOptions(token=args.token or secrets.token_urlsafe(32), client_dir=client_dir, host=args.host, port=settings.port,
                                tools_web_dir=slai.applications_dir() / "tools" / "web",
                                asset_dirs=(HERE / "assets", slai.shared_assets_dir()), max_body_bytes=settings.max_request_bytes)
        server = LocalServer(app, Identity(SLUG, TITLE), build_router(), options)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 2
    except AppError as exc:
        print(f"{exc.message} {exc.hint or ''}".strip(), file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"{TITLE} could not start: {exc.strerror or exc}. Is another copy already running? Try --port.", file=sys.stderr)
        return 1
    return serve(server, title=f"SLAI {TITLE}", version=__version__, url=f"{server.base_url}/?token={options.token}",
                 details=[("Data", str(settings.data_dir)), ("SLAI", str(root) if root else "not found"),
                          ("Model", "Light-cone free bosonic, quantum spectra, covariant and nonlinear dynamics")],
                 notes=[n["text"] for n in app.notices()], open_browser=not args.no_browser)
