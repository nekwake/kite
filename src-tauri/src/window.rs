//! Extra Kite windows: ⌘⇧N opens an empty one; `kite <dir>` while Kite is
//! running opens one on that folder.

use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

static WINDOWS: AtomicU32 = AtomicU32::new(1);

fn encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'/' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[tauri::command]
pub async fn open_window(app: AppHandle, dir: Option<String>) -> Result<(), String> {
    let label = format!("kite-{}", WINDOWS.fetch_add(1, Ordering::Relaxed));
    let query = match dir {
        Some(d) => format!("dir={}", encode(&d)),
        None => "blank=1".into(),
    };
    let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(format!("index.html?{query}").into()))
        .title("Kite")
        .inner_size(1400.0, 900.0)
        .min_inner_size(800.0, 500.0);
    // macOS keeps its traffic lights over our title bar; Windows draws its own buttons in it
    #[cfg(target_os = "macos")]
    let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
    #[cfg(not(target_os = "macos"))]
    let builder = builder.decorations(false);
    builder
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// A second launch (`kite .`) hands its folder to the running app instead
pub fn on_second_instance(app: &AppHandle, argv: Vec<String>, cwd: String) {
    let dir = argv
        .get(1)
        .and_then(|a| crate::platform::canonicalize(Path::new(&cwd).join(a)).ok())
        .filter(|p| p.is_dir())
        .map(|p| crate::platform::path_str(&p));
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = open_window(app, dir).await;
    });
}
