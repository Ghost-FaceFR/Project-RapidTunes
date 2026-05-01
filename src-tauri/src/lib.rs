// lib.rs - Tauri application entry point and command registration

mod downloader;
mod converter;

/// Returns the default downloads directory for the current user.
/// Falls back to the home directory, or the current directory if neither is available.
#[tauri::command]
fn get_default_download_dir() -> String {
    // Try the user's Downloads folder (cross-platform)
    if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
        let downloads = std::path::PathBuf::from(home).join("Downloads");
        if downloads.exists() {
            return downloads.to_string_lossy().to_string();
        }
    }
    // Fallback: home directory
    if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
        return std::path::PathBuf::from(home)
            .to_string_lossy()
            .to_string();
    }
    // Last resort: current directory
    ".".to_string()
}

/// Opens a folder in the system file explorer.
#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            downloader::download_media,
            converter::convert_media,
            get_default_download_dir,
            open_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
