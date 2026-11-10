# StringLab Desktop — Tauri 2 (Windows)

**Status:** source-level desktop integration. This is not yet a signed or Windows-validated installer. Build and verify it on Windows before distribution. **Android and iOS are not supported by this Python/NumPy packaging path.** Tauri's mobile shell does not make a PyInstaller Windows executable run on phones.

## Architecture — no new StringLab API

- The normal `python -m applications.stringlab` launch, Python solvers, scientific reports, native SGEO/SDRW/SLDC facades, agent hub, tests and shared SLAI interface remain unchanged.
- Rust owns one backend child process. In **development** it runs `<SLAI>/venv/Scripts/python.exe -m applications.stringlab`; in **release** it runs the bundled `backend/stringlab-backend.exe` produced by PyInstaller **onedir**. It never starts an arbitrary executable supplied by browser content.
- The existing SLAI HTTP server binds **127.0.0.1** on a short-lived, dynamically chosen port with a 256-bit session token. The token is passed as a *child environment variable*, not a command-line argument; the server already exchanges it for a SameSite/HttpOnly cookie and enforces origin, host and mutation marker rules.
- The Rust host checks the expected HTTP 302 and the exact session cookie, then navigates its native WebView2 window to the local server. While waiting, it displays a packaged splash. A backend error appears on that splash and stderr is written to the user's StringLab app log directory (without printing the launch token).
- On normal application exit, Rust kills and waits for its child. There is no Tauri shell plugin, webview file-system permission or remote Tauri IPC capability. The scientific page remains subject to the SLAI server's existing CSP.
- Experiments and preferences stay in `%LOCALAPPDATA%/SLAI/StringLab`, surviving reinstall. The official `SLAI_ROOT` checkout is used only in dev; the packaged build includes the necessary SLAI modules and assets. Trained model files or external research datasets **not explicitly included** in the PyInstaller bundle remain optional; run the agent status panel on the installed app to verify actual support.

## Prerequisites (on Windows)

1. Your current SLAI checkout with StringLab cloned as `G:\GAIA\AI\SLAI\applications\stringlab`.
2. Rust stable via [rustup](https://rustup.rs/) and Microsoft C++ Build Tools with *Desktop development with C++* and the Windows SDK. Restart PowerShell after installation. Check `rustc --version`, `cargo --version`.
3. Node.js/npm, the existing SLAI virtual environment, and its Python numerical dependencies. Build the client as usual using the shared SLAI `applications/tools/build` helper.
4. `python -m pip install "pyinstaller>=6,<7"` in **that same SLAI venv** for a self-contained distribution. `npm` fetches Tauri 2 CLI on first use; no duplicate frontend framework is installed.

## Development: open a native desktop window

```powershell
cd G:\GAIA\AI\SLAI
.\venv\Scripts\Activate.ps1
cd applications\stringlab
npm.cmd ci
npm.cmd run desktop:dev
```

This generates the provisional native icon, rebuilds TypeScript and opens Tauri. Rust starts the **existing** local Python application; do not launch `python -m applications.stringlab` yourself at the same time. Set `$env:SLAI_ROOT="G:\GAIA\AI\SLAI"` when launched outside the checkout. To force a particular interpreter, set `$env:STRINGLAB_PYTHON` to its full path.

## Release: build installable `.exe`

```powershell
cd G:\GAIA\AI\SLAI
.\venv\Scripts\Activate.ps1
python -m pip install "pyinstaller>=6,<7"
cd applications\stringlab
npm.cmd ci
npm.cmd run desktop:build
```

The build performs these steps in order:

1. `npm run build` compiles the existing StringLab client and shared SLAI UI kit.
2. `desktop/make_icons.py` generates temporary placeholder application icons. Replace with the official licensed SLAI icon before a production release.
3. `desktop/build_backend.py` builds `desktop/backend-dist/stringlab-backend/` with PyInstaller, carrying StringLab, SLAI native-format facades, shared server/UI and selected agent modules. Its **frozen** entry point passes the correct resource paths to the unchanged Python application. `--check` runs against the packaged executable, and a failed check aborts the build.
4. Tauri's Windows-only resource mapping copies that PyInstaller directory to the installer resource folder. The Rust host launches `backend/stringlab-backend.exe` directly, with no user-installed Python required.
5. Tauri builds an NSIS per-user installer under `src-tauri/target/release/bundle/nsis/`.

**Do not confuse the generated installer with a verified release.** Native WebView2, PyInstaller hidden imports, NumPy DLL loading, HTTP authentication, native export round trips and agents must pass on a clean Windows VM before users receive it.

## Windows acceptance tests

```powershell
cd G:\GAIA\AI\SLAI
python -m pytest applications\stringlab\tests -v
python -m pytest applications\stringlab\desktop\tests -v
cd applications\stringlab
npm.cmd test
npm.cmd run typecheck
npm.cmd run desktop:build
```

Install the NSIS `.exe` on another Windows 10/11 account or VM that has **no Python or SLAI checkout**. Confirm: one native app window opens, no browser starts, no terminal window is visible, experiment save and reopen works, every scientific simulation mode runs, the 3D renderer falls back to canvas2d if WebGL2 fails, `.sgeo/.sdrw/.sldc/.pdf` export works, app can close and reopen without orphaned backend processes, and no failed HTTP/JS requests appear in the console. Inspect the *SLAI agents* panel and verify available agents individually. Check Windows Defender and code-sign releases.

The Tauri host does **not** duplicate or rewrite the SLAI server or the Python physics solvers. Windows resource paths are versioned under the installer; user data is never written to `Program Files` or the bundled backend.

## Mobile scope

Android/iOS must use a **separately implemented and numerically cross-validated** engine (e.g. portable Rust/WASM core, or an explicitly managed remote compute service). The current Rust entry point intentionally does not start a nonexistent Python backend on mobile. Do not label an Android APK or iOS IPA as offline-capable until SGEO/SDRW/SLDC, exports and the simulation runtime are implemented and tested on those platforms.