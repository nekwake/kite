//! API keys in the macOS Keychain (service "dev.gokberk.kite"), never on disk in plain text.

const SERVICE: &str = "dev.gokberk.kite";
const ALLOWED: &[&str] = &["openrouter"];

fn entry(name: &str) -> Result<keyring::Entry, String> {
    if !ALLOWED.contains(&name) {
        return Err(format!("bilinmeyen anahtar: {name}"));
    }
    keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn secret_get(name: String) -> Result<Option<String>, String> {
    match entry(&name)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn secret_set(name: String, value: String) -> Result<(), String> {
    let e = entry(&name)?;
    if value.is_empty() {
        return match e.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(err.to_string()),
        };
    }
    e.set_password(&value).map_err(|err| err.to_string())
}
