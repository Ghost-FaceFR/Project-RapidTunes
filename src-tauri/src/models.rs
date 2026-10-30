use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MediaMode {
  Audio,
  Video,
  ExtractAudio
}

impl MediaMode {
  pub fn from_input(value: &str) -> Option<Self> {
    match value.trim().to_lowercase().as_str() {
      "audio" => Some(Self::Audio),
      "video" => Some(Self::Video),
      "extract_audio" | "extract-audio" | "extractaudio" => Some(Self::ExtractAudio),
      _ => None
    }
  }

  pub fn as_str(&self) -> &'static str {
    match self {
      Self::Audio => "audio",
      Self::Video => "video",
      Self::ExtractAudio => "extract_audio"
    }
  }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DownloadRequest {
  pub url: String,
  pub format: String,
  pub quality: String,
  pub mode: MediaMode,
  #[serde(default)]
  pub output_dir: Option<String>,
  #[serde(default)]
  pub is_playlist: bool,
  #[serde(default)]
  pub speed_limit_kibps: Option<u64>
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BatchDownloadRequest {
  #[serde(default)]
  pub jobs: Vec<DownloadRequest>
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct JobResult {
  pub success: bool,
  pub message: String,
  pub output_path: Option<String>
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DownloadProgressEvent {
  pub phase: String,
  pub percent: Option<f64>,
  pub message: String,
  pub download_speed_kibps: Option<f64>,
  pub download_speed_text: Option<String>,
  pub rate_limit_kibps: Option<f64>
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
  pub video_id: String,
  pub url: String,
  pub title: String,
  pub channel: Option<String>,
  pub duration_seconds: Option<u64>,
  pub duration_text: Option<String>,
  pub view_count: Option<u64>,
  pub thumbnail_url: Option<String>,
  pub is_live: bool
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MediaPreview {
  pub url: String,
  pub title: String,
  pub thumbnail_url: Option<String>,
  pub duration_seconds: Option<u64>,
  pub duration_text: Option<String>,
  pub uploader: Option<String>,
  pub channel: Option<String>,
  pub upload_date: Option<String>,
  pub view_count: Option<u64>,
  pub like_count: Option<u64>,
  pub is_playlist: bool,
  pub item_count: Option<u64>,
  pub description: Option<String>
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
  pub id: String,
  pub path: String,
  pub kind: String,
  pub title: String,
  pub artist: Option<String>,
  pub album: Option<String>,
  pub duration_seconds: f64,
  pub size_bytes: u64,
  pub extension: String,
  pub modified_secs: u64,
  pub bitrate_kbps: Option<u32>,
  pub genre: Option<String>,
  pub year: Option<u32>,
  pub track: Option<u32>,
  pub album_artist: Option<String>
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaTagsUpdate {
  pub path: String,
  pub title: Option<String>,
  pub artist: Option<String>,
  pub album: Option<String>,
  pub album_artist: Option<String>,
  pub genre: Option<String>,
  pub track: Option<String>,
  pub year: Option<String>
}
