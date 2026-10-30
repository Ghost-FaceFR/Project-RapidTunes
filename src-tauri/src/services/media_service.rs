use regex::Regex;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

use crate::error::{AppError, AppResult};
use crate::services::tools_service;
use crate::models::{
  BatchDownloadRequest,
  DownloadProgressEvent,
  DownloadRequest,
  JobResult,
  MediaMode,
  MediaPreview,
  SearchResult
};

const AUDIO_FORMATS: &[&str] = &["mp3", "wav", "flac", "aac"];
const VIDEO_FORMATS: &[&str] = &["mp4"];
const AUDIO_QUALITIES: &[&str] = &["96kbps", "128kbps", "160kbps", "192kbps", "256kbps", "320kbps"];
const VIDEO_QUALITIES: &[&str] = &["360p", "480p", "720p", "1080p", "1440p", "2160p"];

#[derive(Debug, Clone, Copy)]
enum OutputStream {
  Stdout,
  Stderr
}

pub async fn fetch_media_preview(raw_url: &str) -> AppResult<MediaPreview> {
  let url = raw_url.trim();
  validate_preview_url(url)?;

  let yt_dlp = tools_service::require_binary("yt-dlp", "yt-dlp.exe").await?;

  let output = tokio::time::timeout(
    std::time::Duration::from_secs(120),
    no_window(Command::new(&yt_dlp))
      .args(tools_service::js_runtime_args(&yt_dlp))
      .args([
        "--skip-download",
        "--dump-single-json",
        "--flat-playlist",
        "--no-warnings",
        "--no-call-home",
        url
      ])
      .output()
  )
  .await
  .map_err(|_| {
    AppError::CommandFailed("L'analyse du lien a dépassé 2 minutes. Réessaie.".to_string())
  })??;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    return Err(AppError::CommandFailed(format!(
      "Impossible de récupérer l'aperçu média: {}",
      compact_output(&stderr)
    )));
  }

  let stdout = String::from_utf8_lossy(&output.stdout).to_string();
  let json: Value = serde_json::from_str(&stdout)
    .map_err(|err| AppError::Validation(format!("Aperçu JSON invalide: {err}")))?;

  Ok(build_preview_from_json(url, &json))
}

pub async fn process_batch(jobs: Vec<DownloadRequest>) -> AppResult<Vec<JobResult>> {
  if jobs.is_empty() {
    return Err(AppError::Validation("Le batch ne contient aucun job.".to_string()));
  }

  let mut results = Vec::with_capacity(jobs.len());

  for job in jobs {
    match process_download_request(job).await {
      Ok(ok_result) => results.push(ok_result),
      Err(err) => results.push(JobResult {
        success: false,
        message: err.to_string(),
        output_path: None
      })
    }
  }

  Ok(results)
}

pub async fn process_download_request(request: DownloadRequest) -> AppResult<JobResult> {
  process_download_request_with_progress_and_control(
    request,
    |_| Ok(()),
    |_| Ok(()),
    || false
  )
  .await
}

pub async fn process_download_request_with_progress<F>(
  request: DownloadRequest,
  emit_progress: F
) -> AppResult<JobResult>
where
  F: FnMut(DownloadProgressEvent) -> AppResult<()>
{
  process_download_request_with_progress_and_control(request, emit_progress, |_| Ok(()), || false)
    .await
}

/// Télécharge; si Windows refuse l'écriture dans le dossier choisi (« Accès contrôlé aux dossiers »),
/// relance automatiquement dans un dossier non protégé (Téléchargements\RapidTunes) et le signale.
pub async fn process_download_request_with_progress_and_control<F, G, H>(
  request: DownloadRequest,
  mut emit_progress: F,
  mut set_active_pid: G,
  mut is_cancel_requested: H
) -> AppResult<JobResult>
where
  F: FnMut(DownloadProgressEvent) -> AppResult<()>,
  G: FnMut(Option<u32>) -> AppResult<()>,
  H: FnMut() -> bool
{
  let first = run_download_once(
    request.clone(),
    &mut emit_progress,
    &mut set_active_pid,
    &mut is_cancel_requested
  )
  .await;

  let denied = matches!(&first, Err(AppError::CommandFailed(message)) if is_access_denied(message));
  if !denied {
    return first;
  }
  let Some(fallback) = fallback_output_dir(request.output_dir.as_deref()) else {
    return first;
  };

  let fallback_text = fallback.to_string_lossy().to_string();
  let _ = fs::create_dir_all(&fallback);
  let mut retry_request = request;
  retry_request.output_dir = Some(fallback_text.clone());
  let retried = run_download_once(
    retry_request,
    &mut emit_progress,
    &mut set_active_pid,
    &mut is_cancel_requested
  )
  .await;

  match retried {
    Ok(mut result) => {
      result.message = format!(
        "{} Windows protège le dossier choisi : le fichier a été enregistré dans {fallback_text}.",
        result.message
      );
      Ok(result)
    }
    Err(_) => first
  }
}

async fn run_download_once<F, G, H>(
  mut request: DownloadRequest,
  mut emit_progress: &mut F,
  set_active_pid: &mut G,
  is_cancel_requested: &mut H
) -> AppResult<JobResult>
where
  F: FnMut(DownloadProgressEvent) -> AppResult<()>,
  G: FnMut(Option<u32>) -> AppResult<()>,
  H: FnMut() -> bool
{
  normalize_request(&mut request);
  validate_request(&request)?;

  let configured_rate_limit_kibps = request.speed_limit_kibps.map(|value| value as f64);

  emit_progress_event(
    &mut emit_progress,
    "preparing",
    Some(0.0),
    "Préparation du téléchargement...",
    None,
    None,
    configured_rate_limit_kibps
  )?;

  if !tools_service::missing_tools().is_empty() {
    emit_progress_event(
      &mut emit_progress,
      "preparing",
      Some(0.0),
      "Installation des composants requis (première utilisation, quelques minutes)...",
      None,
      None,
      configured_rate_limit_kibps
    )?;
  }
  let yt_dlp = tools_service::require_binary("yt-dlp", "yt-dlp.exe").await?;
  let ffmpeg = tools_service::require_binary("ffmpeg", "ffmpeg.exe").await.ok();

  let mut args = tools_service::js_runtime_args(&yt_dlp);
  args.extend(build_yt_dlp_args(&request, ffmpeg.as_deref()));

  let mut child = no_window(Command::new(&yt_dlp))
    .args(&args)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()?;

  set_active_pid(child.id())?;

  let stdout = child.stdout.take().ok_or_else(|| {
    AppError::CommandFailed("Impossible de capturer la sortie standard yt-dlp.".to_string())
  })?;
  let stderr = child.stderr.take().ok_or_else(|| {
    AppError::CommandFailed("Impossible de capturer la sortie d'erreur yt-dlp.".to_string())
  })?;

  let (tx, mut rx) = mpsc::unbounded_channel::<(OutputStream, String)>();

  let stdout_task = tokio::spawn(forward_process_output(stdout, OutputStream::Stdout, tx.clone()));
  let stderr_task = tokio::spawn(forward_process_output(stderr, OutputStream::Stderr, tx.clone()));
  drop(tx);

  let mut stdout_lines: Vec<String> = Vec::new();
  let mut stderr_lines: Vec<String> = Vec::new();
  let mut conversion_started = false;
  let mut conversion_total_seconds: Option<f64> = None;
  let mut last_download_percent: Option<f64> = None;
  let mut last_conversion_percent: Option<f64> = None;
  let mut last_download_speed_kibps: Option<f64> = None;
  let mut last_download_speed_text: Option<String> = None;

  while let Some((stream, line)) = rx.recv().await {
    let trimmed = line.trim();
    if trimmed.is_empty() {
      continue;
    }

    match stream {
      OutputStream::Stdout => stdout_lines.push(trimmed.to_string()),
      OutputStream::Stderr => stderr_lines.push(trimmed.to_string())
    }

    if let Some(percent) = parse_download_percent(trimmed) {
      let parsed_speed = parse_download_speed(trimmed);
      let speed_changed = match (last_download_speed_kibps, parsed_speed.as_ref()) {
        (Some(previous), Some((current, _))) => (current - previous).abs() >= 32.0,
        (None, Some(_)) => true,
        _ => false
      };

      if let Some((speed_kibps, speed_text)) = parsed_speed {
        last_download_speed_kibps = Some(speed_kibps.max(0.0));
        last_download_speed_text = Some(speed_text);
      }

      let should_emit = last_download_percent
        .map(|last| (percent - last).abs() >= 0.5)
        .unwrap_or(true)
        || percent >= 99.8
        || speed_changed;

      if should_emit {
        last_download_percent = Some(percent);
        emit_progress_event(
          &mut emit_progress,
          "downloading",
          Some(percent),
          format!("Téléchargement: {percent:.1}%"),
          last_download_speed_kibps,
          last_download_speed_text.as_deref(),
          configured_rate_limit_kibps
        )?;
      }
    }

    if line_indicates_conversion_start(trimmed) && !conversion_started {
      conversion_started = true;
      emit_progress_event(
        &mut emit_progress,
        "converting",
        None,
        "Conversion en cours...",
        None,
        None,
        configured_rate_limit_kibps
      )?;
    }

    if let Some(total) = parse_conversion_duration_seconds(trimmed) {
      conversion_total_seconds = Some(total);
    }

    if conversion_started {
      if let (Some(total), Some(current)) = (
        conversion_total_seconds,
        parse_conversion_time_seconds(trimmed)
      ) {
        let percent = ((current / total) * 100.0).clamp(0.0, 100.0);
        let should_emit = last_conversion_percent
          .map(|last| (percent - last).abs() >= 1.0)
          .unwrap_or(true)
          || percent >= 99.8;

        if should_emit {
          last_conversion_percent = Some(percent);
          emit_progress_event(
            &mut emit_progress,
            "converting",
            Some(percent),
            format!("Conversion: {percent:.1}%"),
            None,
            None,
            configured_rate_limit_kibps
          )?;
        }
      }
    }
  }

  match stdout_task.await {
    Ok(Ok(())) => {}
    Ok(Err(err)) => return Err(AppError::Io(err)),
    Err(err) => {
      return Err(AppError::CommandFailed(format!(
        "Lecture de la sortie standard impossible: {err}"
      )));
    }
  }

  match stderr_task.await {
    Ok(Ok(())) => {}
    Ok(Err(err)) => return Err(AppError::Io(err)),
    Err(err) => {
      return Err(AppError::CommandFailed(format!(
        "Lecture de la sortie d'erreur impossible: {err}"
      )));
    }
  }

  let status = child.wait().await?;
  set_active_pid(None)?;

  let stdout = stdout_lines.join("\n");
  let stderr = stderr_lines.join("\n");

  if status.success() {
    emit_progress_event(
      &mut emit_progress,
      "completed",
      Some(100.0),
      if conversion_started {
        "Téléchargement et conversion terminés."
      } else {
        "Téléchargement terminé."
      },
      None,
      None,
      configured_rate_limit_kibps
    )?;

    Ok(JobResult {
      success: true,
      message: summarize_success(&stdout),
      output_path: request.output_dir.clone()
    })
  } else {
    if is_cancel_requested() {
      emit_progress_event(
        &mut emit_progress,
        "cancelled",
        None,
        "Téléchargement annulé.",
        None,
        None,
        configured_rate_limit_kibps
      )?;

      return Err(AppError::CommandFailed(
        "Téléchargement annulé par l'utilisateur.".to_string()
      ));
    }

    let failure_output = if stderr.trim().is_empty() { &stdout } else { &stderr };
    emit_progress_event(
      &mut emit_progress,
      "error",
      None,
      compact_output(failure_output),
      None,
      None,
      configured_rate_limit_kibps
    )?;

    Err(AppError::CommandFailed(format!(
      "yt-dlp a échoué: {}",
      compact_output(failure_output)
    )))
  }
}

pub fn parse_batch_json(raw: &str) -> AppResult<Vec<DownloadRequest>> {
  if let Ok(wrapper) = serde_json::from_str::<BatchDownloadRequest>(raw) {
    if wrapper.jobs.is_empty() {
      return Err(AppError::Validation(
        "Le fichier batch est valide mais vide.".to_string()
      ));
    }

    return Ok(wrapper.jobs);
  }

  if let Ok(direct_list) = serde_json::from_str::<Vec<DownloadRequest>>(raw) {
    if direct_list.is_empty() {
      return Err(AppError::Validation(
        "La liste de jobs batch est vide.".to_string()
      ));
    }

    return Ok(direct_list);
  }

  Err(AppError::Validation(
    "Format JSON batch invalide. Utilise {\"jobs\": [...]} ou [...].".to_string()
  ))
}

pub fn validate_request(request: &DownloadRequest) -> AppResult<()> {
  let url_regex = Regex::new(r"^https?://")
    .map_err(|err| AppError::Validation(format!("Regex URL invalide: {err}")))?;

  if !url_regex.is_match(&request.url) {
    return Err(AppError::Validation(
      "URL invalide: une URL http/https est attendue.".to_string()
    ));
  }

  match request.mode {
    MediaMode::Audio | MediaMode::ExtractAudio => {
      if !AUDIO_FORMATS.contains(&request.format.as_str()) {
        return Err(AppError::Validation(format!(
          "Format {} non supporté pour le mode {}.",
          request.format,
          request.mode.as_str()
        )));
      }

      if !AUDIO_QUALITIES.contains(&request.quality.as_str()) {
        return Err(AppError::Validation(format!(
          "Qualité {} non supportée pour audio.",
          request.quality
        )));
      }
    }
    MediaMode::Video => {
      if !VIDEO_FORMATS.contains(&request.format.as_str()) {
        return Err(AppError::Validation(
          "Pour le mode vidéo, seul le format mp4 est supporté dans cette base."
            .to_string()
        ));
      }

      let (audio_quality, video_quality) = parse_video_quality(&request.quality);

      if !AUDIO_QUALITIES.contains(&audio_quality) || !VIDEO_QUALITIES.contains(&video_quality) {
        return Err(AppError::Validation(format!(
          "Qualité {} non supportée pour vidéo (audio: 96-320kbps, vidéo: 360p-2160p).",
          request.quality
        )));
      }
    }
  }

  Ok(())
}

fn normalize_request(request: &mut DownloadRequest) {
  request.url = request.url.trim().to_string();
  request.format = request.format.trim().to_lowercase();
  request.quality = request.quality.trim().to_lowercase();

  if !request.is_playlist && looks_like_playlist_url(&request.url) {
    request.is_playlist = true;
  }

  if let Some(output_dir) = request.output_dir.as_ref() {
    let trimmed = output_dir.trim();
    if trimmed.is_empty() {
      request.output_dir = None;
    } else {
      request.output_dir = Some(trimmed.replace('\\', "/"));
    }
  }

  if matches!(request.speed_limit_kibps, Some(0)) {
    request.speed_limit_kibps = None;
  }
}

fn looks_like_playlist_url(url: &str) -> bool {
  let lowered = url.to_ascii_lowercase();

  if lowered.contains("youtube.com/playlist") || lowered.contains("music.youtube.com/playlist") {
    return true;
  }

  let has_list = lowered.contains("list=");
  let has_video = lowered.contains("v=");

  has_list && !has_video
}

fn build_yt_dlp_args(request: &DownloadRequest, ffmpeg_bin: Option<&Path>) -> Vec<String> {
  let mut args = Vec::new();

  if !request.is_playlist {
    args.push("--no-playlist".to_string());
  }

  args.push("--encoding".to_string());
  args.push("utf-8".to_string());
  args.push("--newline".to_string());
  args.push("--force-overwrites".to_string());
  args.push("--add-metadata".to_string());
  if let Some(ffmpeg_path) = ffmpeg_bin.and_then(Path::parent) {
    args.push("--ffmpeg-location".to_string());
    args.push(ffmpeg_path.to_string_lossy().to_string());
  }
  args.push("-o".to_string());
  args.push(build_output_template(request.output_dir.as_deref()));

  if let Some(limit_kibps) = request.speed_limit_kibps.filter(|value| *value > 0) {
    args.push("--limit-rate".to_string());
    args.push(format!("{limit_kibps}K"));
  }

  match request.mode {
    MediaMode::Audio | MediaMode::ExtractAudio => {
      args.push("-x".to_string());
      args.push("--audio-format".to_string());
      args.push(request.format.clone());
      // yt-dlp ajoute "-q:a 5" (VBR ~130 kbps) par défaut, ce qui écrase "-b:a".
      // Une valeur finissant par "K" est traduite en "-b:a" (débit constant demandé).
      args.push("--audio-quality".to_string());
      args.push(audio_bitrate(&request.quality).to_uppercase());
      // Pochette intégrée (formats qui acceptent une image attachée).
      if matches!(request.format.as_str(), "mp3" | "flac") {
        args.push("--embed-thumbnail".to_string());
        args.push("--convert-thumbnails".to_string());
        args.push("jpg".to_string());
      }
    }
    MediaMode::Video => {
      args.push("-f".to_string());
      args.push(video_selector(&request.quality).to_string());
      args.push("--recode-video".to_string());
      args.push("mp4".to_string());
    }
  }

  args.push(request.url.clone());
  args
}

fn build_output_template(output_dir: Option<&str>) -> String {
  match output_dir {
    Some(dir) if !dir.is_empty() => format!("{dir}/%(title)s.%(ext)s"),
    _ => "%(title)s.%(ext)s".to_string()
  }
}

fn audio_bitrate(quality: &str) -> &'static str {
  match quality {
    "96kbps" => "96k",
    "160kbps" => "160k",
    "192kbps" => "192k",
    "256kbps" => "256k",
    "320kbps" => "320k",
    _ => "128k"
  }
}

fn video_selector(quality: &str) -> String {
  let (audio_quality, video_quality) = parse_video_quality(quality);
  let audio_limit = audio_bitrate(audio_quality).trim_end_matches('k');

  let video_selector = match video_quality {
    "360p" => "bestvideo[height<=360]",
    "480p" => "bestvideo[height<=480]",
    "720p" => "bestvideo[height<=720]",
    "1080p" => "bestvideo[height<=1080]",
    "1440p" => "bestvideo[height<=1440]",
    "2160p" => "bestvideo[height<=2160]",
    _ => "bestvideo[height<=1080]"
  };

  format!(
    "{video_selector}+bestaudio[abr<={audio_limit}]/best[height<={}]",
    video_quality.trim_end_matches('p')
  )
}

fn parse_video_quality(raw: &str) -> (&str, &str) {
  if let Some((audio, video)) = raw.split_once('|') {
    let audio_quality = if AUDIO_QUALITIES.contains(&audio) { audio } else { "128kbps" };
    let video_quality = if VIDEO_QUALITIES.contains(&video) { video } else { "1080p" };
    return (audio_quality, video_quality);
  }

  if VIDEO_QUALITIES.contains(&raw) {
    return ("128kbps", raw);
  }

  ("128kbps", "1080p")
}

fn emit_progress_event<F>(
  emit_progress: &mut F,
  phase: &str,
  percent: Option<f64>,
  message: impl Into<String>,
  download_speed_kibps: Option<f64>,
  download_speed_text: Option<&str>,
  rate_limit_kibps: Option<f64>
) -> AppResult<()>
where
  F: FnMut(DownloadProgressEvent) -> AppResult<()>
{
  emit_progress(DownloadProgressEvent {
    phase: phase.to_string(),
    percent: percent.map(|value| value.clamp(0.0, 100.0)),
    message: message.into(),
    download_speed_kibps: download_speed_kibps.map(|value| value.max(0.0)),
    download_speed_text: download_speed_text.map(ToString::to_string),
    rate_limit_kibps: rate_limit_kibps.map(|value| value.max(0.0))
  })
}

async fn forward_process_output<R>(
  reader: R,
  stream: OutputStream,
  tx: mpsc::UnboundedSender<(OutputStream, String)>
) -> std::io::Result<()>
where
  R: AsyncRead + Unpin + Send + 'static
{
  // Lecture en octets puis décodage tolérant: yt-dlp peut émettre autre chose que de l'UTF-8
  // (page de code Windows, titres accentués) et `lines()` échouerait avec "stream did not contain valid UTF-8".
  let mut reader = BufReader::new(reader);
  let mut buffer = Vec::new();

  loop {
    buffer.clear();
    if reader.read_until(b'\n', &mut buffer).await? == 0 {
      break;
    }
    let line = String::from_utf8_lossy(&buffer).trim_end_matches(['\r', '\n']).to_string();
    if tx.send((stream, line)).is_err() {
      break;
    }
  }

  Ok(())
}

fn parse_download_percent(line: &str) -> Option<f64> {
  let marker_index = line.find("[download]")?;
  let value_chunk = line[(marker_index + "[download]".len())..].trim_start();

  let numeric: String = value_chunk
    .chars()
    .take_while(|ch| ch.is_ascii_digit() || *ch == '.')
    .collect();

  if numeric.is_empty() {
    return None;
  }

  numeric
    .parse::<f64>()
    .ok()
    .map(|value| value.clamp(0.0, 100.0))
}

fn parse_download_speed(line: &str) -> Option<(f64, String)> {
  let marker_index = line.find("[download]")?;
  let value_chunk = line[(marker_index + "[download]".len())..].trim_start();
  let speed_token = value_chunk
    .split_whitespace()
    .find(|token| token.contains("/s"))?
    .trim_matches(|ch: char| ch == ',' || ch == ';' || ch == ')' || ch == '(');

  let slash_index = speed_token.find('/')?;
  let unit_chunk = &speed_token[..slash_index];
  let unit_start = unit_chunk.find(|ch: char| ch.is_ascii_alphabetic())?;

  let (raw_value, raw_unit) = unit_chunk.split_at(unit_start);
  let value = raw_value.parse::<f64>().ok()?;
  let unit = raw_unit.trim().to_ascii_lowercase();

  let kibps = match unit.as_str() {
    "b" => value / 1024.0,
    "kb" | "kib" => value,
    "mb" | "mib" => value * 1024.0,
    "gb" | "gib" => value * 1024.0 * 1024.0,
    _ => return None
  };

  Some((kibps.max(0.0), speed_token.to_string()))
}

fn line_indicates_conversion_start(line: &str) -> bool {
  line.contains("[ExtractAudio]")
    || line.contains("[Merger]")
    || line.contains("[VideoConvertor]")
    || line.contains("[ffmpeg]")
    || line.contains("Converting")
}

fn parse_conversion_duration_seconds(line: &str) -> Option<f64> {
  let marker = "Duration:";
  let start = line.find(marker)? + marker.len();
  let raw = line[start..].trim_start();
  let timestamp = raw
    .split([',', ' '])
    .find(|token| token.contains(':'))
    .unwrap_or_default();

  parse_timestamp_to_seconds(timestamp)
}

fn parse_conversion_time_seconds(line: &str) -> Option<f64> {
  let marker = "time=";
  let start = line.find(marker)? + marker.len();
  let raw = line[start..].trim_start();
  let timestamp = raw
    .split_whitespace()
    .next()
    .unwrap_or_default();

  parse_timestamp_to_seconds(timestamp)
}

fn parse_timestamp_to_seconds(timestamp: &str) -> Option<f64> {
  let mut parts = timestamp.split(':');
  let hours = parts.next()?.parse::<f64>().ok()?;
  let minutes = parts.next()?.parse::<f64>().ok()?;
  let seconds = parts.next()?.parse::<f64>().ok()?;

  Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

pub(crate) fn resolve_binary_path(cmd_name: &str, exe_name: &str) -> Option<PathBuf> {
  if command_exists(cmd_name) {
    return Some(PathBuf::from(cmd_name));
  }

  if let Some(managed) = crate::services::tools_service::managed_binary(exe_name) {
    return Some(managed);
  }

  let local_app_data = std::env::var("LOCALAPPDATA").ok()?;
  let winget_packages = Path::new(&local_app_data).join("Microsoft").join("WinGet").join("Packages");
  find_file_recursively(&winget_packages, exe_name)
}

/// Empêche l'apparition d'une fenêtre console pour les processus lancés (Windows).
pub(crate) fn no_window(mut command: Command) -> Command {
  #[cfg(windows)]
  command.creation_flags(0x0800_0000);
  command
}

pub(crate) fn no_window_std(mut command: std::process::Command) -> std::process::Command {
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    command.creation_flags(0x0800_0000);
  }
  command
}

fn command_exists(cmd_name: &str) -> bool {
  no_window_std(std::process::Command::new(cmd_name))
    .arg("--version")
    .output()
    .map(|output| output.status.success())
    .unwrap_or(false)
}

pub(crate) fn find_file_recursively(root: &Path, file_name: &str) -> Option<PathBuf> {
  let entries = fs::read_dir(root).ok()?;
  for entry in entries.flatten() {
    let path = entry.path();
    if path.is_file() {
      if path
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.eq_ignore_ascii_case(file_name))
        .unwrap_or(false)
      {
        return Some(path);
      }
    } else if path.is_dir() {
      if let Some(found) = find_file_recursively(&path, file_name) {
        return Some(found);
      }
    }
  }
  None
}

fn summarize_success(stdout: &str) -> String {
  if stdout.contains("Not converting audio") {
    return "Succès: fichier déjà au format cible, conversion ignorée (le débit binaire peut rester celui de la source).".to_string();
  }

  "Succès: téléchargement terminé.".to_string()
}

fn compact_output(stderr: &str) -> String {
  let compact = stderr
    .lines()
    .rev()
    .find(|line| !line.trim().is_empty())
    .unwrap_or("Erreur inconnue.");

  with_access_hint(compact.chars().take(240).collect())
}

pub(crate) fn is_access_denied(message: &str) -> bool {
  let lower = message.to_lowercase();
  ["permission denied", "access is denied", "accès refusé", "errno 13", "os error 5"]
    .iter()
    .any(|needle| lower.contains(needle))
}

/// Dossier de repli non protégé par « Accès contrôlé aux dossiers »: Téléchargements\RapidTunes.
fn fallback_output_dir(current: Option<&str>) -> Option<PathBuf> {
  let fallback = dirs::download_dir()?.join("RapidTunes");
  let same = current
    .map(|dir| Path::new(dir.trim()) == fallback.as_path())
    .unwrap_or(false);
  (!same).then_some(fallback)
}

/// Ajoute une explication quand Windows refuse l'écriture (souvent la protection « Accès contrôlé aux dossiers »).
pub(crate) fn with_access_hint(message: String) -> String {
  let lower = message.to_lowercase();
  let denied = ["permission denied", "access is denied", "accès refusé", "errno 13", "os error 5"]
    .iter()
    .any(|needle| lower.contains(needle));
  if !denied {
    return message;
  }
  format!(
    "{message} Windows bloque peut-être l'écriture dans ce dossier (protection « Accès contrôlé aux dossiers »). \
Dans Sécurité Windows > Protection contre les virus et menaces > Protection contre les ransomwares, \
autorise RapidTunes (et yt-dlp / ffmpeg) ou choisis un autre dossier."
  )
}

fn validate_preview_url(url: &str) -> AppResult<()> {
  let url_regex = Regex::new(r"^https?://")
    .map_err(|err| AppError::Validation(format!("Regex URL invalide: {err}")))?;

  if !url_regex.is_match(url) {
    return Err(AppError::Validation(
      "URL invalide: une URL http/https est attendue.".to_string()
    ));
  }

  Ok(())
}

/// Recherche YouTube via yt-dlp (aucune clé d'API requise).
pub async fn search_media(raw_query: &str, limit: usize) -> AppResult<Vec<SearchResult>> {
  let query = raw_query.trim();
  if query.is_empty() {
    return Ok(Vec::new());
  }
  if query.starts_with('-') {
    return Err(AppError::CommandFailed("Requête de recherche invalide.".to_string()));
  }
  let limit = limit.clamp(1, 50);

  let yt_dlp = tools_service::require_binary("yt-dlp", "yt-dlp.exe").await?;

  let output = tokio::time::timeout(
    std::time::Duration::from_secs(45),
    no_window(Command::new(&yt_dlp))
      .args(tools_service::js_runtime_args(&yt_dlp))
      .args([
        "--flat-playlist",
        "--dump-json",
        "--no-warnings",
        "--no-call-home",
        "--ignore-errors",
        &format!("ytsearch{limit}:{query}")
      ])
      .output()
  )
  .await
  .map_err(|_| AppError::CommandFailed("La recherche a dépassé 45 secondes. Réessaie.".to_string()))??;

  let stdout = String::from_utf8_lossy(&output.stdout);
  let results: Vec<SearchResult> = stdout
    .lines()
    .filter_map(|line| serde_json::from_str::<Value>(line).ok())
    .filter_map(|json| build_search_result(&json))
    .collect();

  if results.is_empty() && !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    return Err(AppError::CommandFailed(format!(
      "Recherche impossible: {}",
      compact_output(&stderr)
    )));
  }

  Ok(results)
}

fn build_search_result(json: &Value) -> Option<SearchResult> {
  let video_id = json.get("id").and_then(Value::as_str)?.trim().to_string();
  if video_id.is_empty() {
    return None;
  }
  let title = pick_text_field(json, &["title"])?;
  let duration_seconds = json.get("duration").and_then(|value| {
    as_u64(value).or_else(|| value.as_f64().filter(|v| *v >= 0.0).map(|v| v as u64))
  });
  let url = pick_text_field(json, &["webpage_url", "url"])
    .filter(|value| value.starts_with("http"))
    .unwrap_or_else(|| format!("https://www.youtube.com/watch?v={video_id}"));
  let is_live = json
    .get("live_status")
    .and_then(Value::as_str)
    .map(|status| status == "is_live")
    .unwrap_or(false);

  Some(SearchResult {
    thumbnail_url: pick_thumbnail_url(json)
      .or_else(|| Some(format!("https://i.ytimg.com/vi/{video_id}/mqdefault.jpg"))),
    video_id,
    url,
    title,
    channel: pick_text_field(json, &["channel", "uploader"]),
    duration_seconds,
    duration_text: duration_seconds.filter(|value| *value > 0).map(format_duration),
    view_count: json.get("view_count").and_then(as_u64),
    is_live
  })
}

fn build_preview_from_json(url: &str, json: &Value) -> MediaPreview {
  let is_playlist = json
    .get("_type")
    .and_then(Value::as_str)
    .map(|value| value.eq_ignore_ascii_case("playlist"))
    .unwrap_or(false)
    || json.get("entries").is_some();

  let duration_seconds = json.get("duration").and_then(as_u64);
  let item_count = if is_playlist {
    json
      .get("playlist_count")
      .and_then(as_u64)
      .or_else(|| {
        json
          .get("entries")
          .and_then(Value::as_array)
          .map(|entries| entries.iter().filter(|entry| !entry.is_null()).count() as u64)
      })
  } else {
    None
  };

  let title = json
    .get("title")
    .and_then(Value::as_str)
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or("Média sans titre")
    .to_string();

  let upload_date = json
    .get("upload_date")
    .and_then(Value::as_str)
    .map(format_upload_date)
    .or_else(|| {
      json
        .get("modified_date")
        .and_then(Value::as_str)
        .map(format_upload_date)
    });

  MediaPreview {
    url: json
      .get("webpage_url")
      .and_then(Value::as_str)
      .filter(|value| !value.trim().is_empty())
      .unwrap_or(url)
      .to_string(),
    title,
    thumbnail_url: pick_thumbnail_url(json),
    duration_seconds,
    duration_text: duration_seconds.map(format_duration),
    uploader: pick_text_field(json, &["uploader", "uploader_id"]),
    channel: pick_text_field(json, &["channel", "channel_id"]),
    upload_date,
    view_count: json.get("view_count").and_then(as_u64),
    like_count: json.get("like_count").and_then(as_u64),
    is_playlist,
    item_count,
    description: json
      .get("description")
      .and_then(Value::as_str)
      .map(str::trim)
      .filter(|value| !value.is_empty())
      .map(|value| value.chars().take(280).collect())
  }
}

fn pick_text_field(json: &Value, keys: &[&str]) -> Option<String> {
  keys
    .iter()
    .find_map(|key| {
      json
        .get(*key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    })
    .map(ToString::to_string)
}

fn pick_thumbnail_url(json: &Value) -> Option<String> {
  if let Some(url) = json
    .get("thumbnail")
    .and_then(Value::as_str)
    .map(str::trim)
    .filter(|value| !value.is_empty())
  {
    return Some(url.to_string());
  }

  json
    .get("thumbnails")
    .and_then(Value::as_array)
    .and_then(|thumbs| {
      thumbs
        .iter()
        .rev()
        .find_map(|thumb| thumb.get("url").and_then(Value::as_str))
    })
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(ToString::to_string)
}

fn as_u64(value: &Value) -> Option<u64> {
  value
    .as_u64()
    .or_else(|| value.as_i64().and_then(|v| if v >= 0 { Some(v as u64) } else { None }))
}

fn format_duration(total_seconds: u64) -> String {
  let hours = total_seconds / 3600;
  let minutes = (total_seconds % 3600) / 60;
  let seconds = total_seconds % 60;

  if hours > 0 {
    format!("{hours:02}:{minutes:02}:{seconds:02}")
  } else {
    format!("{minutes:02}:{seconds:02}")
  }
}

fn format_upload_date(raw: &str) -> String {
  if raw.len() == 8 && raw.chars().all(|ch| ch.is_ascii_digit()) {
    format!("{}-{}-{}", &raw[0..4], &raw[4..6], &raw[6..8])
  } else {
    raw.to_string()
  }
}
