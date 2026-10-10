//! ChipForge desktop: the web app in a native window, offline, with native Save dialogs.

// No extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request};
use tauri_plugin_dialog::DialogExt;

/// Saves an export through the system Save dialog. The request body is the file's
/// bytes and the `x-file-name` header (URI-encoded) the suggested name. Returns false
/// when the user cancels.
#[tauri::command]
async fn save_file(app: tauri::AppHandle, request: Request<'_>) -> Result<bool, String> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err("expected the file's bytes".into());
    };
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .map(|v| percent_decode_str(v).decode_utf8_lossy().into_owned())
        .unwrap_or_else(|| "export".into());
    let mut dialog = app.dialog().file().set_file_name(&name);
    if let Some((_, ext)) = name.rsplit_once('.') {
        dialog = dialog.add_filter(ext.to_uppercase(), &[ext]);
    }
    let Some(path) = dialog.blocking_save_file() else {
        return Ok(false);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| format!("Couldn't save {}: {e}", path.display()))?;
    Ok(true)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_file])
        .run(tauri::generate_context!())
        .expect("ChipForge could not start");
}
