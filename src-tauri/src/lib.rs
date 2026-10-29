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
  tauri::Builder::default()
    .manage(DownloadControlState::default())
    .invoke_handler(tauri::generate_handler![
      commands::download_and_convert,
      commands::cancel_download,
      commands::pause_download,
      commands::resume_download,
      commands::download_batch,
      commands::preview_media,
      commands::get_default_download_dir,
      commands::get_default_video_dir,
      commands::pick_output_directory,
      commands::open_file_location,
      commands::scan_library,
      commands::get_media_cover,
      commands::get_video_thumbnail,
      commands::update_media_tags,
      commands::pick_media_files,
      commands::download_update,
      commands::launch_update
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
