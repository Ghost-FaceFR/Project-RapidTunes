mod commands;
pub mod error;
pub mod models;
pub mod services;

use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

#[derive(Default)]
pub struct DownloadControlState {
  pub active_pid: Mutex<Option<u32>>,
  pub cancel_requested: AtomicBool
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  install_panic_log();
  tauri::Builder::default()
    .plugin(tauri_plugin_autostart::init(
      tauri_plugin_autostart::MacosLauncher::LaunchAgent,
      None
    ))
    .manage(DownloadControlState::default())
    .invoke_handler(tauri::generate_handler![
      commands::download_and_convert,
      commands::cancel_download,
      commands::pause_download,
      commands::resume_download,
      commands::download_batch,
      commands::preview_media,
      commands::search_media,
      commands::get_default_download_dir,
      commands::get_default_video_dir,
      commands::pick_output_directory,
      commands::open_file_location,
      commands::scan_library,
      commands::get_media_cover,
      commands::get_video_thumbnail,
      commands::update_media_tags,
      commands::pick_media_files,
      commands::prepare_tools,
      commands::missing_tools,
      commands::download_update,
      commands::launch_update
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

/// Écrit les plantages Rust dans %LOCALAPPDATA%\\RapidTunes\\logs\\crash.log pour pouvoir les diagnostiquer.
fn install_panic_log() {
  let default_hook = std::panic::take_hook();
  std::panic::set_hook(Box::new(move |info| {
    if let Ok(base) = std::env::var("LOCALAPPDATA") {
      let dir = std::path::Path::new(&base).join("RapidTunes").join("logs");
      if std::fs::create_dir_all(&dir).is_ok() {
        let line = format!("[{}] {info}\n", env!("CARGO_PKG_VERSION"));
        let _ = std::fs::OpenOptions::new()
          .create(true)
          .append(true)
          .open(dir.join("crash.log"))
          .and_then(|mut file| std::io::Write::write_all(&mut file, line.as_bytes()));
      }
    }
    default_hook(info);
  }));
}
