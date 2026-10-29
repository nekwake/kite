use serde::Serialize;

const HIDDEN: &[&str] = &[".git", ".DS_Store"];
const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command]
pub async fn read_dir(path: String) -> Result<Vec<Entry>, String> {
    let mut entries: Vec<Entry> = std::fs::read_dir(&path)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if HIDDEN.contains(&name.as_str()) {
                return None;
            }
            // path().is_dir() follows symlinks, so linked folders stay expandable
            let path = e.path();
            Some(Entry {
                is_dir: path.is_dir(),
                path: path.to_string_lossy().into_owned(),
                name,
            })
        })
        .collect();
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > MAX_FILE_SIZE {
        return Err("Dosya çok büyük (10 MB üstü)".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.iter().take(8000).any(|&b| b == 0) {
        return Err("İkili (binary) dosya açılamaz".into());
    }
    String::from_utf8(bytes).map_err(|_| "Dosya UTF-8 değil".into())
}

#[tauri::command]
pub async fn write_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn initial_dir() -> Option<String> {
    // `open -a Kite --args <dir>` or `kite <dir>` passes the folder as the first argument
    let arg = std::env::args().nth(1)?;
    let path = std::fs::canonicalize(arg).ok()?;
    path.is_dir().then(|| path.to_string_lossy().into_owned())
}
