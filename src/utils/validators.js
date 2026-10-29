import { MEDIA_FORMATS, MODE_OPTIONS, QUALITY_OPTIONS } from "./mediaOptions";

const MP4_AUDIO_QUALITIES = ["96kbps", "128kbps", "192kbps", "256kbps", "320kbps"];
const MP4_VIDEO_QUALITIES = ["360p", "480p", "720p", "1080p", "1440p", "2160p"];

export function isValidUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidMp4CompositeQuality(rawQuality) {
  if (typeof rawQuality !== "string") return false;
  const [audio, video] = rawQuality.split("|");
  if (!audio || !video) return false;
  return MP4_AUDIO_QUALITIES.includes(audio) && MP4_VIDEO_QUALITIES.includes(video);
}

export function validateJob(job) {
  const errors = [];

  if (!isValidUrl(job.url)) {
    errors.push("URL invalide (http/https requis).");
  }

  if (!MEDIA_FORMATS.includes(job.format)) {
    errors.push(`Format non supporté: ${job.format}`);
  }

  const isQualityValid =
    QUALITY_OPTIONS.includes(job.quality) || (job.format === "mp4" && isValidMp4CompositeQuality(job.quality));
  if (!isQualityValid) {
    errors.push(`Qualité non supportée: ${job.quality}`);
  }

  if (!MODE_OPTIONS.includes(job.mode)) {
    errors.push(`Mode non supporté: ${job.mode}`);
  }

  if (job.mode === "video" && job.format !== "mp4") {
    errors.push("En mode vidéo, le format recommandé est mp4.");
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
