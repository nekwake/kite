use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState {
    sessions: Mutex<HashMap<u32, Session>>,
    next_id: AtomicU32,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", content = "data", rename_all = "camelCase")]
pub enum PtyEvent {
    Output(String),
    Exit,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// Decodes as much of `buf` as is valid UTF-8, keeping a trailing partial
/// character for the next read so multi-byte glyphs are never split.
fn take_utf8(buf: &mut Vec<u8>) -> String {
    match std::str::from_utf8(buf) {
        Ok(s) => {
            let s = s.to_owned();
            buf.clear();
            s
        }
        Err(e) if e.error_len().is_none() => {
            let valid = e.valid_up_to();
            let s = String::from_utf8_lossy(&buf[..valid]).into_owned();
            buf.drain(..valid);
            s
        }
        Err(_) => {
            let s = String::from_utf8_lossy(buf).into_owned();
            buf.clear();
            s
        }
    }
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: State<PtyState>,
    cwd: String,
    cols: u16,
    rows: u16,
    on_event: Channel<PtyEvent>,
) -> Result<u32, String> {
    let pair = native_pty_system()
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(err)?;

    // A login shell on macOS so PATH from ~/.zprofile is loaded even when launched from Finder
    let (shell, args) = crate::platform::default_shell();
    let mut cmd = CommandBuilder::new(&shell);
    cmd.args(&args);
    cmd.cwd(&cwd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "Kite");

    let child = pair.slave.spawn_command(cmd).map_err(err)?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(err)?;
    let writer = pair.master.take_writer().map_err(err)?;
    let id = state.next_id.fetch_add(1, Ordering::Relaxed);

    state
        .sessions
        .lock()
        .unwrap()
        .insert(id, Session { master: pair.master, writer, child });

    std::thread::spawn(move || {
        let mut buf = [0u8; 16 * 1024];
        let mut pending = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    pending.extend_from_slice(&buf[..n]);
                    let text = take_utf8(&mut pending);
                    if !text.is_empty() && on_event.send(PtyEvent::Output(text)).is_err() {
                        break;
                    }
                }
            }
        }
        let session = app.state::<PtyState>().sessions.lock().unwrap().remove(&id);
        if let Some(mut s) = session {
            let _ = s.child.wait();
        }
        let _ = on_event.send(PtyEvent::Exit);
    });

    Ok(id)
}

#[tauri::command]
pub fn pty_write(state: State<PtyState>, id: u32, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    let s = sessions.get_mut(&id).ok_or("terminal kapalı")?;
    s.writer.write_all(data.as_bytes()).map_err(err)?;
    s.writer.flush().map_err(err)
}

#[tauri::command]
pub fn pty_resize(state: State<PtyState>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let s = sessions.get(&id).ok_or("terminal kapalı")?;
    s.master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(err)
}

#[tauri::command]
pub fn pty_kill(state: State<PtyState>, id: u32) -> Result<(), String> {
    // The reader thread notices EOF and cleans up the session itself
    if let Some(s) = state.sessions.lock().unwrap().get_mut(&id) {
        s.child.kill().map_err(err)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::take_utf8;

    #[test]
    fn keeps_partial_multibyte_char() {
        // "ş" is 0xC5 0x9F; split it across two reads
        let mut buf = vec![b'a', 0xC5];
        assert_eq!(take_utf8(&mut buf), "a");
        assert_eq!(buf, vec![0xC5]);
        buf.push(0x9F);
        assert_eq!(take_utf8(&mut buf), "ş");
        assert!(buf.is_empty());
    }
}
