//! Watches the open folder (FSEvents on macOS) and emits `fs-changed` with the
//! affected paths, batched so a `git checkout` produces one event, not thousands.

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::{BTreeSet, HashMap};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State, WebviewWindow};

/// One watcher per window, keyed by window label
#[derive(Default)]
pub struct WatchState {
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

impl WatchState {
    pub fn remove(&self, label: &str) {
        self.watchers.lock().unwrap().remove(label);
    }
}

const BATCH: Duration = Duration::from_millis(250);
const MAX_PATHS: usize = 500;

#[tauri::command]
pub fn watch_root(app: AppHandle, window: WebviewWindow, state: State<WatchState>, root: String) -> Result<(), String> {
    let label = window.label().to_string();
    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher = notify::recommended_watcher(tx).map_err(|e| e.to_string())?;
    watcher
        .watch(std::path::Path::new(&root), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    // Replacing the old watcher drops it, which closes its channel and ends its thread
    state.watchers.lock().unwrap().insert(label.clone(), watcher);

    std::thread::spawn(move || {
        while let Ok(first) = rx.recv() {
            let mut paths = BTreeSet::new();
            let mut add = |ev: notify::Result<notify::Event>| {
                if let Ok(ev) = ev {
                    paths.extend(ev.paths.iter().map(|p| crate::platform::path_str(p)));
                }
            };
            add(first);
            while let Ok(ev) = rx.recv_timeout(BATCH) {
                add(ev);
            }
            let list: Vec<String> = paths.into_iter().take(MAX_PATHS).collect();
            if app.emit_to(label.as_str(), "fs-changed", list).is_err() {
                break;
            }
        }
    });
    Ok(())
}
