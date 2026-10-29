//! Extra Kite windows (⌘⇧N).

use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{AppHandle, TitleBarStyle, WebviewUrl, WebviewWindowBuilder};

static WINDOWS: AtomicU32 = AtomicU32::new(1);

/// Opens an empty Kite window (⌘⇧N)
#[tauri::command]
pub async fn open_window(app: AppHandle) -> Result<(), String> {
    let label = format!("kite-{}", WINDOWS.fetch_add(1, Ordering::Relaxed));
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html?blank=1".into()))
        .title("Kite")
        .inner_size(1400.0, 900.0)
        .min_inner_size(800.0, 500.0)
        .title_bar_style(TitleBarStyle::Overlay)
        .hidden_title(true)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
