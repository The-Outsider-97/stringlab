"""Real SLAI v2.4 integration tests; skips without the checkout.

A skip is *not* evidence that an SGEO/SDRW export is verified.
These tests must all run on the Windows SLAI release workstation.
"""
from __future__ import annotations

import io
import json
import threading
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

import pytest

from stringlab.physics import template
from stringlab.interop import export_sgeo, export_sdrw, inspect_native


def test_real_sgeo_round_trip_and_projection_semantics():
    sgeo = pytest.importorskip("src.utils.sgeo")
    data = export_sgeo(template("open"))
    assert data.startswith(b"PK")
    doc = sgeo.SGEODocument.from_bytes(data, mode="read")
    doc.validate(mode="strict", raise_on_error=True)
    detail = inspect_native(data, "sgeo")
    assert detail["inspection"]["format_id"] == "slai.sgeo"


def test_real_sgeo_projected_worldsheet():
    sgeo = pytest.importorskip("src.utils.sgeo")
    data = export_sgeo(template("closed"), worldsheet=True)
    doc = sgeo.SGEODocument.from_bytes(data, mode="read")
    doc.validate(mode="strict", raise_on_error=True)
    assert doc.inspect()["format_id"] == "slai.sgeo"


def test_real_sdrw_round_trip_and_inspection():
    sdrw = pytest.importorskip("src.utils.sdrw")
    data = export_sdrw(template("open"))
    assert data.startswith(b"PK")
    doc = sdrw.SDRWDocument.from_bytes(data, mode="read")
    doc.validate(mode="strict", raise_on_error=True)
    detail = inspect_native(data, "sdrw")
    assert detail["inspection"]["format_id"] == "slai.sdrw"


def test_real_local_server_authenticated_api(tmp_path):
    server_mod = pytest.importorskip("applications.tools.server")
    from stringlab.routes import build_router
    from stringlab.store import ExperimentStore

    class App:
        store = ExperimentStore(tmp_path / "experiments")
        pdf_available = False
        sldc_available = False
        class Agents:
            def status(self): return {"available":False}
        agents = Agents()

    options = server_mod.ServerOptions(token="verified-local-token", client_dir=Path(__file__).resolve().parents[1]/"dist",
                                      host="127.0.0.1", port=0,
                                      tools_web_dir=Path(__file__).resolve().parents[2]/"tools"/"web")
    server = server_mod.LocalServer(App(), server_mod.Identity("stringlab", "StringLab"), build_router(), options)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        jar = CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        with opener.open(f"{server.base_url}/?token={options.token}", timeout=5) as resp:
            assert resp.status == 200
        with opener.open(f"{server.base_url}/api/status", timeout=5) as resp:
            status = json.load(resp)
            assert status["ok"] is True
            assert "formats" in status["data"]
        payload = json.dumps({"configuration": template("open"), "frames": 3}).encode()
        req = urllib.request.Request(f"{server.base_url}/api/series", method="POST", data=payload,
                                     headers={"Content-Type": "application/json", "X-SLAI-Stringlab": "1"})
        with opener.open(req, timeout=10) as resp:
            result = json.load(resp)
            assert len(result["data"]) == 3
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
