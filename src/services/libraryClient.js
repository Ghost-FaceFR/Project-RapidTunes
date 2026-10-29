import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export async function scanLibrary(folders, recursive = true, kind = "all") {
  return invoke("scan_library", { folders, recursive, kind });
}

export async function getMediaCover(path) {
  return invoke("get_media_cover", { path });
}

export async function getVideoThumbnail(path) {
  return invoke("get_video_thumbnail", { path });
}

export function toMediaUrl(path) {
  return convertFileSrc(path);
}

export async function updateMediaTags(updates) {
  return invoke("update_media_tags", { updates });
}

export async function pickMediaFiles() {
  return invoke("pick_media_files");
}
