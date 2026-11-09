# SLAI v2.4 integration contract and release verification

## Verified by source inspection

The connected GitHub repository `The-Outsider-97/SLAI`, branch `SLAI-v.2.4`, contains public modules `src.utils.sgeo.SGEODocument` and `src.utils.sdrw.SDRWDocument`, and shared application infrastructure `applications.tools`. The inspected public facades provide `new`, `add_segment`, `add_mesh` (SGEO), `add_polyline`, `add_line`, `add_point` (SDRW), `attach_semantics`, `validate`, `dumps`, `from_bytes` and `inspect`. The server exposes `applications.tools.server.LocalServer`, `Identity`, `ServerOptions`, `Router`, `add_server_arguments`, `serve`, `file_response`. Shared storage provides `atomic_write_json` and `default_data_dir`. StringLab consumes these verified **names** and **call signatures**, not a private copy of the native formats.

The current sandbox did **not** mount a complete SLAI v2.4 checkout. Consequently the source API matches were inspected, but the actual native format import/export and HTTP server startup have **not yet been tested against those exact files**. The developer should execute the following end-to-end checklist before classifying StringLab as an integrated release.

## Public compatibility boundaries

**SGEO**: For export, use `SGEODocument.new(..., unit="m")`; add a namespaced semantics-bearing group, connected curve `add_segment` geometry and optional tessellated worldsheet `add_mesh`. Call strict validation, serialize, immediately parse using `SGEODocument.from_bytes`, and validate again. It is a native 3D *projection*, not a stored D-dimensional field. User should retain `.json` as the scientific source of truth.

**SDRW**: Use `SDRWDocument.new(..., unit="m")`, add a layer, create an editable 2D polyline or point and attach namespaced scientific semantics. Strict validation and in-memory round trip are required. A visual projection with `σ` is a dimensionless-parameter diagram whose SGEO/SDRW metre unit is *purely interchange scaling*.

**HTTP and security**: `LocalServer` with `ServerOptions` uses loopback-only host restriction, session cookies, cross-origin protection and request validation from shared tools; StringLab only registers app-specific routes. The frontend includes `X-SLAI-Stringlab` write-request marker. No remote service, unrestricted Python formula execution, or raw materialized cloud dependency is required.

**Shared design system**: `index.html` refers to `/tools/slai-ui.css`, which is served by the shared SLAI server. Its own `styles.css` is application-specific. The frontend currently uses a **local software-canvas projection of server-returned mathematical curves**, not the canonical interactive SGEO model renderer; no overlapping native 3D format is created. Migrating the canvas to the actual SGEO viewport is future work.

**AI agents**: No direct call is made to SLAI's STEM/Simulation/Spatial/Verification/Language/Provenance agents or Shared Memory. Avoid suggesting these are connected. Their implementation and configuration must be inspected and integration tested before wiring them into the deterministic workflow; current application works without AI.

## Actual pre-release target-environment checklist (not yet executed)

1. Confirm branch `SLAI-v.2.4` checked out; verify `python` runs a compatible version and can import `applications.tools`, `src.utils.sgeo`, and `src.utils.sdrw`.
2. `python -m applications.stringlab --check`; check optional PDF and native format statuses in `/api/status`.
3. `python -m pytest applications/stringlab/tests -q` including the conditional native integration tests; those must **not skip** on a release workstation.
4. Build the frontend (`npm.cmd install`, `npm.cmd run typecheck`, `npm.cmd run build`) and verify **resulting** `dist/app.js` exists and works with `dist/index.html`.
5. Launch `python -m applications.stringlab`, open the authenticated browser URL, inspect a classical string, change boundary and solver, play/seek the timeline, and check client/server console errors.
6. Export SGEO (curve and worldsheet), SDRW, CSV, JSON and PDF; reopen SGEO/SDRW independently with their native facades and then SPADRA or CADCon. Verify that the object identifiers, axes, metadata and projected geometry survived.
7. Save a quantum preset, reopen and confirm its radius, winding and occupations; verify revision-conflict rejection with two conflicting browser sessions.
8. Run a high-mode invalid closure state, an invalid endpoint condition, a numerical CFL-limited scenario, malformed input and a corrupt native archive; verify specific diagnostics and no corruption.
9. Check Windows high-DPI, small windows, keyboard input, long expressions, theme/contrast, offline startup and loopback access restrictions.
10. Repeat on the actual target Python/Node versions and record observed performance metrics. Do not mark a requirement complete based on the above checklist alone.

## Dependency and build details

Required Python package: `numpy`. Required to deliver PDF output: `reportlab`. Runtime requires SLAI v2.4's shared application infrastructure. The web code is plain TypeScript and browser Canvas 2D, compiled with TypeScript 5.8+; `dist/` is shipped. No third-party browser JS dependencies and no non-local HTTP API.

## Known gaps

No SLDC backend, no built-in document-editing integration, no collaborative Shared Memory workflow, no agent integration, no native SGEO viewport, no SGEO-to-initial-state physical inverse solve, no direct Dp-brane geometry/dynamics, no Calabi–Yau, no superstring, and no complete theoretical action/constraint solver. The UI intentionally flags the physically limited quantum and dimensional tools rather than inventing functionality.
