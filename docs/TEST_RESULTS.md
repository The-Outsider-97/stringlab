# Observed local verification evidence — 2026-11-09

**Test environment**: Linux sandbox, CPython 3.13.5, NumPy and ReportLab installed; global TypeScript 5.8.x and Node 22. **This is not the user's Windows SLAI v2.4 checkout.** No assertion in this document implies that the real SLAI server, native SGEO runtime or SLAI agents have been executed here.

## Executed checks

```text
PYTHONPATH=/mnt/data python -m pytest /mnt/data/stringlab/tests -q
ssss................................
32 passed, 4 skipped
```

The four skipped tests require `src.utils.sgeo`, `src.utils.sdrw`, and `applications.tools.server` from a full SLAI v2.4 installation. A skip is neither a pass nor a failure. On a release workstation, all four are **mandatory** and must pass unskipped.

```text
cd /mnt/data/stringlab && tsc -p tsconfig.build.json
# Exit status: 0; generated dist/app.js
```

A Chromium browser DOM-only smoke test succeeded with **no JavaScript errors** after loading the actual HTML/CSS/compiled JavaScript and providing computed results from the Python models through a mocked `fetch` implementation. It tested 12-preset rendering, initial curve/viewport, a closed-string preset, charts, quantum spectrum, T-duality, a parameter sweep, the export dialog and play/pause. Actual HTTP navigation to localhost was blocked by sandbox policy, so **no real local HTTP server or token-cookie authentication was tested by this exercise**.

ReportLab generated a scientific PDF from the genuine analytical string model. `pypdf` parsed the PDF, and the first two pages were rasterized and manually inspected. This verifies basic formatting **in this environment**, not PDF interoperability in SLAI Writer or Documaster.

## Native-format status

The application code calls the inspected SLAI v2.4 public `SGEODocument` and `SDRWDocument` facade APIs, validates the output, and parses its own produced bytes. **Those operations have not been run here because the SLAI checkout is not mounted.** Only source-level signature matching and conditional executable tests were prepared.

## Required release evidence still missing

- Actual `python -m applications.stringlab --check` success from the Windows SLAI v2.4 installation.
- Four native integration tests run without skips (including real authenticated local API).
- SGEO and SDRW exported files opened independently by the installed SLAI code / SPADRA / CADCon.
- Windows browser interaction check on supported resolutions and themes.
- Windows solver and renderer benchmark with actual machine specs.
- Optional model-facing SLAI agents: **not connected**, no agent test result.
