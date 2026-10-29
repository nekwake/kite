//! Claude usage limits. Claude Code hands its 5-hour and 7-day rate-limit usage
//! to status line commands; Kite's status line command saves that JSON to
//! ~/.kite/claude-usage.json and Kite shows it. Turning it on edits
//! ~/.claude/settings.json (after a backup) and never replaces another status line.

use serde::Serialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

const MARKER: &str = "kite-claude-usage";

fn kite_dir() -> Result<PathBuf, String> {
    crate::platform::home_dir().map(|h| h.join(".kite")).ok_or("Kullanıcı klasörü bulunamadı".into())
}

fn settings_path() -> Result<PathBuf, String> {
    crate::platform::home_dir()
        .map(|h| h.join(".claude").join("settings.json"))
        .ok_or("Kullanıcı klasörü bulunamadı".into())
}

fn read_settings() -> Result<Value, String> {
    match std::fs::read_to_string(settings_path()?) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| format!("~/.claude/settings.json okunamadı: {e}")),
        Err(_) => Ok(json!({})),
    }
}

fn write_settings(v: &Value) -> Result<(), String> {
    let path = settings_path()?;
    if path.exists() {
        std::fs::copy(&path, path.with_extension("json.kite-backup")).map_err(|e| e.to_string())?;
    } else if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(v).map_err(|e| e.to_string())?;
    std::fs::write(path, text + "\n").map_err(|e| e.to_string())
}

fn is_ours(settings: &Value) -> bool {
    settings
        .pointer("/statusLine/command")
        .and_then(Value::as_str)
        .is_some_and(|c| c.contains(MARKER))
}

/// The status line command: save stdin (Claude's JSON) atomically, print nothing
fn install_script() -> Result<String, String> {
    let dir = kite_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if cfg!(windows) {
        let out = dir.join("claude-usage.json");
        Ok(format!(
            "powershell -NoProfile -Command \"$input | Out-File -Encoding utf8 '{}'\" # {MARKER}",
            out.display()
        ))
    } else {
        let script = dir.join(format!("{MARKER}.sh"));
        std::fs::write(
            &script,
            "#!/bin/sh\n# Written by Kite: keeps Claude Code's usage limits for Kite's status bar\n\
             d=\"$HOME/.kite\"; mkdir -p \"$d\"\n\
             cat > \"$d/claude-usage.json.tmp\" && mv \"$d/claude-usage.json.tmp\" \"$d/claude-usage.json\"\n",
        )
        .map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
        }
        Ok(script.to_string_lossy().into_owned())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    enabled: bool,
    /// Another status line is configured, so Kite won't install its own
    other_status_line: bool,
    rate_limits: Option<Value>,
    /// Unix seconds when Claude Code last refreshed the data
    updated: Option<u64>,
}

#[tauri::command]
pub async fn claude_usage() -> Result<Usage, String> {
    let settings = read_settings()?;
    let enabled = is_ours(&settings);
    let file = kite_dir()?.join("claude-usage.json");
    let data: Option<Value> = std::fs::read_to_string(&file)
        .ok()
        .and_then(|s| serde_json::from_str(s.trim_start_matches('\u{feff}')).ok());
    let updated = std::fs::metadata(&file)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs());
    Ok(Usage {
        enabled,
        other_status_line: !enabled && settings.get("statusLine").is_some(),
        rate_limits: data.and_then(|d| d.get("rate_limits").cloned()),
        updated,
    })
}

#[tauri::command]
pub async fn claude_usage_enable() -> Result<(), String> {
    let mut settings = read_settings()?;
    if settings.get("statusLine").is_some() && !is_ours(&settings) {
        return Err("Claude Code'da zaten bir status line ayarlı; Kite onu değiştirmiyor.".into());
    }
    let command = install_script()?;
    settings["statusLine"] = json!({ "type": "command", "command": command });
    write_settings(&settings)
}

#[tauri::command]
pub async fn claude_usage_disable() -> Result<(), String> {
    let mut settings = read_settings()?;
    if is_ours(&settings) {
        if let Some(obj) = settings.as_object_mut() {
            obj.remove("statusLine");
        }
        write_settings(&settings)?;
    }
    Ok(())
}
