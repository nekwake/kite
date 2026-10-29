//! Native macOS menu bar. Custom items emit a `menu` event carrying their id;
//! the frontend maps ids to the same actions as its keyboard shortcuts.

use tauri::menu::{AboutMetadata, Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime};

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let item = |id: &str, text: &str, accel: &str| {
        MenuItemBuilder::with_id(id, text).accelerator(accel).build(app)
    };

    let kite = SubmenuBuilder::new(app, "Kite")
        .about(Some(AboutMetadata { name: Some("Kite".into()), ..Default::default() }))
        .separator()
        .item(&item("settings", "Ayarlar…", "CmdOrCtrl+,")?)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let file = SubmenuBuilder::new(app, "Dosya")
        .item(&item("new_file", "Yeni Dosya", "CmdOrCtrl+N")?)
        .item(&item("new_window", "Yeni Pencere", "CmdOrCtrl+Shift+N")?)
        .separator()
        .item(&item("open_folder", "Klasör Aç…", "CmdOrCtrl+O")?)
        .item(&item("quick_open", "Dosyaya Git…", "CmdOrCtrl+P")?)
        .item(&item("command_palette", "Komut Paleti…", "CmdOrCtrl+Shift+P")?)
        .item(&item("goto_line", "Satıra Git…", "CmdOrCtrl+G")?)
        .separator()
        .item(&item("save", "Kaydet", "CmdOrCtrl+S")?)
        .item(&item("save_as", "Farklı Kaydet…", "CmdOrCtrl+Shift+S")?)
        .separator()
        .item(&item("close_tab", "Sekmeyi Kapat", "CmdOrCtrl+W")?)
        .build()?;

    // Predefined items keep native undo/copy/paste working in text fields
    let edit = SubmenuBuilder::new(app, "Düzen")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let view = SubmenuBuilder::new(app, "Görünüm")
        .item(&item("view_files", "Gezgin", "CmdOrCtrl+Shift+E")?)
        .item(&item("view_search", "Arama", "CmdOrCtrl+Shift+F")?)
        .item(&item("view_git", "Kaynak Kontrolü", "CmdOrCtrl+Shift+G")?)
        .item(&item("view_claude", "Claude Oturumları", "CmdOrCtrl+Shift+C")?)
        .separator()
        .item(&item("toggle_sidebar", "Kenar Çubuğunu Aç/Kapat", "CmdOrCtrl+B")?)
        .item(&item("toggle_terminal", "Terminali Aç/Kapat", "CmdOrCtrl+J")?)
        .item(&item("new_terminal", "Yeni Terminal", "CmdOrCtrl+T")?)
        .item(&item("new_claude", "Yeni Claude Oturumu", "CmdOrCtrl+L")?)
        .separator()
        .item(&item("zoom_in", "Yakınlaştır", "CmdOrCtrl+=")?)
        .item(&item("zoom_out", "Uzaklaştır", "CmdOrCtrl+-")?)
        .item(&item("zoom_reset", "Gerçek Boyut", "CmdOrCtrl+0")?)
        .separator()
        .fullscreen()
        .build()?;

    let window = SubmenuBuilder::new(app, "Pencere")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;

    MenuBuilder::new(app).items(&[&kite, &file, &edit, &view, &window]).build()
}

/// Menu actions go to the focused window only, so two windows never both react
pub fn forward_events(app: &AppHandle) {
    app.on_menu_event(|app, event| {
        let id = event.id().as_ref().to_string();
        if id == "new_window" {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = crate::window::open_window(app).await;
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
