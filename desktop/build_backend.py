"""Build a self-contained Windows PyInstaller onedir backend for Tauri 2.

Requires an activated SLAI virtual environment and the full SLAI checkout.
This does not copy agent logic; PyInstaller analyses the existing Python packages.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

STRINGLAB = Path(__file__).resolve().parents[1]
SLAI = STRINGLAB.parents[1]
ENTRY = STRINGLAB / "desktop" / "backend_entry.py"
OUTPUT = STRINGLAB / "desktop" / "backend-dist"


def require_source() -> None:
    needed = [
        SLAI / "applications" / "tools" / "server" / "http.py",
        SLAI / "applications" / "tools" / "web" / "slai-ui.css",
        SLAI / "src" / "utils" / "sldc.py",
        STRINGLAB / "dist" / "index.html",
        STRINGLAB / "dist" / "js" / "stringlab" / "src" / "client" / "main.js",
        STRINGLAB / "configs" / "config.yaml",
    ]
    missing = [str(p) for p in needed if not p.is_file()]
    if missing:
        raise FileNotFoundError("SLAI checkout or StringLab build is incomplete:\n" + "\n".join(missing))


def command() -> list[str]:
    """Return a testable, platform-independent PyInstaller invocation."""
    sep = os.pathsep
    args = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir", "--console",
            "--name", "stringlab-backend", "--paths", str(SLAI),
            "--distpath", str(OUTPUT),
            "--workpath", str(STRINGLAB / "desktop" / ".build"),
            "--specpath", str(STRINGLAB / "desktop" / ".build")]
    resources = (
        (STRINGLAB / "dist", "applications/stringlab/dist"),
        (STRINGLAB / "configs", "applications/stringlab/configs"),
        (SLAI / "applications" / "tools" / "web", "applications/tools/web"),
        (SLAI / "src" / "utils" / "sldc.py", "src/utils"),
        (SLAI / "src" / "utils" / "spatial_formats" / "schemas", "src/utils/spatial_formats/schemas"),
    )
    for source, destination in resources:
        args.extend(["--add-data", f"{source}{sep}{destination}"])
    for optional, destination in (
        (SLAI / "applications" / "assets", "applications/assets"),
        (SLAI / "configs", "configs"),
    ):
        if optional.exists():
            args.extend(["--add-data", f"{optional}{sep}{destination}"])
    for module in (
        "applications.stringlab.routes", "src.utils.sgeo", "src.utils.sdrw", "src.utils.sldc",
        "src.agents.stem_agent", "src.agents.simulation_agent", "src.agents.animation_agent",
        "src.agents.collaborative.shared_memory",
    ):
        args.extend(["--hidden-import", module])
    args.extend(["--collect-submodules", "applications.tools", "--collect-data", "src.utils.spatial_formats"])
    args.append(str(ENTRY))
    return args


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--print-command", action="store_true", help="inspect the precise packaging invocation")
    args = parser.parse_args(argv)
    require_source()
    if sys.platform != "win32" and not args.print_command:
        parser.error("Build the Windows Python binary on Windows inside the SLAI venv.")
    cmd = command()
    if args.print_command:
        print(subprocess.list2cmdline(cmd))
        return 0
    try:
        __import__("PyInstaller")
    except ImportError as exc:
        raise SystemExit("Install PyInstaller in the SLAI venv: python -m pip install 'pyinstaller>=6,<7'") from exc
    subprocess.run(cmd, cwd=SLAI, check=True)
    exe = OUTPUT / "stringlab-backend" / "stringlab-backend.exe"
    if not exe.is_file():
        raise RuntimeError(f"PyInstaller did not create {exe}")
    # Basic packaged adapter availability; native round trips are release acceptance tests.
    subprocess.run([str(exe), "--check"], cwd=SLAI, check=True, timeout=120)
    print(f"Bundled StringLab backend: {exe}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())