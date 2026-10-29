//! Native macOS menu bar. Custom items emit a `menu` event carrying their id;
//! the frontend maps ids to the same actions as its keyboard shortcuts.

use tauri::menu::{AboutMetadata, Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Builds the menu bar in Turkish ("tr") or English ("en")
pub fn build<R: Runtime>(app: &AppHandle<R>, lang: &str) -> tauri::Result<Menu<R>> {
    let en = lang == "en";
    let l = move |tr: &'static str, eng: &'static str| if en { eng } else { tr };
    let item = |id: &str, text: &str, accel: &str| {
        MenuItemBuilder::with_id(id, text).accelerator(accel).build(app)
    };

    let kite = SubmenuBuilder::new(app, "Kite")
        .about(Some(AboutMetadata { name: Some("Kite".into()), ..Default::default() }))
        .separator()
        .item(&item("settings", l("Ayarlar…", "Settings…"), "CmdOrCtrl+,")?)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let file = SubmenuBuilder::new(app, l("Dosya", "File"))
        .item(&item("new_file", l("Yeni Dosya", "New File"), "CmdOrCtrl+N")?)
        .item(&item("new_window", l("Yeni Pencere", "New Window"), "CmdOrCtrl+Shift+N")?)
        .separator()
        .item(&item("open_folder", l("Klasör Aç…", "Open Folder…"), "CmdOrCtrl+O")?)
        .item(&item("quick_open", l("Dosyaya Git…", "Go to File…"), "CmdOrCtrl+P")?)
        .item(&item("command_palette", l("Komut Paleti…", "Command Palette…"), "CmdOrCtrl+Shift+P")?)
        .item(&item("goto_line", l("Satıra Git…", "Go to Line…"), "CmdOrCtrl+G")?)
        .separator()
        .item(&item("save", l("Kaydet", "Save"), "CmdOrCtrl+S")?)
        .item(&item("save_as", l("Farklı Kaydet…", "Save As…"), "CmdOrCtrl+Shift+S")?)
        .separator()
        .item(&item("close_tab", l("Sekmeyi Kapat", "Close Tab"), "CmdOrCtrl+W")?)
        .build()?;

    // Predefined items keep native undo/copy/paste working in text fields
    let edit = SubmenuBuilder::new(app, l("Düzen", "Edit"))
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let view = SubmenuBuilder::new(app, l("Görünüm", "View"))
        .item(&item("view_files", l("Gezgin", "Explorer"), "CmdOrCtrl+Shift+E")?)
        .item(&item("view_search", l("Arama", "Search"), "CmdOrCtrl+Shift+F")?)
        .item(&item("view_git", l("Kaynak Kontrolü", "Source Control"), "CmdOrCtrl+Shift+G")?)
        .item(&item("view_claude", l("Claude Oturumları", "Claude Sessions"), "CmdOrCtrl+Shift+C")?)
        .separator()
        .item(&item("toggle_sidebar", l("Kenar Çubuğunu Aç/Kapat", "Toggle Sidebar"), "CmdOrCtrl+B")?)
        .item(&item("toggle_terminal", l("Terminali Aç/Kapat", "Toggle Terminal"), "CmdOrCtrl+J")?)
        .item(&item("new_terminal", l("Yeni Terminal", "New Terminal"), "CmdOrCtrl+T")?)
        .item(&item("split_terminal", l("Terminali Böl", "Split Terminal"), "CmdOrCtrl+Backslash")?)
        .item(&item("show_problems", l("Sorunlar", "Problems"), "CmdOrCtrl+Shift+M")?)
        .item(&item("new_claude", l("Yeni Claude Oturumu", "New Claude Session"), "CmdOrCtrl+L")?)
        .separator()
        .item(&item("zoom_in", l("Yakınlaştır", "Zoom In"), "CmdOrCtrl+=")?)
        .item(&item("zoom_out", l("Uzaklaştır", "Zoom Out"), "CmdOrCtrl+-")?)
        .item(&item("zoom_reset", l("Gerçek Boyut", "Actual Size"), "CmdOrCtrl+0")?)
        .separator()
        .fullscreen()
        .build()?;

    let window = SubmenuBuilder::new(app, l("Pencere", "Window"))
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;

    MenuBuilder::new(app).items(&[&kite, &file, &edit, &view, &window]).build()
}

/// Menu actions go to the focused window only, so two windows never both react
#[tauri::command]
pub fn set_menu_language(app: AppHandle, language: String) -> Result<(), String> {
    let menu = build(&app, &language).map_err(|e| e.to_string())?;
    app.set_menu(menu).map(|_| ()).map_err(|e| e.to_string())
}

pub fn forward_events(app: &AppHandle) {
    app.on_menu_event(|app, event| {
        let id = event.id().as_ref().to_string();
        if id == "new_window" {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = crate::window::open_window(app, None).await;
            });
            return;
        }
        let focused = app.webview_windows().into_values().find(|w| w.is_focused().unwrap_or(false));
        let _ = match focused {
            Some(w) => app.emit_to(w.label(), "menu", id),
            None => app.emit("menu", id),
        };
    });
}
