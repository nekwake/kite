//! Native macOS menu bar. Custom items emit a `menu` event carrying their id;
//! the frontend maps ids to the same actions as its keyboard shortcuts.

use tauri::menu::{AboutMetadata, Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Runtime};

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
        .item(&item("open_folder", "Klasör Aç…", "CmdOrCtrl+O")?)
        .item(&item("quick_open", "Dosyaya Git…", "CmdOrCtrl+P")?)
        .separator()
        .item(&item("save", "Kaydet", "CmdOrCtrl+S")?)
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

pub fn forward_events<R: Runtime>(app: &AppHandle<R>) {
    app.on_menu_event(|app, event| {
        let _ = app.emit("menu", event.id().as_ref());
    });
}
