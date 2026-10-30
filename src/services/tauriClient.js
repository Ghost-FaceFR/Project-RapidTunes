import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const DOWNLOAD_PROGRESS_EVENT = "download-progress";

export async function runSingleJob(request) {
  return invoke("download_and_convert", { request });
}

export async function cancelActiveDownload() {
  return invoke("cancel_download");
}

export async function pauseActiveDownload() {
  return invoke("pause_download");
}

export async function resumeActiveDownload() {
  return invoke("resume_download");
}

export async function subscribeToDownloadProgress(handler) {
  return listen(DOWNLOAD_PROGRESS_EVENT, (event) => {
    handler(event.payload);
  });
}

export async function fetchMediaPreview(url) {
  return invoke("preview_media", { url });
}

export async function searchMedia(query, limit = 12) {
  return invoke("search_media", { query, limit });
}

export async function getDefaultDownloadDir() {
  return invoke("get_default_download_dir");
}

export async function getDefaultVideoDir() {
  return invoke("get_default_video_dir");
}

export async function pickOutputDirectory() {
  return invoke("pick_output_directory");
}

export async function openFileLocation(path) {
  return invoke("open_file_location", { path });
}

export async function downloadUpdate(url, fileName) {
  return invoke("download_update", { url, fileName });
}

export async function launchUpdate(path) {
  return invoke("launch_update", { path });
}

export async function getMissingTools() {
  return invoke("missing_tools");
}

/** Installe yt-dlp, ffmpeg et deno s'ils manquent. Renvoie true si quelque chose a été installé. */
export async function prepareTools() {
  return invoke("prepare_tools");
}
