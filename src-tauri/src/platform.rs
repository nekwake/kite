//! The few places where macOS and Windows differ. Paths cross to the UI with
//! forward slashes on every platform, so the frontend only ever splits on "/".

use std::path::{Path, PathBuf};
use std::process::Command;

/// A path for the UI: forward slashes, no `\\?\` prefix
pub fn path_str(p: &Path) -> String {
    norm(p.to_string_lossy().into_owned())
}

pub fn norm(s: String) -> String {
    if cfg!(windows) {
        s.replace('\\', "/")
    } else {
        s
    }
}

/// `canonicalize` without Windows' `\\?\C:\…` verbatim prefix
pub fn canonicalize(p: impl AsRef<Path>) -> std::io::Result<PathBuf> {
    dunce::canonicalize(p)
}

/// A command that doesn't flash a console window on Windows
pub fn command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from)
}

/// The user's shell: a login $SHELL on macOS, PowerShell on Windows
pub fn default_shell() -> (String, Vec<String>) {
    if cfg!(windows) {
        let pwsh = crate::accounts::find_cli("pwsh");
        (pwsh.unwrap_or_else(|| "powershell.exe".into()), vec!["-NoLogo".into()])
    } else {
        (std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into()), vec!["-l".into()])
    }
}

/// Shows a file in Finder / Explorer
pub fn reveal(path: &str) -> std::io::Result<()> {
    if cfg!(windows) {
        command("explorer").arg(format!("/select,{}", path.replace('/', "\\"))).spawn().map(|_| ())
    } else {
        command("open").args(["-R", path]).status().map(|_| ())
    }
}
