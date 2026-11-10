"""Run with: python -m applications.stringlab [--port 8776]"""
from __future__ import annotations

import sys

from .app import main

if __name__ == "__main__":
    sys.exit(main())
