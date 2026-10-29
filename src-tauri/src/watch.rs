//! Watches the open folder (FSEvents on macOS) and emits `fs-changed` with the
//! affected paths, batched so a `git checkout` produces one event, not thousands.

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::BTreeSet;
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct WatchState {
    watcher: Mutex<Option<RecommendedWatcher>>,
}

const BATCH: Duration = Duration::from_millis(250);
const MAX_PATHS: usize = 500;

#[tauri::command]
pub fn watch_root(app: AppHandle, state: State<WatchState>, root: String) -> Result<(), String> {
    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher = notify::recommended_watcher(tx).map_err(|e| e.to_string())?;
    watcher
        .watch(std::path::Path::new(&root), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    // Replacing the old watcher drops it, which closes its channel and ends its thread
    *state.watcher.lock().unwrap() = Some(watcher);

    std::thread::spawn(move || {
        while let Ok(first) = rx.recv() {
            let mut paths = BTreeSet::new();
            let mut add = |ev: notify::Result<notify::Event>| {
                if let Ok(ev) = ev {
                    paths.extend(ev.paths.into_iter().map(|p| p.to_string_lossy().into_owned()));
                }
            };
            add(first);
            while let Ok(ev) = rx.recv_timeout(BATCH) {
                add(ev);
            }
            let list: Vec<String> = paths.into_iter().take(MAX_PATHS).collect();
            if app.emit("fs-changed", list).is_err() {
                break;
            }
        }
    });
    Ok(())
}
