mod accounts;
mod claude;
mod fs;
mod git;
mod menu;
mod pty;
mod search;
mod watch;
mod window;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first so a second launch exits before doing anything
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            window::on_second_instance(app, argv, cwd);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyState::default())
        .manage(claude::ClaudeState::default())
        .manage(watch::WatchState::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                window.state::<watch::WatchState>().remove(window.label());
            }
        })
        .setup(|app| {
            app.set_menu(menu::build(app.handle())?)?;
            menu::forward_events(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fs::initial_dir,
            fs::read_dir,
            fs::read_file,
            fs::write_file,
            fs::create_file,
            fs::create_dir,
            fs::rename_path,
            fs::trash_path,
            fs::reveal_in_finder,
            watch::watch_root,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            search::list_files,
            search::search,
            git::git_status,
            git::git_file_versions,
            git::git_stage,
            git::git_unstage,
            git::git_discard,
            git::git_commit,
            git::git_branches,
            git::git_switch,
            git::git_init,
            git::git_sync,
            git::git_log,
            git::git_commit_files,
            claude::claude_sessions,
            accounts::github_account,
            accounts::claude_account,
            accounts::github_publish,
            window::open_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
