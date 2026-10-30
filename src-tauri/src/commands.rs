use std::sync::atomic::Ordering;
use std::path::Path;

use tauri::{AppHandle, Emitter, Manager, State, Window};
use tokio::process::Command;

use crate::models::{
  BatchDownloadRequest,
  DownloadProgressEvent,
  DownloadRequest,
  JobResult,
  LibraryItem,
  MediaPreview,
  MediaTagsUpdate,
  SearchResult
};
use crate::services::{library_service, media_service, tools_service};
use crate::DownloadControlState;

const DOWNLOAD_PROGRESS_EVENT: &str = "download-progress";

#[tauri::command]
pub async fn download_and_convert(
  window: Window,
  state: State<'_, DownloadControlState>,
  request: DownloadRequest
) -> Result<JobResult, String> {
  state.cancel_requested.store(false, Ordering::SeqCst);

  let result = media_service::process_download_request_with_progress_and_control(
    request,
    |progress: DownloadProgressEvent| {
      window
        .emit(DOWNLOAD_PROGRESS_EVENT, &progress)
        .map_err(|err| {
          crate::error::AppError::CommandFailed(format!(
            "Impossible d'émettre la progression: {err}"
          ))
        })
    },
    |pid| {
      let mut guard = state.active_pid.lock().map_err(|_| {
        crate::error::AppError::CommandFailed(
          "Échec de verrouillage de l'état de téléchargement.".to_string()
        )
      })?;
      *guard = pid;
      Ok(())
    },
    || state.cancel_requested.load(Ordering::SeqCst)
  )
  .await;

  state.cancel_requested.store(false, Ordering::SeqCst);
  if let Ok(mut guard) = state.active_pid.lock() {
    *guard = None;
  }

  result.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn cancel_download(state: State<'_, DownloadControlState>) -> Result<(), String> {
  state.cancel_requested.store(true, Ordering::SeqCst);

  let pid = {
    let guard = state.active_pid.lock().map_err(|_| {
      "Échec de verrouillage de l'état de téléchargement.".to_string()
    })?;
    *guard
  };

  if let Some(active_pid) = pid {
    kill_process_tree(active_pid).await?;
  }

  Ok(())
}

#[tauri::command]
pub async fn pause_download(state: State<'_, DownloadControlState>) -> Result<(), String> {
  let pid = {
    let guard = state.active_pid.lock().map_err(|_| {
      "Échec de verrouillage de l'état de téléchargement.".to_string()
    })?;
    *guard
  };

  if let Some(active_pid) = pid {
    suspend_process_tree(active_pid).await?;
    return Ok(());
  }

  Err("Aucun téléchargement actif à mettre en pause.".to_string())
}

#[tauri::command]
pub async fn resume_download(state: State<'_, DownloadControlState>) -> Result<(), String> {
  let pid = {
    let guard = state.active_pid.lock().map_err(|_| {
      "Échec de verrouillage de l'état de téléchargement.".to_string()
    })?;
    *guard
  };

  if let Some(active_pid) = pid {
    resume_process_tree(active_pid).await?;
    return Ok(());
  }

  Err("Aucun téléchargement actif à reprendre.".to_string())
}

#[tauri::command]
pub async fn download_batch(batch: BatchDownloadRequest) -> Result<Vec<JobResult>, String> {
  media_service::process_batch(batch.jobs)
    .await
    .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn preview_media(url: String) -> Result<MediaPreview, String> {
  media_service::fetch_media_preview(&url)
    .await
    .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn search_media(query: String, limit: Option<usize>) -> Result<Vec<SearchResult>, String> {
  media_service::search_media(&query, limit.unwrap_or(12))
    .await
    .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_default_download_dir() -> Option<String> {
  dirs::download_dir().map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_default_video_dir() -> Option<String> {
  dirs::video_dir().map(|path| path.to_string_lossy().to_string())
}

/// Le sélecteur de dossier est modal: l'exécuter dans une commande synchrone bloquerait la boucle
/// d'événements de la fenêtre (gel, voire plantage sur certaines machines). On le déporte sur un thread dédié.
#[tauri::command]
pub async fn pick_output_directory() -> Option<String> {
  tokio::task::spawn_blocking(|| {
    rfd::FileDialog::new()
      .pick_folder()
      .map(|path| path.to_string_lossy().to_string())
  })
  .await
  .ok()
  .flatten()
}

#[tauri::command]
pub async fn open_file_location(path: String) -> Result<(), String> {
  let normalized_path = path.trim().to_string();
  let target = Path::new(&normalized_path);
  if normalized_path.is_empty() {
    return Err("Chemin vide.".to_string());
  }

  if !target.exists() {
    return Err("Le fichier n'existe pas.".to_string());
  }

  #[cfg(target_os = "windows")]
  {
    let output = Command::new("explorer")
      .args(["/select,", &normalized_path])
      .output()
      .await
      .map_err(|err| format!("Impossible d'ouvrir l'emplacement: {err}"))?;

    if output.status.success() {
      return Ok(());
    }

    return Err(format!(
      "Impossible d'ouvrir l'emplacement: {}",
      String::from_utf8_lossy(&output.stderr).trim()
    ));
  }

  #[cfg(target_os = "macos")]
  {
    let output = Command::new("open")
      .args(["-R", &normalized_path])
      .output()
      .await
      .map_err(|err| format!("Impossible d'ouvrir l'emplacement: {err}"))?;

    if output.status.success() {
      return Ok(());
    }

    return Err(format!(
      "Impossible d'ouvrir l'emplacement: {}",
      String::from_utf8_lossy(&output.stderr).trim()
    ));
  }

  #[cfg(all(unix, not(target_os = "macos")))]
  {
    let parent = target.parent().unwrap_or(target);
    let output = Command::new("xdg-open")
      .arg(parent)
      .output()
      .await
      .map_err(|err| format!("Impossible d'ouvrir l'emplacement: {err}"))?;

    if output.status.success() {
      return Ok(());
    }

    return Err(format!(
      "Impossible d'ouvrir l'emplacement: {}",
      String::from_utf8_lossy(&output.stderr).trim()
    ));
  }
}

#[cfg(target_os = "windows")]
async fn kill_process_tree(pid: u32) -> Result<(), String> {
  let pid_str = pid.to_string();
  let output = media_service::no_window(Command::new("taskkill"))
    .args(["/PID", &pid_str, "/T", "/F"])
    .output()
    .await
    .map_err(|err| format!("Impossible d'annuler le téléchargement: {err}"))?;

  if output.status.success() {
    return Ok(());
  }

  let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
  if stderr.contains("not found")
    || stderr.contains("aucune instance")
    || stderr.contains("introuvable")
  {
    return Ok(());
  }

  Err(format!(
    "Impossible d'annuler le téléchargement: {}",
    String::from_utf8_lossy(&output.stderr).trim()
  ))
}

#[cfg(target_os = "windows")]
async fn suspend_process_tree(pid: u32) -> Result<(), String> {
  run_windows_process_tree_action(pid, "Suspend-Process", "mettre en pause")
    .await
}

#[cfg(target_os = "windows")]
async fn resume_process_tree(pid: u32) -> Result<(), String> {
  run_windows_process_tree_action(pid, "Resume-Process", "reprendre")
    .await
}

#[cfg(target_os = "windows")]
async fn run_windows_process_tree_action(
  pid: u32,
  action_cmdlet: &str,
  action_label: &str
) -> Result<(), String> {
  let script = format!(
    r#"
function Get-ChildProcessIds([int]$ParentId) {{
  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ParentId" | Select-Object -ExpandProperty ProcessId
  foreach ($child in $children) {{
    $child
    Get-ChildProcessIds -ParentId $child
  }}
}}

$ids = @({pid}) + (Get-ChildProcessIds -ParentId {pid})
$ids = $ids | Where-Object {{ $_ -ne $null }} | Sort-Object -Unique

foreach ($id in $ids) {{
  try {{
    {action_cmdlet} -Id $id -ErrorAction Stop | Out-Null
  }} catch {{
  }}
}}
"#
  );

  let output = media_service::no_window(Command::new("powershell"))
    .args(["-NoProfile", "-NonInteractive", "-Command", &script])
    .output()
    .await
    .map_err(|err| format!("Impossible de {action_label} le téléchargement: {err}"))?;

  if output.status.success() {
    return Ok(());
  }

  Err(format!(
    "Impossible de {action_label} le téléchargement: {}",
    String::from_utf8_lossy(&output.stderr).trim()
  ))
}

#[cfg(not(target_os = "windows"))]
async fn kill_process_tree(pid: u32) -> Result<(), String> {
  let pid_str = pid.to_string();
  let output = Command::new("kill")
    .args(["-TERM", &pid_str])
    .output()
    .await
    .map_err(|err| format!("Impossible d'annuler le téléchargement: {err}"))?;

  if output.status.success() {
    return Ok(());
  }

  Err(format!(
    "Impossible d'annuler le téléchargement: {}",
    String::from_utf8_lossy(&output.stderr).trim()
  ))
}

#[cfg(not(target_os = "windows"))]
async fn suspend_process_tree(pid: u32) -> Result<(), String> {
  let pid_str = pid.to_string();
  let output = Command::new("kill")
    .args(["-STOP", &pid_str])
    .output()
    .await
    .map_err(|err| format!("Impossible de mettre en pause le téléchargement: {err}"))?;

  if output.status.success() {
    return Ok(());
  }

  Err(format!(
    "Impossible de mettre en pause le téléchargement: {}",
    String::from_utf8_lossy(&output.stderr).trim()
  ))
}

#[cfg(not(target_os = "windows"))]
async fn resume_process_tree(pid: u32) -> Result<(), String> {
  let pid_str = pid.to_string();
  let output = Command::new("kill")
    .args(["-CONT", &pid_str])
    .output()
    .await
    .map_err(|err| format!("Impossible de reprendre le téléchargement: {err}"))?;

  if output.status.success() {
    return Ok(());
  }

  Err(format!(
    "Impossible de reprendre le téléchargement: {}",
    String::from_utf8_lossy(&output.stderr).trim()
  ))
}

#[tauri::command]
pub async fn scan_library(
  app: AppHandle,
  folders: Vec<String>,
  recursive: bool,
  kind: String
) -> Result<Vec<LibraryItem>, String> {
  let existing: Vec<String> = folders
    .into_iter()
    .filter(|folder| Path::new(folder).is_dir())
    .collect();

  for folder in &existing {
    app
      .asset_protocol_scope()
      .allow_directory(folder, true)
      .map_err(|err| format!("Impossible d'autoriser le dossier {folder}: {err}"))?;
  }

  tokio::task::spawn_blocking(move || library_service::scan_folders(&existing, recursive, &kind))
    .await
    .map_err(|err| format!("Analyse de la bibliothèque interrompue: {err}"))
}

#[tauri::command]
pub async fn get_media_cover(path: String) -> Option<String> {
  tokio::task::spawn_blocking(move || library_service::read_cover(&path))
    .await
    .ok()
    .flatten()
}

#[tauri::command]
pub async fn get_video_thumbnail(path: String) -> Option<String> {
  tokio::task::spawn_blocking(move || library_service::read_video_thumbnail(&path))
    .await
    .ok()
    .flatten()
}

#[tauri::command]
pub async fn update_media_tags(updates: Vec<MediaTagsUpdate>) -> Result<(), String> {
  tokio::task::spawn_blocking(move || {
    for update in &updates {
      library_service::write_tags(update)?;
    }
    Ok(())
  })
  .await
  .map_err(|err| format!("Enregistrement interrompu: {err}"))?
}

#[tauri::command]
pub async fn pick_media_files(app: AppHandle) -> Result<Vec<LibraryItem>, String> {
  tokio::task::spawn_blocking(move || {
    let extensions: Vec<&str> = library_service::AUDIO_EXTENSIONS
      .iter()
      .chain(library_service::VIDEO_EXTENSIONS.iter())
      .copied()
      .collect();

    let Some(paths) = rfd::FileDialog::new()
      .add_filter("Musiques et vidéos", &extensions)
      .pick_files()
    else {
      return Ok(Vec::new());
    };

    let mut texts = Vec::with_capacity(paths.len());
    for path in &paths {
      app
        .asset_protocol_scope()
        .allow_file(path)
        .map_err(|err| format!("Impossible d'autoriser le fichier: {err}"))?;
      texts.push(path.to_string_lossy().to_string());
    }

    Ok(library_service::scan_files(&texts))
  })
  .await
  .map_err(|err| format!("Ouverture interrompue: {err}"))?
}

const UPDATE_URL_PREFIX: &str = "https://github.com/Ghost-FaceFR/Project-RapidTunes/";

fn update_directory() -> std::path::PathBuf {
  std::env::temp_dir().join("RapidTunes-update")
}

#[tauri::command]
pub async fn download_update(url: String, file_name: String) -> Result<String, String> {
  if !url.starts_with(UPDATE_URL_PREFIX) {
    return Err("URL de mise à jour non autorisée.".to_string());
  }

  let safe_name = Path::new(&file_name)
    .file_name()
    .and_then(|name| name.to_str())
    .filter(|name| !name.is_empty())
    .ok_or_else(|| "Nom de fichier invalide.".to_string())?
    .to_string();

  let directory = update_directory();
  std::fs::create_dir_all(&directory)
    .map_err(|err| format!("Impossible de créer le dossier de mise à jour: {err}"))?;
  let target = directory.join(&safe_name);

  let mut command = Command::new("curl.exe");
  command
    .args(["-L", "--fail", "--silent", "--show-error", "-o"])
    .arg(&target)
    .arg(&url);
  #[cfg(target_os = "windows")]
  command.creation_flags(0x0800_0000);

  let output = command
    .output()
    .await
    .map_err(|err| format!("Téléchargement impossible: {err}"))?;
  if !output.status.success() {
    let _ = std::fs::remove_file(&target);
    return Err(format!(
      "Téléchargement impossible: {}",
      String::from_utf8_lossy(&output.stderr).trim()
    ));
  }

  Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn launch_update(app: AppHandle, path: String) -> Result<(), String> {
  let target = Path::new(&path)
    .canonicalize()
    .map_err(|_| "Le fichier de mise à jour est introuvable.".to_string())?;
  let allowed = update_directory()
    .canonicalize()
    .map_err(|_| "Dossier de mise à jour introuvable.".to_string())?;
  if !target.starts_with(&allowed) {
    return Err("Fichier de mise à jour non autorisé.".to_string());
  }

  #[cfg(target_os = "windows")]
  {
    media_service::no_window_std(std::process::Command::new("cmd"))
      .args(["/C", "start", ""])
      .arg(&target)
      .spawn()
      .map_err(|err| format!("Impossible de lancer la mise à jour: {err}"))?;
  }
  #[cfg(not(target_os = "windows"))]
  {
    return Err("Mise à jour automatique disponible uniquement sous Windows.".to_string());
  }

  app.exit(0);
  Ok(())
}

/// Installe en arrière-plan yt-dlp, ffmpeg et deno s'ils sont absents. Renvoie true si quelque chose manquait.
#[tauri::command]
pub async fn prepare_tools() -> Result<bool, String> {
  let had_missing = !tools_service::missing_tools().is_empty();
  tools_service::prepare_all().await.map_err(|err| err.to_string())?;
  Ok(had_missing)
}

#[tauri::command]
pub fn missing_tools() -> Vec<String> {
  tools_service::missing_tools().into_iter().map(String::from).collect()
}
