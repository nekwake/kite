//! Lists Claude Code sessions from ~/.claude/projects/<encoded cwd>/<session id>.jsonl.
//! Transcripts get large (tens of MB), so each file is scanned once and then
//! only its newly appended bytes are read on later calls.

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::State;

#[derive(Default, Clone)]
struct Scan {
    offset: u64,
    title: Option<String>,
    first_prompt: Option<String>,
    last_prompt: Option<String>,
    /// Every distinct working directory seen; the session may `cd` around
    cwds: Vec<String>,
    branch: Option<String>,
    entrypoint: Option<String>,
    prompts: u32,
}

#[derive(Default)]
pub struct ClaudeState {
    cache: Mutex<HashMap<PathBuf, Scan>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    id: String,
    title: String,
    last_prompt: Option<String>,
    cwd: String,
    cwd_exists: bool,
    branch: Option<String>,
    /// "cli" or "claude-desktop"
    entrypoint: Option<String>,
    prompts: u32,
    /// Unix seconds of the last write
    updated: u64,
}

/// Claude Code's project folder name: every non-alphanumeric character becomes '-'
pub fn encode_project(path: &str) -> String {
    path.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect()
}

fn projects_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".claude").join("projects"))
}

fn one_line(s: &str, max: usize) -> String {
    let s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if s.chars().count() > max {
        format!("{}…", s.chars().take(max).collect::<String>())
    } else {
        s
    }
}

/// The text the user typed, skipping tool results and injected system/command blocks
fn prompt_text(v: &Value) -> Option<String> {
    if v.get("isMeta").and_then(Value::as_bool) == Some(true) {
        return None;
    }
    let content = v.get("message")?.get("content")?;
    let text = match content {
        Value::String(s) => s.clone(),
        Value::Array(items) => items
            .iter()
            .filter(|i| i.get("type").and_then(Value::as_str) == Some("text"))
            .filter_map(|i| i.get("text").and_then(Value::as_str))
            .filter(|t| !t.trim_start().starts_with('<'))
            .collect::<Vec<_>>()
            .join(" "),
        _ => return None,
    };
    let text = text.trim();
    (!text.is_empty() && !text.starts_with('<')).then(|| one_line(text, 140))
}

/// Reads lines appended since `scan.offset`. Only line types we need are parsed;
/// the `"type":"x"` probe can't match inside message text, where quotes are escaped.
fn scan_from(path: &Path, scan: &mut Scan) -> std::io::Result<()> {
    let mut f = File::open(path)?;
    f.seek(SeekFrom::Start(scan.offset))?;
    let mut reader = BufReader::new(f);
    let mut line = String::new();
    loop {
        line.clear();
        let n = reader.read_line(&mut line)?;
        // Stop before a half-written last line; it is re-read next time
        if n == 0 || !line.ends_with('\n') {
            break;
        }
        scan.offset += n as u64;
        let is = |t: &str| line.contains(&format!("\"type\":\"{t}\""));
        let wanted = is("user") || is("custom-title") || is("last-prompt");
        if !wanted && !line.contains("\"cwd\"") {
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
        if let Some(c) = v.get("cwd").and_then(Value::as_str) {
            if !scan.cwds.iter().any(|x| x == c) {
                scan.cwds.push(c.to_string());
            }
        }
        if let Some(b) = v.get("gitBranch").and_then(Value::as_str).filter(|b| !b.is_empty()) {
            scan.branch = Some(b.to_string());
        }
        if scan.entrypoint.is_none() {
            scan.entrypoint = v.get("entrypoint").and_then(Value::as_str).map(String::from);
        }
        match v.get("type").and_then(Value::as_str) {
            Some("custom-title") => {
                scan.title = v.get("customTitle").and_then(Value::as_str).map(|t| one_line(t, 80));
            }
            Some("last-prompt") => {
                if let Some(p) = v.get("lastPrompt").and_then(Value::as_str) {
                    scan.last_prompt = Some(one_line(p, 140));
                }
            }
            Some("user") => {
                if let Some(text) = prompt_text(&v) {
                    scan.prompts += 1;
                    scan.first_prompt.get_or_insert_with(|| one_line(&text, 80));
                    scan.last_prompt = Some(text);
                }
            }
            _ => {}
        }
    }
    Ok(())
}

fn session_for(path: &Path, cache: &mut HashMap<PathBuf, Scan>) -> Option<Session> {
    let meta = std::fs::metadata(path).ok()?;
    let mut scan = cache.get(path).cloned().unwrap_or_default();
    if meta.len() < scan.offset {
        scan = Scan::default(); // rewritten
    }
    if meta.len() > scan.offset {
        scan_from(path, &mut scan).ok()?;
        cache.insert(path.to_path_buf(), scan.clone());
    }
    // Sessions that were opened but never got a prompt aren't worth listing
    if scan.prompts == 0 {
        return None;
    }
    // `claude --resume` must run in the folder the transcript is filed under
    let folder = path.parent()?.file_name()?.to_string_lossy().into_owned();
    let cwd = scan
        .cwds
        .iter()
        .find(|c| encode_project(c) == folder)
        .or(scan.cwds.last())?
        .clone();
    Some(Session {
        id: path.file_stem()?.to_string_lossy().into_owned(),
        title: scan.title.clone().or(scan.first_prompt.clone()).unwrap_or_else(|| "Adsız oturum".into()),
        last_prompt: scan.last_prompt.clone(),
        cwd_exists: Path::new(&cwd).is_dir(),
        cwd,
        branch: scan.branch.clone(),
        entrypoint: scan.entrypoint.clone(),
        prompts: scan.prompts,
        updated: meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_secs(),
    })
}

/// Sessions for one project (`root`), or for every project when `root` is None.
#[tauri::command]
pub async fn claude_sessions(state: State<'_, ClaudeState>, root: Option<String>) -> Result<Vec<Session>, String> {
    let Some(base) = projects_dir() else { return Ok(vec![]) };
    let dirs: Vec<PathBuf> = match &root {
        Some(r) => vec![base.join(encode_project(r))],
        None => std::fs::read_dir(&base)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.is_dir())
            .collect(),
    };
    let mut cache = state.cache.lock().unwrap();
    let mut sessions: Vec<Session> = dirs
        .iter()
        .filter_map(|d| std::fs::read_dir(d).ok())
        .flatten()
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "jsonl"))
        .filter_map(|p| session_for(&p, &mut cache))
        .collect();
    sessions.sort_by(|a, b| b.updated.cmp(&a.updated));
    Ok(sessions)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn encodes_like_claude_code() {
        assert_eq!(encode_project("/Users/g/github/kite"), "-Users-g-github-kite");
        assert_eq!(encode_project("/a/b.c/.claude"), "-a-b-c--claude");
    }

    #[test]
    fn scans_incrementally_and_prefers_custom_title() {
        let path = std::env::temp_dir().join(format!("kite-claude-{}.jsonl", std::process::id()));
        let mut f = File::create(&path).unwrap();
        writeln!(f, r#"{{"type":"user","cwd":"/tmp","gitBranch":"main","entrypoint":"cli","message":{{"content":"ilk soru"}}}}"#).unwrap();
        writeln!(f, r#"{{"type":"user","cwd":"/tmp","message":{{"content":[{{"type":"tool_result","content":"x"}}]}}}}"#).unwrap();
        writeln!(f, r#"{{"type":"assistant","message":{{"content":"\"type\":\"custom-title\" yazısı"}}}}"#).unwrap();

        let mut cache = HashMap::new();
        let s = session_for(&path, &mut cache).unwrap();
        assert_eq!((s.title.as_str(), s.prompts, s.branch.as_deref()), ("ilk soru", 1, Some("main")));

        writeln!(f, r#"{{"type":"custom-title","customTitle":"Güzel başlık"}}"#).unwrap();
        write!(f, r#"{{"type":"user","message":{{"content":"ikinci"#).unwrap(); // half-written line
        let s = session_for(&path, &mut cache).unwrap();
        assert_eq!((s.title.as_str(), s.prompts), ("Güzel başlık", 1));

        writeln!(f, r#""}}}}"#).unwrap();
        let s = session_for(&path, &mut cache).unwrap();
        assert_eq!((s.prompts, s.last_prompt.as_deref()), (2, Some("ikinci")));
        std::fs::remove_file(&path).unwrap();
    }
}

#[cfg(test)]
mod real_data {
    use super::*;

    /// `cargo test real_sessions -- --ignored --nocapture` to check against ~/.claude
    #[test]
    #[ignore]
    fn real_sessions() {
        let base = projects_dir().unwrap();
        let mut cache = HashMap::new();
        for pass in 0..2 {
            let t = std::time::Instant::now();
            let mut all: Vec<Session> = std::fs::read_dir(&base).unwrap().flatten()
                .flat_map(|d| std::fs::read_dir(d.path()).into_iter().flatten().flatten())
                .map(|e| e.path())
                .filter(|p| p.extension().is_some_and(|x| x == "jsonl"))
                .filter_map(|p| session_for(&p, &mut cache))
                .collect();
            all.sort_by(|a, b| b.updated.cmp(&a.updated));
            println!("pass {pass}: {} sessions in {:?}", all.len(), t.elapsed());
            if pass == 0 {
                for s in all.iter().take(8) {
                    println!("  [{}] {} | {} | {:?} | {} prompts", s.entrypoint.as_deref().unwrap_or("?"), s.title, s.cwd.replace("/Users/gokberk", "~"), s.branch, s.prompts);
                }
            }
        }
    }
}
