"""PyInstaller entry point. Keep all science in applications.stringlab and SLAI.

PyInstaller places imported Python packages and --add-data files inside
sys._MEIPASS (usually <backend>/_internal). When frozen, point the standard
SLAI app at those paths; the ordinary python -m launch remains unchanged.
"""
from __future__ import annotations

import sys
from pathlib import Path


def forwarded_arguments(argv: list[str] | None = None) -> list[str]:
    args = list(sys.argv[1:] if argv is None else argv)
    if getattr(sys, "frozen", False):
        root = Path(sys._MEIPASS)  # type: ignore[attr-defined]
        dist = root / "applications" / "stringlab" / "dist"
        config = root / "applications" / "stringlab" / "configs" / "config.yaml"
        required = [root / "src" / "utils" / "sldc.py", dist / "index.html", config]
        missing = [str(p) for p in required if not p.is_file()]
        if missing:
            raise RuntimeError("Incomplete StringLab desktop bundle: " + ", ".join(missing))
        args = ["--slai-root", str(root), "--client-dir", str(dist), "--config", str(config), *args]
    return args


def main() -> int:
    from applications.stringlab.app import main as run
    return run(forwarded_arguments())


if __name__ == "__main__":
    raise SystemExit(main())