//! Windows desktop host for the existing SLAI StringLab Python service.
//!
//! The Tauri splash is local. After a *verified* loopback token exchange the
//! webview navigates to the unchanged, authenticated SLAI server. No shell
//! plugin, broad filesystem permissions, remote URLs or duplicate physics API.

#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
mod windows_desktop {
    use std::{
        fs::{self, OpenOptions},
        io::{Read, Write},
        net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream},
        path::{Path, PathBuf},
        process::{Child, Command, Stdio},
        sync::Mutex,
        thread,
        time::{Duration, Instant},
    };
    use std::os::windows::process::CommandExt;
    use tauri::{Manager, Url};
    use uuid::Uuid;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const STARTUP_TIMEOUT: Duration = Duration::from_secs(65);
    const TOKEN_ENV: &str = "STRINGLAB_TAURI_TOKEN";

    #[derive(Default)]
    struct BackendState(Mutex<Option<Child>>);

    fn find_slai_root() -> Result<PathBuf, String> {
        let mut candidates = Vec::new();
        if let Ok(explicit) = std::env::var("SLAI_ROOT") {
            candidates.push(PathBuf::from(explicit));
        }
        if let Ok(cwd) = std::env::current_dir() {
            candidates.extend(cwd.ancestors().map(Path::to_path_buf));
        }
        if let Ok(exe) = std::env::current_exe() {
            candidates.extend(exe.ancestors().map(Path::to_path_buf));
        }
        candidates.into_iter()
            .find(|p| p.join("applications/stringlab/app.py").is_file()
                && p.join("applications/tools/server/http.py").is_file()
                && p.join("src/utils/sldc.py").is_file())
            .ok_or_else(|| "The SLAI checkout was not found. Start from G:\\GAIA\\AI\\SLAI, or set SLAI_ROOT to its root.".into())
    }

    fn backend_command(app: &tauri::AppHandle, port: u16, token: &str) -> Result<Command, String> {
        let mut cmd;
        if cfg!(debug_assertions) {
            let root = find_slai_root()?;
            let explicit = std::env::var_os("STRINGLAB_PYTHON").map(PathBuf::from);
            let venv = root.join("venv/Scripts/python.exe");
            let python = explicit.unwrap_or_else(|| if venv.is_file() { venv } else { PathBuf::from("python") });
            cmd = Command::new(python);
            cmd.current_dir(root);
            cmd.args(["-m", "applications.stringlab"]);
        } else {
            let backend = app.path().resource_dir().map_err(|e| e.to_string())?
                .join("backend/stringlab-backend.exe");
            if !backend.is_file() {
                return Err(format!("The packaged Python backend is missing: {}", backend.display()));
            }
            cmd = Command::new(&backend);
            if let Some(dir) = backend.parent() {
                cmd.current_dir(dir);
            }
        }
        cmd.args(["--host", "127.0.0.1", "--port", &port.to_string(), "--no-browser"]);
        // A token in command-line arguments would be visible to process-listing
        // tools. Pass it only through the private child environment instead.
        cmd.env(TOKEN_ENV, token);
        cmd.env("PYTHONUNBUFFERED", "1");
        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::null()); // the shared launcher prints a tokenized URL
        let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
        fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
        let stderr = OpenOptions::new().create(true).append(true)
            .open(log_dir.join("backend.stderr.log")).map_err(|e| e.to_string())?;
        cmd.stderr(Stdio::from(stderr));
        cmd.creation_flags(CREATE_NO_WINDOW);
        Ok(cmd)
    }

    fn allocate_port() -> Result<u16, String> {
        let socket = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).map_err(|e| e.to_string())?;
        let port = socket.local_addr().map_err(|e| e.to_string())?.port();
        drop(socket);
        Ok(port)
    }

    /// Check the *actual StringLab server* rather than an unrelated listener.
    /// SLAI returns a 302 redirect and an HttpOnly cookie on a correct token.
    fn ready(port: u16, token: &str) -> bool {
        let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
        let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(250)) else {
            return false;
        };
        let _ = stream.set_read_timeout(Some(Duration::from_millis(350)));
        let req = format!("GET /?token={token} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
        if stream.write_all(req.as_bytes()).is_err() {
            return false;
        }
        let mut response = Vec::with_capacity(2048);
        let mut chunk = [0_u8; 1024];
        while response.len() < 8192 {
            match stream.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    response.extend_from_slice(&chunk[..n]);
                    if response.windows(4).any(|x| x == b"\r\n\r\n") { break; }
                }
            }
        }
        let headers = String::from_utf8_lossy(&response);
        let lower = headers.to_ascii_lowercase();
        (lower.starts_with("http/1.0 302 ") || lower.starts_with("http/1.1 302 "))
            && lower.contains("location: /")
            && headers.contains(&format!("slai_stringlab_token={token}"))
    }

    fn wait_for_ready(app: &tauri::AppHandle, port: u16, token: &str) -> Result<(), String> {
        let started = Instant::now();
        while started.elapsed() < STARTUP_TIMEOUT {
            // When the backend exits early, show a useful failure rather than a
            // blank application (stderr is in the per-user app log directory).
            let state = app.state::<BackendState>();
            {
                let mut process = state.0.lock().map_err(|e| e.to_string())?;
                let child = process.as_mut().ok_or("Backend terminated while starting")?;
                if let Some(exit) = child.try_wait().map_err(|e| e.to_string())? {
                    return Err(format!("StringLab backend exited ({exit}). Inspect backend.stderr.log in the application log directory."));
                }
            }
            if ready(port, token) {
                return Ok(());
            }
            thread::sleep(Duration::from_millis(180));
        }
        Err("StringLab's scientific engine did not become ready within 65 seconds. Check backend.stderr.log.".into())
    }

    fn splash_error(app: &tauri::AppHandle, message: &str) {
        if let Some(window) = app.get_webview_window("main") {
            if let Ok(json) = serde_json::to_string(message) {
                let _ = window.eval(format!("window.stringlabStartupError({json})"));
            }
        }
    }

    fn start_backend(app: &tauri::AppHandle) -> Result<(), String> {
        let port = allocate_port()?;
        let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let mut command = backend_command(app, port, &token)?;
        let child = command.spawn().map_err(|e| format!("Unable to start the scientific engine: {e}"))?;
        *app.state::<BackendState>().0.lock().map_err(|e| e.to_string())? = Some(child);
        wait_for_ready(app, port, &token)?;
        let url = Url::parse(&format!("http://127.0.0.1:{port}/?token={token}"))
            .map_err(|e| e.to_string())?;
        let window = app.get_webview_window("main").ok_or("Main window is missing")?;
        window.navigate(url).map_err(|e| format!("Could not open StringLab: {e}"))
    }

    fn stop_backend(app: &tauri::AppHandle) {
        if let Some(state) = app.try_state::<BackendState>() {
            if let Ok(mut process) = state.0.lock() {
                if let Some(mut child) = process.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }
    }

    pub fn run() {
        tauri::Builder::default()
            .setup(|app| {
                app.manage(BackendState::default());
                let handle = app.handle().clone();
                thread::spawn(move || {
                    if let Err(message) = start_backend(&handle) {
                        stop_backend(&handle);
                        splash_error(&handle, &message);
                    }
                });
                Ok(())
            })
            .build(tauri::generate_context!())
            .expect("Could not initialize the StringLab desktop window")
            .run(|app, event| {
                if let tauri::RunEvent::Exit = event {
                    stop_backend(app);
                }
            });
    }
}

#[cfg(target_os = "windows")]
fn main() {
    windows_desktop::run();
}

// The frontend is mobile-capable, but Python/NumPy and SLAI's native format
// runtime are not bundled for Android/iOS. Do not ship a non-working mobile app.
#[cfg(not(target_os = "windows"))]
fn main() {
    eprintln!("StringLab's Tauri packaging currently supports Windows only; mobile requires a separately validated scientific runtime.");
}