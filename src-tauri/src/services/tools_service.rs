use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tokio::process::Command;
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::services::media_service::{find_file_recursively, no_window, resolve_binary_path};

const YT_DLP_URL: &str = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
const FFMPEG_URL: &str =
  "https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip";
const DENO_URL: &str =
  "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip";

const REQUIRED_TOOLS: [(&str, &str); 4] = [
  ("yt-dlp", "yt-dlp.exe"),
  ("ffmpeg", "ffmpeg.exe"),
  ("ffprobe", "ffprobe.exe"),
  ("deno", "deno.exe")
];

static INSTALL_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

/// Dossier des outils installés par RapidTunes (yt-dlp, ffmpeg, deno): %LOCALAPPDATA%\RapidTunes\tools.
pub fn tools_dir() -> Option<PathBuf> {
  let base = std::env::var("LOCALAPPDATA").ok()?;
  Some(Path::new(&base).join("RapidTunes").join("tools"))
}

pub fn managed_binary(exe_name: &str) -> Option<PathBuf> {
  let path = tools_dir()?.join(exe_name);
  path.is_file().then_some(path)
}

/// Arguments yt-dlp pour utiliser le runtime JavaScript installé par RapidTunes (requis par YouTube).
/// Appliqué seulement avec le yt-dlp géré par RapidTunes, pour ne pas casser un yt-dlp plus ancien.
pub fn js_runtime_args(yt_dlp: &Path) -> Vec<String> {
  let Some(dir) = tools_dir() else { return Vec::new() };
  let Some(deno) = managed_binary("deno.exe") else { return Vec::new() };
  if yt_dlp.starts_with(&dir) {
    vec!["--js-runtimes".to_string(), format!("deno:{}", deno.to_string_lossy())]
  } else {
    Vec::new()
  }
}

/// Renvoie le chemin de l'outil, en l'installant automatiquement s'il est absent de la machine.
pub async fn require_binary(cmd_name: &str, exe_name: &str) -> AppResult<PathBuf> {
  if let Some(path) = resolve_binary_path(cmd_name, exe_name) {
    return Ok(path);
  }
  install_tool(exe_name).await?;
  resolve_binary_path(cmd_name, exe_name)
    .ok_or_else(|| AppError::CommandFailed(format!("{exe_name} introuvable après installation.")))
}

/// Installe tous les composants nécessaires (appelé en arrière-plan au démarrage).
pub async fn prepare_all() -> AppResult<()> {
  let mut first_error: Option<AppError> = None;
  for (cmd, exe) in REQUIRED_TOOLS {
    if let Err(err) = require_binary(cmd, exe).await {
      first_error.get_or_insert(err);
    }
  }
  first_error.map_or(Ok(()), Err)
}

pub fn missing_tools() -> Vec<&'static str> {
  REQUIRED_TOOLS
    .into_iter()
    .filter(|(cmd, exe)| resolve_binary_path(cmd, exe).is_none())
    .map(|(cmd, _)| cmd)
    .collect()
}

async fn install_tool(exe_name: &str) -> AppResult<()> {
  let _guard = INSTALL_LOCK.get_or_init(|| Mutex::new(())).lock().await;
  // Une installation concurrente a pu terminer pendant l'attente du verrou.
  if managed_binary(exe_name).is_some() {
    return Ok(());
  }
  let dir = tools_dir()
    .ok_or_else(|| AppError::CommandFailed("Dossier de données de l'application introuvable.".to_string()))?;
  fs::create_dir_all(&dir)?;

  match exe_name {
    "yt-dlp.exe" => download_file(YT_DLP_URL, &dir.join("yt-dlp.exe")).await,
    "ffmpeg.exe" | "ffprobe.exe" => install_from_zip(FFMPEG_URL, &dir, &["ffmpeg.exe", "ffprobe.exe"]).await,
    "deno.exe" => install_from_zip(DENO_URL, &dir, &["deno.exe"]).await,
    other => Err(AppError::CommandFailed(format!("Installation automatique non prévue pour {other}.")))
  }
}

async fn download_file(url: &str, target: &Path) -> AppResult<()> {
  let partial = target.with_extension("part");
  let output = no_window(Command::new("curl.exe"))
    .args(["-L", "--fail", "--silent", "--show-error", "--retry", "2", "-o"])
    .arg(&partial)
    .arg(url)
    .output()
    .await
    .map_err(|err| AppError::CommandFailed(format!("Téléchargement impossible (curl): {err}")))?;
  if !output.status.success() {
    let _ = fs::remove_file(&partial);
    return Err(AppError::CommandFailed(format!(
      "Téléchargement impossible: {}",
      String::from_utf8_lossy(&output.stderr).trim()
    )));
  }
  fs::rename(&partial, target)?;
  Ok(())
}

async fn install_from_zip(url: &str, dir: &Path, wanted: &[&str]) -> AppResult<()> {
  let archive = dir.join("download.zip");
  let extracted = dir.join("_extract");
  let _ = fs::remove_dir_all(&extracted);
  fs::create_dir_all(&extracted)?;

  let result = async {
    download_file(url, &archive).await?;
    let output = no_window(Command::new("tar.exe"))
      .arg("-xf")
      .arg(&archive)
      .arg("-C")
      .arg(&extracted)
      .output()
      .await
      .map_err(|err| AppError::CommandFailed(format!("Extraction impossible (tar): {err}")))?;
    if !output.status.success() {
      return Err(AppError::CommandFailed(format!(
        "Extraction impossible: {}",
        String::from_utf8_lossy(&output.stderr).trim()
      )));
    }
    for name in wanted {
      let found = find_file_recursively(&extracted, name)
        .ok_or_else(|| AppError::CommandFailed(format!("{name} absent de l'archive téléchargée.")))?;
      fs::copy(&found, dir.join(name))?;
    }
    Ok(())
  }
  .await;

  let _ = fs::remove_file(&archive);
  let _ = fs::remove_dir_all(&extracted);
  result
}

#[cfg(test)]
mod tests {
  use super::*;

  /// Simule une machine vierge (PATH minimal, dossier de données vide). Réseau requis: `cargo test -- --ignored`.
  #[tokio::test]
  #[ignore]
  async fn installs_missing_tools_on_a_clean_machine() {
    let sandbox = std::env::temp_dir().join("rapidtunes-tools-test");
    let _ = fs::remove_dir_all(&sandbox);
    fs::create_dir_all(&sandbox).unwrap();
    std::env::set_var("LOCALAPPDATA", &sandbox);
    std::env::set_var("PATH", r"C:\Windows\System32");

    assert_eq!(missing_tools().len(), 4);
    prepare_all().await.expect("installation des outils");
    assert!(missing_tools().is_empty(), "outils encore manquants: {:?}", missing_tools());

    let version = no_window(Command::new(managed_binary("yt-dlp.exe").unwrap()))
      .arg("--version")
      .output()
      .await
      .unwrap();
    assert!(version.status.success());
    let _ = fs::remove_dir_all(&sandbox);
  }
}
