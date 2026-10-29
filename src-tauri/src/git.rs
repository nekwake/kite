//! Git panel backend. Shells out to the system `git` so behavior, config and
//! credentials match the user's terminal exactly.

use serde::Serialize;
use std::path::{Path, PathBuf};

fn git(dir: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let out = crate::platform::command("git")
        .current_dir(dir)
        .args(args)
        // Never block on a credential prompt; don't take index locks for reads
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .output()
        .map_err(|e| format!("git çalıştırılamadı: {e}"))?;
    if out.status.success() {
        Ok(out.stdout)
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(if err.is_empty() { format!("git {} başarısız", args[0]) } else { err })
    }
}

fn git_str(dir: &Path, args: &[&str]) -> Result<String, String> {
    git(dir, args).map(|b| String::from_utf8_lossy(&b).into_owned())
}

/// Repository top level for `root`, canonicalized so paths can be compared.
fn toplevel(root: &str) -> Result<PathBuf, String> {
    let top = git_str(Path::new(root), &["rev-parse", "--show-toplevel"])?;
    crate::platform::canonicalize(top.trim()).map_err(|e| e.to_string())
}

/// Absolute path from the UI -> repo-relative path for git.
fn rel(top: &Path, path: &str) -> String {
    let p = crate::platform::canonicalize(path).unwrap_or_else(|_| {
        // Deleted files can't be canonicalized; canonicalize their parent instead
        let p = Path::new(path);
        match (p.parent().and_then(|d| crate::platform::canonicalize(d).ok()), p.file_name()) {
            (Some(dir), Some(name)) => dir.join(name),
            _ => p.to_path_buf(),
        }
    });
    // git takes forward slashes on every platform
    crate::platform::path_str(p.strip_prefix(top).unwrap_or(&p))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    path: String,
    rel: String,
    /// Single-letter status: M, A, D, R, U (untracked), C (conflict)
    status: String,
    staged: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    is_repo: bool,
    branch: Option<String>,
    upstream: Option<String>,
    ahead: u32,
    behind: u32,
    changes: Vec<FileChange>,
    remotes: Vec<String>,
}

fn parse_branch_header(h: &str, s: &mut GitStatus) {
    // "## main...origin/main [ahead 1, behind 2]", "## No commits yet on main", "## HEAD (no branch)"
    let h = h.trim_start_matches("## ");
    if let Some(b) = h.strip_prefix("No commits yet on ") {
        s.branch = Some(b.to_string());
        return;
    }
    let (names, counts) = match h.find(" [") {
        Some(i) => (&h[..i], &h[i + 2..h.len() - 1]),
        None => (h, ""),
    };
    match names.split_once("...") {
        Some((b, u)) => {
            s.branch = Some(b.to_string());
            s.upstream = Some(u.to_string());
        }
        None => s.branch = Some(names.to_string()),
    }
    for part in counts.split(", ") {
        if let Some(n) = part.strip_prefix("ahead ") {
            s.ahead = n.parse().unwrap_or(0);
        } else if let Some(n) = part.strip_prefix("behind ") {
            s.behind = n.parse().unwrap_or(0);
        }
    }
}

fn parse_status(out: &str, top: &Path) -> GitStatus {
    let mut s = GitStatus { is_repo: true, branch: None, upstream: None, ahead: 0, behind: 0, changes: vec![], remotes: vec![] };
    let mut fields = out.split('\0').filter(|f| !f.is_empty());
    while let Some(f) = fields.next() {
        if f.starts_with("## ") {
            parse_branch_header(f, &mut s);
            continue;
        }
        if f.len() < 4 {
            continue;
        }
        let (x, y, path) = (f.as_bytes()[0] as char, f.as_bytes()[1] as char, &f[3..]);
        if x == 'R' || x == 'C' {
            fields.next(); // rename source
        }
        let abs = crate::platform::path_str(&top.join(path));
        let push = |s: &mut GitStatus, status: char, staged: bool| {
            s.changes.push(FileChange { path: abs.clone(), rel: path.to_string(), status: status.to_string(), staged });
        };
        let conflict = x == 'U' || y == 'U' || (x == 'A' && y == 'A') || (x == 'D' && y == 'D');
        if conflict {
            push(&mut s, 'C', false);
        } else if x == '?' {
            push(&mut s, 'U', false);
        } else {
            if x != ' ' {
                push(&mut s, x, true);
            }
            if y != ' ' {
                push(&mut s, y, false);
            }
        }
    }
    s
}

#[tauri::command]
pub async fn git_status(root: String) -> Result<GitStatus, String> {
    let Ok(top) = toplevel(&root) else {
        return Ok(GitStatus { is_repo: false, branch: None, upstream: None, ahead: 0, behind: 0, changes: vec![], remotes: vec![] });
    };
    let out = git_str(&top, &["status", "--porcelain=v1", "-b", "-z", "-uall"])?;
    let mut status = parse_status(&out, &top);
    status.remotes = git_str(&top, &["remote"]).unwrap_or_default().lines().map(String::from).collect();
    Ok(status)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileVersions {
    original: String,
    modified: String,
}

fn show(top: &Path, spec: &str) -> String {
    git(top, &["show", spec]).map(to_text).unwrap_or_default()
}

fn to_text(bytes: Vec<u8>) -> String {
    if bytes.iter().take(8000).any(|&b| b == 0) {
        "(ikili dosya)".into()
    } else {
        String::from_utf8_lossy(&bytes).into_owned()
    }
}

/// Both sides of a diff. `rev` = a commit (its parent vs it); otherwise
/// staged (HEAD vs index) or working tree (index vs file on disk).
#[tauri::command]
pub async fn git_file_versions(root: String, path: String, staged: bool, rev: Option<String>) -> Result<FileVersions, String> {
    let top = toplevel(&root)?;
    let r = rel(&top, &path);
    Ok(match rev {
        Some(h) => FileVersions { original: show(&top, &format!("{h}^:{r}")), modified: show(&top, &format!("{h}:{r}")) },
        None if staged => FileVersions { original: show(&top, &format!("HEAD:{r}")), modified: show(&top, &format!(":{r}")) },
        None => FileVersions {
            original: show(&top, &format!(":{r}")),
            modified: std::fs::read(&path).map(to_text).unwrap_or_default(),
        },
    })
}

fn with_paths<'a>(base: &[&'a str], rels: &'a [String]) -> Vec<&'a str> {
    let mut args = base.to_vec();
    args.push("--");
    args.extend(rels.iter().map(String::as_str));
    args
}

#[tauri::command]
pub async fn git_stage(root: String, paths: Vec<String>) -> Result<(), String> {
    let top = toplevel(&root)?;
    let rels: Vec<String> = paths.iter().map(|p| rel(&top, p)).collect();
    git(&top, &with_paths(&["add", "-A"], &rels)).map(|_| ())
}

#[tauri::command]
pub async fn git_unstage(root: String, paths: Vec<String>) -> Result<(), String> {
    let top = toplevel(&root)?;
    let rels: Vec<String> = paths.iter().map(|p| rel(&top, p)).collect();
    // `restore --staged` needs a HEAD; before the first commit, drop from the index instead
    git(&top, &with_paths(&["restore", "--staged"], &rels))
        .or_else(|_| git(&top, &with_paths(&["rm", "--cached", "-r", "-q"], &rels)))
        .map(|_| ())
}

/// Throws away working-tree changes. Untracked files are deleted.
#[tauri::command]
pub async fn git_discard(root: String, paths: Vec<String>, untracked: bool) -> Result<(), String> {
    let top = toplevel(&root)?;
    let rels: Vec<String> = paths.iter().map(|p| rel(&top, p)).collect();
    let base: &[&str] = if untracked { &["clean", "-f", "-q"] } else { &["restore"] };
    git(&top, &with_paths(base, &rels)).map(|_| ())
}

#[tauri::command]
pub async fn git_commit(root: String, message: String, all: bool) -> Result<(), String> {
    let top = toplevel(&root)?;
    if all {
        git(&top, &["add", "-A"])?;
    }
    git(&top, &["commit", "-q", "-m", &message]).map(|_| ())
}

#[derive(Serialize)]
pub struct Branches {
    current: Option<String>,
    local: Vec<String>,
}

#[tauri::command]
pub async fn git_branches(root: String) -> Result<Branches, String> {
    let top = toplevel(&root)?;
    let out = git_str(&top, &["branch", "--format=%(HEAD)%(refname:short)"])?;
    let mut b = Branches { current: None, local: vec![] };
    for line in out.lines() {
        let name = line[1..].to_string();
        if line.starts_with('*') {
            b.current = Some(name.clone());
        }
        b.local.push(name);
    }
    Ok(b)
}

#[tauri::command]
pub async fn git_switch(root: String, branch: String, create: bool) -> Result<(), String> {
    let top = toplevel(&root)?;
    let args: &[&str] = if create { &["switch", "-c", &branch] } else { &["switch", &branch] };
    git(&top, args).map(|_| ())
}

#[tauri::command]
pub async fn git_init(root: String) -> Result<(), String> {
    git(Path::new(&root), &["init", "-q"]).map(|_| ())
}

#[tauri::command]
pub async fn git_sync(root: String, op: String) -> Result<String, String> {
    let top = toplevel(&root)?;
    let args: &[&str] = match op.as_str() {
        "pull" => &["pull", "--ff-only"],
        "push" => &["push"],
        "fetch" => &["fetch", "--all", "--prune"],
        // First push of a new branch: create it on origin and track it
        "publish" => &["push", "-u", "origin", "HEAD"],
        _ => return Err(format!("bilinmeyen işlem: {op}")),
    };
    git_str(&top, args)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    hash: String,
    parents: Vec<String>,
    author: String,
    email: String,
    time: i64,
    refs: Vec<String>,
    subject: String,
}

#[tauri::command]
pub async fn git_log(root: String, limit: u32) -> Result<Vec<Commit>, String> {
    let top = toplevel(&root)?;
    let n = format!("-n{limit}");
    // An empty repository has no log yet
    let Ok(out) = git_str(&top, &["log", "--all", "--date-order", &n, "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%D%x1f%s%x1e"]) else {
        return Ok(vec![]);
    };
    Ok(out
        .split('\x1e')
        .filter_map(|rec| {
            let f: Vec<&str> = rec.trim_start_matches('\n').split('\x1f').collect();
            if f.len() < 7 {
                return None;
            }
            Some(Commit {
                hash: f[0].to_string(),
                parents: f[1].split_whitespace().map(String::from).collect(),
                author: f[2].to_string(),
                email: f[3].to_string(),
                time: f[4].parse().unwrap_or(0),
                refs: f[5].split(", ").filter(|r| !r.is_empty()).map(String::from).collect(),
                subject: f[6].to_string(),
            })
        })
        .collect())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    /// Full message after the subject line
    body: String,
    files: u32,
    insertions: u32,
    deletions: u32,
    /// The commit on GitHub/GitLab/Bitbucket when origin points there
    web_url: Option<String>,
}

/// "git@github.com:o/r.git" or "https://github.com/o/r.git" → "https://github.com/o/r"
fn web_base(remote: &str) -> Option<String> {
    let r = remote.trim().trim_end_matches(".git");
    let https = if let Some(rest) = r.strip_prefix("git@") {
        format!("https://{}", rest.replacen(':', "/", 1))
    } else if let Some((_, rest)) = r.split_once("://") {
        // Drop credentials ("user:token@host") from the host part
        let (host, path) = rest.split_once('/').unwrap_or((rest, ""));
        let host = host.rsplit_once('@').map_or(host, |(_, h)| h);
        format!("https://{host}/{path}")
    } else {
        return None;
    };
    Some(https)
}

#[tauri::command]
pub async fn git_commit_info(root: String, hash: String) -> Result<CommitInfo, String> {
    let top = toplevel(&root)?;
    let body = git_str(&top, &["show", "-s", "--format=%b", &hash])?.trim().to_string();
    // " 5 files changed, 129 insertions(+), 738 deletions(-)"
    let stat = git_str(&top, &["show", "--shortstat", "--format=", "--first-parent", &hash]).unwrap_or_default();
    let num = |word: &str| {
        stat.split(',')
            .find(|p| p.contains(word))
            .and_then(|p| p.split_whitespace().next()?.parse().ok())
            .unwrap_or(0)
    };
    let web_url = git_str(&top, &["remote", "get-url", "origin"])
        .ok()
        .and_then(|r| web_base(&r))
        .map(|base| {
            let sep = if base.contains("bitbucket.org") { "commits" } else { "commit" };
            format!("{base}/{sep}/{hash}")
        });
    Ok(CommitInfo { body, files: num("file"), insertions: num("insertion"), deletions: num("deletion"), web_url })
}

/// `git config user.name`, to tell your commits from other people's
#[tauri::command]
pub async fn git_user_name(root: String) -> Option<String> {
    let top = toplevel(&root).ok()?;
    git_str(&top, &["config", "user.name"]).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

#[tauri::command]
pub async fn git_commit_files(root: String, hash: String) -> Result<Vec<FileChange>, String> {
    let top = toplevel(&root)?;
    let out = git_str(&top, &["diff-tree", "-r", "--root", "--no-commit-id", "--name-status", "-z", "-m", "--first-parent", &hash])?;
    let mut files = vec![];
    let mut fields = out.split('\0').filter(|f| !f.is_empty());
    while let Some(status) = fields.next() {
        let letter = &status[..1];
        if letter == "R" || letter == "C" {
            fields.next(); // rename source
        }
        let Some(path) = fields.next() else { break };
        files.push(FileChange {
            path: crate::platform::path_str(&top.join(path)),
            rel: path.to_string(),
            status: letter.to_string(),
            staged: false,
        });
    }
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_status_output() {
        let top = Path::new("/r");
        let out = "## main...origin/main [ahead 2, behind 1]\0M  a.txt\0 M b.txt\0MM c.txt\0?? new.txt\0R  to.txt\0from.txt\0UU x.txt\0";
        let s = parse_status(out, top);
        assert_eq!(s.branch.as_deref(), Some("main"));
        assert_eq!(s.upstream.as_deref(), Some("origin/main"));
        assert_eq!((s.ahead, s.behind), (2, 1));
        let got: Vec<(String, String, bool)> = s.changes.iter().map(|c| (c.rel.clone(), c.status.clone(), c.staged)).collect();
        let want = [
            ("a.txt", "M", true), ("b.txt", "M", false), ("c.txt", "M", true), ("c.txt", "M", false),
            ("new.txt", "U", false), ("to.txt", "R", true), ("x.txt", "C", false),
        ];
        assert_eq!(got, want.map(|(a, b, c)| (a.to_string(), b.to_string(), c)));
        assert_eq!(s.changes[0].path, "/r/a.txt");
    }

    #[test]
    fn builds_web_links() {
        assert_eq!(web_base("git@github.com:nekwake/kite.git").as_deref(), Some("https://github.com/nekwake/kite"));
        assert_eq!(web_base("https://github.com/nekwake/kite.git\n").as_deref(), Some("https://github.com/nekwake/kite"));
        assert_eq!(web_base("https://user:tok@github.com/o/r.git").as_deref(), Some("https://github.com/o/r"));
        assert_eq!(web_base("/local/path"), None);
    }

    #[test]
    fn parses_fresh_repo_header() {
        let s = parse_status("## No commits yet on main\0", Path::new("/r"));
        assert_eq!(s.branch.as_deref(), Some("main"));
        assert!(s.upstream.is_none());
    }

    #[test]
    fn end_to_end_on_temp_repo() {
        tauri::async_runtime::block_on(async {
            let dir = std::env::temp_dir().join(format!("kite-git-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            let root = dir.to_string_lossy().into_owned();
            git_init(root.clone()).await.unwrap();
            for (k, v) in [("user.name", "t"), ("user.email", "t@t")] {
                git(&dir, &["config", k, v]).unwrap();
            }
            let file = dir.join("a.txt").to_string_lossy().into_owned();
            std::fs::write(&file, "bir\n").unwrap();

            let s = git_status(root.clone()).await.unwrap();
            assert_eq!(s.changes.len(), 1);
            assert_eq!(s.changes[0].status, "U");

            git_stage(root.clone(), vec![file.clone()]).await.unwrap();
            git_unstage(root.clone(), vec![file.clone()]).await.unwrap(); // no HEAD yet
            git_commit(root.clone(), "ilk".into(), true).await.unwrap();

            std::fs::write(&file, "bir\niki\n").unwrap();
            let v = git_file_versions(root.clone(), file.clone(), false, None).await.unwrap();
            assert_eq!((v.original.as_str(), v.modified.as_str()), ("bir\n", "bir\niki\n"));

            git_commit(root.clone(), "ikinci".into(), true).await.unwrap();
            let log = git_log(root.clone(), 10).await.unwrap();
            assert_eq!(log.iter().map(|c| c.subject.as_str()).collect::<Vec<_>>(), ["ikinci", "ilk"]);
            assert_eq!(log[0].parents, [log[1].hash.clone()]);

            let files = git_commit_files(root.clone(), log[1].hash.clone()).await.unwrap();
            assert_eq!(files[0].rel, "a.txt");
            let v = git_file_versions(root.clone(), file.clone(), false, Some(log[0].hash.clone())).await.unwrap();
            assert_eq!(v.original, "bir\n");

            git_switch(root.clone(), "yeni".into(), true).await.unwrap();
            assert_eq!(git_branches(root.clone()).await.unwrap().current.as_deref(), Some("yeni"));
            std::fs::remove_dir_all(&dir).unwrap();
        });
    }
}
