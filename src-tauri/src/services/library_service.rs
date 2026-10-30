use std::fs;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::UNIX_EPOCH;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use lofty::config::WriteOptions;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey, Tag};
use serde_json::Value;

use crate::models::{LibraryItem, MediaTagsUpdate};
use crate::services::media_service::resolve_binary_path;

pub const AUDIO_EXTENSIONS: &[&str] = &["mp3", "wav", "flac", "aac", "m4a", "ogg", "opus", "wma"];
pub const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mkv", "webm", "mov", "avi", "m4v"];
const MAX_SCAN_DEPTH: usize = 8;
const MAX_ITEMS: usize = 5000;

type ScanCache = HashMap<PathBuf, (u64, u64, LibraryItem)>;

/// Cache (chemin -> date, taille, entrée) pour que les analyses répétées
/// (actualisation automatique) ne relisent pas les tags des fichiers inchangés.
fn scan_cache() -> &'static Mutex<ScanCache> {
  static CACHE: OnceLock<Mutex<ScanCache>> = OnceLock::new();
  CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(windows)]
fn hide_console(command: &mut Command) {
  use std::os::windows::process::CommandExt;
  const CREATE_NO_WINDOW: u32 = 0x0800_0000;
  command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_console(_command: &mut Command) {}

pub fn scan_folders(folders: &[String], recursive: bool, kind: &str) -> Vec<LibraryItem> {
  let mut files: Vec<PathBuf> = Vec::new();
  for folder in folders {
    let max_depth = if recursive { MAX_SCAN_DEPTH } else { 0 };
    collect_media_files(Path::new(folder), 0, max_depth, kind, &mut files);
    if files.len() >= MAX_ITEMS {
      break;
    }
  }

  files.sort();
  files.dedup();
  files.truncate(MAX_ITEMS);

  files.iter().filter_map(|path| build_item_cached(path)).collect()
}

fn collect_media_files(dir: &Path, depth: usize, max_depth: usize, kind: &str, out: &mut Vec<PathBuf>) {
  if depth > max_depth || out.len() >= MAX_ITEMS {
    return;
  }

  let Ok(entries) = fs::read_dir(dir) else {
    return;
  };

  for entry in entries.flatten() {
    let path = entry.path();
    let name = entry.file_name();
    if name.to_string_lossy().starts_with('.') {
      continue;
    }

    if path.is_dir() {
      collect_media_files(&path, depth + 1, max_depth, kind, out);
    } else if media_kind(&path).is_some_and(|found| kind == "all" || found == kind) {
      out.push(path);
    }
  }
}

fn media_kind(path: &Path) -> Option<&'static str> {
  let extension = path.extension()?.to_str()?.to_lowercase();
  if AUDIO_EXTENSIONS.contains(&extension.as_str()) {
    Some("audio")
  } else if VIDEO_EXTENSIONS.contains(&extension.as_str()) {
    Some("video")
  } else {
    None
  }
}

fn build_item_cached(path: &Path) -> Option<LibraryItem> {
  let metadata = fs::metadata(path).ok()?;
  let modified = metadata
    .modified()
    .ok()
    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
    .map(|duration| duration.as_nanos() as u64)
    .unwrap_or(0);
  let size = metadata.len();

  if let Ok(cache) = scan_cache().lock() {
    if let Some((cached_modified, cached_size, item)) = cache.get(path) {
      if *cached_modified == modified && *cached_size == size {
        return Some(item.clone());
      }
    }
  }

  let item = build_item(path)?;
  if let Ok(mut cache) = scan_cache().lock() {
    cache.insert(path.to_path_buf(), (modified, size, item.clone()));
  }
  Some(item)
}

fn build_item(path: &Path) -> Option<LibraryItem> {
  let kind = media_kind(path)?;
  let metadata = fs::metadata(path).ok()?;
  let path_text = path.to_string_lossy().to_string();

  let file_stem = path
    .file_stem()
    .map(|stem| stem.to_string_lossy().to_string())
    .unwrap_or_else(|| path_text.clone());

  let mut title = None;
  let mut artist = None;
  let mut album = None;
  let mut duration_seconds = 0.0_f64;
  let mut bitrate_kbps = None;
  let mut genre = None;
  let mut year = None;
  let mut track = None;
  let mut album_artist = None;

  if let Ok(probe) = Probe::open(path) {
    if let Ok(tagged) = probe.read() {
      let properties = tagged.properties();
      duration_seconds = properties.duration().as_secs_f64();
      bitrate_kbps = properties.audio_bitrate();

      if let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
        title = tag.title().map(|value| value.to_string());
        artist = tag.artist().map(|value| value.to_string());
        album = tag.album().map(|value| value.to_string());
        genre = tag.genre().map(|value| value.to_string());
        year = tag.year();
        track = tag.track();
        album_artist = tag.get_string(&ItemKey::AlbumArtist).map(|value| value.to_string());
      }
    }
  }

  if duration_seconds <= 0.0 {
    duration_seconds = probe_duration_with_ffprobe(path).unwrap_or(0.0);
  }

  let extension = path
    .extension()
    .map(|ext| ext.to_string_lossy().to_lowercase())
    .unwrap_or_default();

  let modified_secs = metadata
    .modified()
    .ok()
    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
    .map(|duration| duration.as_secs())
    .unwrap_or(0);

  Some(LibraryItem {
    id: path_text.clone(),
    path: path_text,
    kind: kind.to_string(),
    title: title.filter(|value| !value.trim().is_empty()).unwrap_or(file_stem),
    artist: artist.filter(|value| !value.trim().is_empty()),
    album: album.filter(|value| !value.trim().is_empty()),
    duration_seconds,
    size_bytes: metadata.len(),
    extension,
    modified_secs,
    bitrate_kbps,
    genre: genre.filter(|value| !value.trim().is_empty()),
    year,
    track,
    album_artist: album_artist.filter(|value| !value.trim().is_empty())
  })
}

fn probe_duration_with_ffprobe(path: &Path) -> Option<f64> {
  let ffprobe = resolve_binary_path("ffprobe", "ffprobe.exe")?;
  let mut command = Command::new(ffprobe);
  command
    .args(["-v", "quiet", "-print_format", "json", "-show_format"])
    .arg(path)
    .stdout(Stdio::piped())
    .stderr(Stdio::null());
  hide_console(&mut command);

  let output = command.output().ok()?;
  if !output.status.success() {
    return None;
  }

  let json: Value = serde_json::from_slice(&output.stdout).ok()?;
  json
    .get("format")?
    .get("duration")?
    .as_str()?
    .parse::<f64>()
    .ok()
}

pub fn read_cover(path: &str) -> Option<String> {
  read_cover_with_ffmpeg(path).or_else(|| read_cover_with_lofty(path))
}

fn read_cover_with_ffmpeg(path: &str) -> Option<String> {
  let ffmpeg = resolve_binary_path("ffmpeg", "ffmpeg.exe")?;
  let mut command = Command::new(ffmpeg);
  command
    .args(["-v", "error", "-i"])
    .arg(path)
    .args([
      "-an",
      "-frames:v",
      "1",
      "-vf",
      "scale=300:-2",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "-"
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::null());
  hide_console(&mut command);

  let output = command.output().ok()?;
  if !output.status.success() || output.stdout.len() < 4 {
    return None;
  }

  Some(format!("data:image/jpeg;base64,{}", BASE64.encode(&output.stdout)))
}

fn read_cover_with_lofty(path: &str) -> Option<String> {
  let tagged = Probe::open(path).ok()?.read().ok()?;
  let tag = tagged.primary_tag().or_else(|| tagged.first_tag())?;
  let picture = tag.pictures().first()?;
  let mime = picture
    .mime_type()
    .map(|mime| mime.as_str().to_string())
    .unwrap_or_else(|| "image/jpeg".to_string());
  Some(format!("data:{};base64,{}", mime, BASE64.encode(picture.data())))
}

pub fn read_video_thumbnail(path: &str) -> Option<String> {
  let ffmpeg = resolve_binary_path("ffmpeg", "ffmpeg.exe")?;
  let mut command = Command::new(ffmpeg);
  command
    .args(["-v", "error", "-ss", "1", "-i"])
    .arg(path)
    .args([
      "-frames:v",
      "1",
      "-vf",
      "scale=480:-2",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "-"
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::null());
  hide_console(&mut command);

  let output = command.output().ok()?;
  if !output.status.success() || output.stdout.is_empty() {
    return None;
  }

  Some(format!("data:image/jpeg;base64,{}", BASE64.encode(&output.stdout)))
}

fn apply_text(tag: &mut Tag, key: ItemKey, value: &Option<String>) {
  if let Some(text) = value {
    let trimmed = text.trim();
    if trimmed.is_empty() {
      tag.remove_key(&key);
    } else {
      tag.insert_text(key, trimmed.to_string());
    }
  }
}

/// Écrit les tags dans le fichier. Un champ absent (None) reste inchangé, un champ vide l'efface.
pub fn write_tags(update: &MediaTagsUpdate) -> Result<(), String> {
  let path = Path::new(&update.path);
  let mut tagged = Probe::open(path)
    .map_err(|err| format!("Fichier illisible: {err}"))?
    .read()
    .map_err(|err| format!("Tags illisibles: {err}"))?;

  if tagged.primary_tag().is_none() {
    let tag_type = tagged.file_type().primary_tag_type();
    tagged.insert_tag(Tag::new(tag_type));
  }
  let tag = tagged
    .primary_tag_mut()
    .ok_or_else(|| "Ce format ne permet pas d'écrire des tags.".to_string())?;

  apply_text(tag, ItemKey::TrackTitle, &update.title);
  apply_text(tag, ItemKey::TrackArtist, &update.artist);
  apply_text(tag, ItemKey::AlbumTitle, &update.album);
  apply_text(tag, ItemKey::AlbumArtist, &update.album_artist);
  apply_text(tag, ItemKey::Genre, &update.genre);

  if let Some(raw) = &update.track {
    match raw.trim().parse::<u32>() {
      Ok(number) => tag.set_track(number),
      Err(_) if raw.trim().is_empty() => tag.remove_track(),
      Err(_) => return Err("Numéro de piste invalide.".to_string())
    }
  }

  if let Some(raw) = &update.year {
    match raw.trim().parse::<u32>() {
      Ok(number) => tag.set_year(number),
      Err(_) if raw.trim().is_empty() => tag.remove_year(),
      Err(_) => return Err("Année invalide.".to_string())
    }
  }

  tagged
    .save_to_path(path, WriteOptions::default())
    .map_err(|err| {
      crate::services::media_service::with_access_hint(format!("Impossible d'enregistrer (fichier utilisé ?): {err}"))
    })
}

/// Analyse une liste de fichiers précis (ouverture directe, hors bibliothèque).
pub fn scan_files(paths: &[String]) -> Vec<LibraryItem> {
  paths
    .iter()
    .filter_map(|path| build_item_cached(Path::new(path)))
    .collect()
}
