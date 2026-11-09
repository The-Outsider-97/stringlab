"""Run with: python -m applications.stringlab [--port 8776]"""
from __future__ import annotations

import argparse
import secrets
import sys
from pathlib import Path

from . import __version__
from .store import ExperimentStore
from .routes import build_router


def main(argv=None) -> int:
    try:
        from applications.tools.server import (LocalServer, Identity, ServerOptions,
                                               add_server_arguments, refuse_remote_host, serve)
        from applications.tools.storage import default_data_dir
        from applications.tools.slai import shared_assets_dir
    except ImportError:
        print("StringLab needs the SLAI v2.4 'applications.tools' package. "
              "Extract stringlab/ into SLAI/applications/ and launch from the SLAI root.", file=sys.stderr)
        return 2
    parser = argparse.ArgumentParser(description="SLAI StringLab")
    add_server_arguments(parser, title="StringLab", default_port=8776)
    parser.add_argument("--check", action="store_true", help="Verify installation and dependencies")
    args = parser.parse_args(argv)
    if refuse_remote_host(args.host, "StringLab"):
        return 2
    dist = Path(args.client_dir or (Path(__file__).resolve().parent / "dist"))
    if not (dist / "index.html").is_file() or not (dist / "app.js").is_file():
        print("StringLab web client is missing. Run 'npm.cmd run build' in applications/stringlab/.", file=sys.stderr)
        return 2
    try:
        import numpy
    except ImportError:
        print("NumPy is required: python -m pip install numpy", file=sys.stderr)
        return 2
    try:
        import reportlab  # noqa: F401
        pdf = True
    except ImportError:
        pdf = False
    try:
        from src.utils import sldc as _sldc
        sldc_ok = callable(_sldc.new_package)
    except ImportError:
        sldc_ok = False
    if args.check:
        from .interop import availability
        formats = availability()
        print(f"StringLab {__version__}: Python {sys.version.split()[0]}, NumPy {numpy.__version__}, "
              f"PDF {'enabled' if pdf else 'dependency missing'}, built web client present, shared tools present")
        print(f"  Native adapters: SGEO {'available' if formats['sgeo'] else 'UNAVAILABLE'}, "
              f"SDRW {'available' if formats['sdrw'] else 'UNAVAILABLE'}")
        if not (pdf and formats['sgeo'] and formats['sdrw']):
            print("  CHECK FAILED: install declared dependencies in the SLAI v2.4 environment and verify native spatial facades.", file=sys.stderr)
            return 2
        return 0
    data = Path(args.data_dir) if args.data_dir else default_data_dir("stringlab", "StringLab")
    class App:
        pass
    app = App()
    app.store = ExperimentStore(data / "experiments")
    app.pdf_available = pdf
    app.sldc_available = sldc_ok
    from .agents import AgentBridge
    app.agents = AgentBridge()
    options = ServerOptions(token=args.token or secrets.token_urlsafe(28), client_dir=dist,
                            host=args.host, port=args.port or 8776,
                            tools_web_dir=Path(__file__).resolve().parent.parent / "tools" / "web",
                            asset_dirs=(Path(__file__).resolve().parent / "assets", shared_assets_dir()),
                            max_body_bytes=2 * 1024 * 1024)
    server = LocalServer(app, Identity("stringlab", "StringLab"), build_router(), options)
    return serve(server, title="SLAI StringLab", version=__version__,
                 url=f"{server.base_url}/?token={options.token}",
                 details=[("Data", str(data)), ("Model", "Light-cone free bosonic"),
                          ("Native 3D", "SGEO/SDRW from SLAI spatial-format facades")],
                 open_browser=not args.no_browser)


if __name__ == "__main__":
    raise SystemExit(main())
