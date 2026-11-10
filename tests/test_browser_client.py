"""Real-browser test of the StringLab client.

Boots the built client (``dist/``) against a live StringLab server in Chromium and drives the interactions a person would: every preset, parameter
edits, playback, orbit/zoom/pan/pick in the 3D viewport, the SLAI agents panel, the dialogs, the 2D fallback renderer and a narrow layout.
**Any console error, page error or failed request fails the test**, because the strict CSP means a violation shows up only there.

Skipped (not failed) when Playwright, a launchable Chromium or the built ``dist/`` is missing. Set ``CHROMIUM_PATH`` to use a specific browser.
WebGL runs on the software rasteriser when there is no GPU, so this checks behaviour and absence of errors, not pixels.
"""
from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest

playwright_sync = pytest.importorskip("playwright.sync_api")

ROOT = Path(__file__).resolve().parents[3]
DIST = Path(__file__).resolve().parents[1] / "dist" / "js" / "stringlab" / "src" / "client" / "main.js"
TOKEN = "browsertest"
IGNORED = ("GL Driver Message", "GPU stall", "Automatic fallback to software WebGL")


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def server(tmp_path_factory):
    if not DIST.exists():
        pytest.skip("dist/ is not built (run `npm run build` in applications/stringlab)")
    port = free_port()
    data = tmp_path_factory.mktemp("stringlab-data")
    proc = subprocess.Popen([sys.executable, "-m", "applications.stringlab", "--port", str(port), "--token", TOKEN, "--data-dir", str(data), "--no-browser"],
                            cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(150):
            if proc.poll() is not None:
                pytest.fail("server exited early: " + (proc.stdout.read() if proc.stdout else ""))
            try:
                socket.create_connection(("127.0.0.1", port), timeout=1).close()
                break
            except OSError:
                time.sleep(0.2)
        else:
            pytest.fail("server did not start")
        yield base
    finally:
        proc.terminate()
        try:
            proc.wait(5)
        except subprocess.TimeoutExpired:
            proc.kill()


@pytest.fixture(scope="module")
def browser():
    with playwright_sync.sync_playwright() as pw:
        try:
            b = pw.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH"),
                                   args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"])
        except Exception as error:  # no browser installed
            pytest.skip(f"Chromium is not available: {error}")
        yield b
        b.close()


class Session:
    def __init__(self, browser, base, query="", width=1500, height=900):
        self.context = browser.new_context(viewport={"width": width, "height": height}, accept_downloads=True)
        self.page = self.context.new_page()
        self.problems: list[str] = []
        self.page.on("console", lambda m: self.problems.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") and not any(i in m.text for i in IGNORED) else None)
        self.page.on("pageerror", lambda e: self.problems.append(f"pageerror: {e}"))
        self.page.on("response", lambda r: self.problems.append(f"HTTP {r.status} {r.url}") if r.status >= 400 else None)
        self.page.goto(f"{base}/?token={TOKEN}")  # the token is exchanged for a cookie and the URL redirected, so a query goes on afterwards
        if query:
            self.page.goto(f"{base}/{query}")
        self.until("() => !!window.stringlab && window.stringlab.store.frames.length > 0", 60)

    def until(self, fn: str, seconds: float = 20):
        deadline = time.time() + seconds
        while time.time() < deadline:
            if self.page.evaluate(fn):
                return
            self.page.wait_for_timeout(100)
        raise AssertionError(f"timed out waiting for {fn}; problems so far: {self.problems}")

    def js(self, fn: str, arg=None):
        return self.page.evaluate(fn, arg) if arg is not None else self.page.evaluate(fn)

    def settle(self):
        self.until("() => window.stringlab.store.status !== null && !window.stringlab.store.busy", 60)

    def check(self):
        assert not self.problems, "\n".join(self.problems)

    def close(self):
        self.context.close()


@pytest.fixture()
def session(browser, server):
    made: list[Session] = []

    def make(**kw):
        s = Session(browser, server, **kw)
        made.append(s)
        return s
    yield make
    for s in made:
        s.close()


def test_boot_renders_with_webgl_and_no_errors(session):
    s = session()
    assert s.js("() => window.stringlab.shell.viewport.kind") == "webgl2"
    assert s.js("() => window.stringlab.store.frames.length") > 10
    assert s.page.locator(".viewport canvas").count() >= 1
    assert s.page.locator("button.preset").count() == 12
    s.check()


def test_every_preset_loads_and_plays(session):
    s = session()
    for index in range(12):
        s.page.locator("button.preset").nth(index).click()
        s.until("() => window.stringlab.store.frames.length > 0 && !window.stringlab.store.busy", 90)
        frames = s.js("() => window.stringlab.store.frames.length")
        assert frames > 0, f"preset {index + 1} produced no frames"
        s.js("() => window.stringlab.store.seekTo(window.stringlab.store.lastTime * 0.6)")
        s.page.wait_for_timeout(80)
    s.check()


def test_parameter_edit_recomputes(session):
    s = session()
    before = s.js("() => window.stringlab.store.revision")
    s.js("() => window.stringlab.store.edit((c) => { c.alpha_prime = 0.5; }, true)")
    s.until(f"() => window.stringlab.store.revision > {before} && !window.stringlab.store.busy", 60)
    assert s.js("() => window.stringlab.store.config.alpha_prime") == 0.5
    s.check()


def test_playback_and_transport(session):
    s = session()
    s.page.click("button.play")
    s.page.wait_for_timeout(1200)
    assert s.js("() => window.stringlab.store.position") > 0.3
    s.page.click("button.play")
    assert s.js("() => window.stringlab.store.clock.playing") is False
    s.js("() => window.stringlab.store.seekTo(0)")
    s.js("() => window.stringlab.store.step(1)")
    assert s.js("() => window.stringlab.store.position") > 0
    s.check()


def test_viewport_orbit_zoom_pan_fit_and_pick(session):
    s = session()
    box = s.page.locator(".viewport").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    cam0 = s.js("() => ({...window.stringlab.shell.viewport.camera})")
    s.page.mouse.move(cx, cy)
    s.page.mouse.down()
    s.page.mouse.move(cx + 120, cy + 40, steps=8)
    s.page.wait_for_timeout(150)  # hold so the release carries no inertia
    s.page.mouse.up()
    s.page.wait_for_timeout(300)
    cam1 = s.js("() => ({...window.stringlab.shell.viewport.camera})")
    assert abs(cam1["yaw"] - cam0["yaw"]) > 0.05
    s.page.mouse.wheel(0, -300)
    s.page.wait_for_timeout(300)
    assert s.js("() => window.stringlab.shell.viewport.camera.distance") < cam1["distance"]
    s.page.focus(".viewport")
    s.page.keyboard.press("f")
    s.page.wait_for_timeout(700)
    for key, name in (("1", "front"), ("2", "side"), ("3", "top"), ("4", "iso")):
        s.page.keyboard.press(key)
        s.page.wait_for_timeout(500)
    s.page.keyboard.press("0")
    s.page.wait_for_timeout(500)
    point = s.js("() => window.stringlab.shell.viewport.projectVertex(40)")
    s.page.mouse.click(box["x"] + point["x"], box["y"] + point["y"])
    s.page.wait_for_timeout(250)
    assert s.js("() => window.stringlab.store.probe") is not None
    png = s.js("async () => (await window.stringlab.shell.viewport.snapshot()).size")
    assert png > 1000
    s.check()


def test_toolbar_toggles_and_themes(session):
    s = session()
    for label in ("Grid", "Axes", "Worldsheet", "Orthographic camera"):
        s.page.locator(f'.toolbar [aria-label^="{label}"]').click()
        s.page.wait_for_timeout(120)
    for theme in ("light", "dark", "contrast", "system"):
        s.js("(t) => window.stringlab.store.setPrefs({ theme: t })", theme)
        s.page.wait_for_timeout(150)
    for mode in ("plain", "speed", "energy", "depth"):
        s.js("(m) => window.stringlab.store.setPrefs({ colour_by: m })", mode)
        s.page.wait_for_timeout(100)
    s.check()


def test_every_tab_opens(session):
    s = session()
    for tab in ("results", "plots", "math", "quantum", "analysis", "compare", "advanced", "dynamics", "agents"):
        s.page.click(f"#tab-{tab}")
        s.page.wait_for_timeout(300)
        assert s.page.locator("#panel, [role=tabpanel]").first.inner_text().strip()
    s.check()


def test_agents_panel_actions(session):
    s = session()
    s.page.click("#tab-agents")
    s.page.wait_for_timeout(300)
    roster = s.page.locator(".agent-list").inner_text()
    if "STEM Agent" not in roster or "available" not in roster:
        pytest.skip("SLAI agents are not importable in this checkout")
    s.page.get_by_role("button", name="Verify with the STEM Agent").click()
    s.page.locator("text=Energy by independent quadrature").wait_for(timeout=30000)
    s.page.get_by_role("button", name="Convert").click()
    s.page.locator("text=/= .* km/").wait_for(timeout=15000)
    s.page.get_by_role("button", name="Build tracks").click()
    s.until("() => window.stringlab.store.animation !== null", 30)
    assert s.js("() => window.stringlab.store.animation.beads.length") >= 1
    s.page.get_by_role("button", name="Publish diagnostics").click()
    s.page.wait_for_timeout(800)
    with s.page.expect_download() as info:
        s.page.get_by_role("button", name="Export animated .sgeo").click()
    assert info.value.suggested_filename.endswith(".sgeo")
    s.page.get_by_role("button", name="Run now as a rollout").click()
    s.page.locator("text=identical to the direct solver").wait_for(timeout=60000)
    s.check()


def test_dialogs_open_and_close(session):
    s = session()
    for button, title in (("Export", "Export"), ("Library", "Saved experiments"), ("Open", "Open native geometry")):
        s.page.locator("header.topbar").get_by_role("button", name=button, exact=True).click()
        s.page.locator("dialog[open]").wait_for(timeout=5000)
        assert title in s.page.locator("dialog[open]").inner_text()
        s.page.keyboard.press("Escape")
        s.page.locator("dialog[open]").wait_for(state="detached", timeout=5000)
    s.page.locator("header.topbar").get_by_label("Settings").click()
    s.page.locator("dialog[open]").wait_for(timeout=5000)
    s.page.keyboard.press("Escape")
    s.page.keyboard.press("?")
    s.page.locator("dialog[open]").wait_for(timeout=5000)
    s.page.keyboard.press("Escape")
    s.check()


def test_save_and_reopen_experiment(session):
    s = session()
    s.page.locator("header.topbar").get_by_role("button", name="Save", exact=True).click()
    s.page.locator("dialog[open] input").first.fill("browser test experiment")
    s.page.locator("dialog[open]").get_by_role("button", name="Save").click()
    s.until("() => window.stringlab.store.savedId !== null && window.stringlab.store.savedId !== undefined", 20)
    s.page.get_by_role("button", name="browser test experiment").first.wait_for(timeout=10000)
    s.check()


def test_canvas2d_fallback_renders_and_interacts(session):
    s = session(query="?renderer=2d")
    assert s.js("() => window.stringlab.shell.viewport.kind") == "canvas2d"
    s.page.click("button.play")
    s.page.wait_for_timeout(500)
    s.page.click("button.play")
    box = s.page.locator(".viewport").bounding_box()
    s.page.mouse.move(box["x"] + 200, box["y"] + 200)
    s.page.mouse.down()
    s.page.mouse.move(box["x"] + 260, box["y"] + 230, steps=5)
    s.page.mouse.up()
    s.check()


def test_narrow_layout_uses_drawers(session):
    s = session(width=700, height=900)
    s.page.get_by_role("button", name="Experiments", exact=True).click()
    assert s.page.locator(".work").get_attribute("data-open") == "library"
    s.page.locator("button.preset").nth(1).click()
    assert s.page.locator(".work").get_attribute("data-open") is None
    s.page.get_by_role("button", name="Parameters", exact=True).click()
    assert s.page.locator(".work").get_attribute("data-open") == "inspector"
    assert s.page.evaluate("() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1")
    s.check()
