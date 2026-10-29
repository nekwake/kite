//! Connected accounts: GitHub through the `gh` CLI, Claude through Claude Code's
//! own login. Kite stores no tokens; sign-in runs the official CLIs in a terminal.

use serde::Serialize;
use serde_json::Value;
use std::process::Command;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubAccount {
    installed: bool,
    login: Option<String>,
    name: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeAccount {
    installed: bool,
    version: Option<String>,
    email: Option<String>,
    name: Option<String>,
    plan: Option<String>,
}

/// Finder-launched apps get a minimal PATH; look where Homebrew and installers put CLIs
pub fn find_cli(name: &str) -> Option<String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let dirs = [
        format!("{home}/.local/bin"),
        "/opt/homebrew/bin".into(),
        "/usr/local/bin".into(),
        "/usr/bin".into(),
        format!("{home}/.claude/local"),
    ];
    std::env::var("PATH")
        .unwrap_or_default()
        .split(':')
        .map(String::from)
        .chain(dirs)
        .map(|d| format!("{d}/{name}"))
        .find(|p| std::path::Path::new(p).is_file())
}

fn run(bin: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(bin).args(args).env("GH_PROMPT_DISABLED", "1").output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[tauri::command]
pub async fn github_account() -> GithubAccount {
    let Some(gh) = find_cli("gh") else {
        return GithubAccount { installed: false, login: None, name: None, avatar_url: None };
    };
    let user: Option<Value> = run(&gh, &["api", "user"]).and_then(|s| serde_json::from_str(&s).ok());
    let field = |k: &str| user.as_ref().and_then(|u| u.get(k)).and_then(Value::as_str).map(String::from);
    GithubAccount { installed: true, login: field("login"), name: field("name"), avatar_url: field("avatar_url") }
}

#[tauri::command]
pub async fn claude_account() -> ClaudeAccount {
    let bin = find_cli("claude");
    let version = bin.as_deref().and_then(|b| run(b, &["--version"])).map(|v| v.replace(" (Claude Code)", ""));
    // Claude Code keeps the signed-in account's profile (not its token) in ~/.claude.json
    let account: Option<Value> = std::env::var("HOME")
        .ok()
        .and_then(|h| std::fs::read_to_string(format!("{h}/.claude.json")).ok())
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v.get("oauthAccount").cloned());
    let field = |k: &str| account.as_ref().and_then(|a| a.get(k)).and_then(Value::as_str).map(String::from);
    ClaudeAccount {
        installed: bin.is_some(),
        version,
        email: field("emailAddress"),
        name: field("displayName").or_else(|| field("fullName")),
        plan: field("organizationType").or_else(|| field("billingType")),
    }
}

/// Creates a GitHub repository for `root` and pushes the current branch to it
#[tauri::command]
pub async fn github_publish(root: String, name: String, private: bool) -> Result<String, String> {
    let gh = find_cli("gh").ok_or("GitHub CLI (gh) bulunamadı")?;
    let visibility = if private { "--private" } else { "--public" };
    let out = Command::new(gh)
        .current_dir(&root)
        .args(["repo", "create", &name, visibility, "--source=.", "--remote=origin", "--push"])
        .env("GH_PROMPT_DISABLED", "1")
        .output()
        .map_err(|e| e.to_string())?;
    let text = |b: &[u8]| String::from_utf8_lossy(b).trim().to_string();
    if out.status.success() {
        Ok(text(&out.stdout))
    } else {
        Err(text(&out.stderr))
    }
}
