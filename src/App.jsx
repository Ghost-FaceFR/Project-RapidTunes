import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import packageInfo from "../package.json";
import { LogicalSize, getCurrentWindow } from "@tauri-apps/api/window";
import {
  cancelActiveDownload,
  fetchMediaPreview,
  getDefaultDownloadDir,
  getDefaultVideoDir,
  getMissingTools,
  prepareTools,
  pauseActiveDownload,
  pickOutputDirectory,
  openFileLocation,
  downloadUpdate,
  launchUpdate,
  resumeActiveDownload,
  runSingleJob,
  subscribeToDownloadProgress
} from "./services/tauriClient";
import MediaSearch from "./components/MediaSearch";
import { checkForUpdate, fetchChangelog } from "./services/updateService";
import { useMediaEngine } from "./services/mediaEngine";
import {
  getMediaCover,
  getVideoThumbnail,
  pickMediaFiles,
  scanLibrary,
  toMediaUrl,
  updateMediaTags
} from "./services/libraryClient";
import MediaLibraryView from "./components/MediaLibraryView";
import PlayerIcon from "./components/PlayerIcon";
import TooltipLayer from "./components/TooltipLayer";
import ToastLayer from "./components/ToastLayer";
import AudioVisualizer, { VISUALIZER_MODES, VISUALIZER_COLORS } from "./components/AudioVisualizer";
import { isValidUrl, validateJob } from "./utils/validators";
import windowReduceIcon from "./assets/images/components/window_reduce.png";
import windowMaximizeIcon from "./assets/images/components/window_maximize.png";
import windowCloseIcon from "./assets/images/components/window_close.png";
import settingsIcon from "./assets/images/components/setting.png";
import deleteIcon from "./assets/images/components/delete.png";
import folderIcon from "./assets/images/components/folder.png";
import downloadIcon from "./assets/images/components/download.png";
import questionIcon from "./assets/images/components/question.png";
import pauseIcon from "./assets/images/components/pause.png";
import playIcon from "./assets/images/components/play.png";
import stopIcon from "./assets/images/components/stop.png";
import timeIcon from "./assets/images/components/time.png";
import musicIcon from "./assets/images/components/music.png";
import musicAlbumIcon from "./assets/images/components/music_album.png";
import appLogo from "./assets/logo.png";

const FORMAT_OPTIONS = ["mp3", "mp4", "wav", "flac", "aac"];
const MP4_AUDIO_OPTIONS = ["96kbps", "128kbps", "192kbps", "256kbps", "320kbps"];
const MP4_VIDEO_OPTIONS = ["360p", "480p", "720p", "1080p", "1440p", "2160p"];
const MP4_COMBINED_QUALITY_OPTIONS = MP4_AUDIO_OPTIONS.flatMap((audio) =>
  MP4_VIDEO_OPTIONS.map((video) => `${audio}|${video}`)
);
const LANGUAGE_OPTIONS = [
  { value: "fr-FR", label: "Français (France)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-US", label: "English (United States)" }
];
const QUALITY_OPTIONS_BY_FORMAT = {
  mp3: ["96kbps", "128kbps", "160kbps", "192kbps", "256kbps", "320kbps"],
  wav: ["16-bit", "24-bit", "32-bit"],
  flac: ["16-bit", "24-bit"],
  aac: ["96kbps", "128kbps", "192kbps", "256kbps", "320kbps"],
  mp4: [...MP4_AUDIO_OPTIONS, ...MP4_VIDEO_OPTIONS]
};
const SETTINGS_MENU = [
  { id: "behaviors", label: "Comportements" },
  { id: "appearance", label: "Apparence" },
  { id: "language", label: "Langue & heure" },
  { id: "player", label: "Lecteur média" },
  { id: "download", label: "Media DL" },
  { id: "updates", label: "Mises à jour" }
];
const SETTINGS_TAB_DESCRIPTIONS = {
  behaviors: "Configure les actions Réduire/Fermer et la gestion de la taille de fenêtre.",
  appearance: "Paramètres d'apparence de l'interface.",
  player: "Bibliothèque, lecture et informations du Lecteur média.",
  language: "Règle la langue et le format d'affichage des dates.",
  download: "Dossiers de téléchargement, format et qualité par défaut.",
  updates: "Gère les vérifications et le comportement des mises à jour."
};

function buildTheme(id, name, hue, saturation, options = {}) {
  const {
    secondHue = hue,
    radial = false,
    accentSaturation = Math.max(12, Math.round(saturation * 0.7))
  } = options;
  const hsl = (h, sat, light) => `hsl(${h} ${sat}% ${light}%)`;
  const top = hsl(hue, saturation, 17);
  const bottom = hsl(secondHue, Math.max(saturation - 8, 0), 4);

  return {
    id,
    name,
    gradient: radial
      ? `radial-gradient(circle at 20% 10%, ${top} 0%, ${bottom} 68%)`
      : `linear-gradient(135deg, ${top} 0%, ${bottom} 100%)`,
    colors: [top, bottom],
    vars: {
      "--theme-bg-0": hsl(hue, saturation, 4),
      "--theme-bg-1": hsl(hue, saturation, 7),
      "--theme-bg-2": hsl(hue, saturation, 10),
      "--theme-bg-3": hsl(hue, saturation, 13),
      "--theme-bg-4": hsl(hue, saturation, 17),
      "--theme-line-1": hsl(hue, Math.round(saturation * 0.8), 20),
      "--theme-line-2": hsl(hue, Math.round(saturation * 0.7), 26),
      "--theme-line-3": hsl(hue, Math.round(saturation * 0.6), 34),
      "--theme-text-1": hsl(hue, Math.min(saturation, 30), 95),
      "--theme-text-2": hsl(hue, Math.min(saturation, 22), 82),
      "--theme-text-3": hsl(hue, Math.min(saturation, 16), 63),
      "--theme-accent": hsl(hue, accentSaturation, 50),
      "--theme-accent-2": hsl(hue, accentSaturation, 62)
    }
  };
}

const THEME_OPTIONS = [
  buildTheme("noir-radial", "Noir radial", 0, 0, { radial: true, accentSaturation: 0 }),
  buildTheme("graphite-acier", "Graphite acier", 210, 14),
  buildTheme("bleu-nuit", "Bleu nuit", 215, 42),
  buildTheme("indigo-minuit", "Indigo minuit", 242, 40),
  buildTheme("violet-nebuleuse", "Violet nébuleuse", 270, 38, { secondHue: 250, radial: true }),
  buildTheme("rose-crepuscule", "Rose crépuscule", 330, 38),
  buildTheme("rouge-braise", "Rouge braise", 2, 46),
  buildTheme("bordeaux", "Bordeaux", 345, 42, { secondHue: 330 }),
  buildTheme("soleil-couchant", "Soleil couchant", 20, 46, { secondHue: 300 }),
  buildTheme("ambre", "Ambre", 36, 44),
  buildTheme("sable-dore", "Sable doré", 46, 24),
  buildTheme("vert-foret", "Vert forêt", 140, 32),
  buildTheme("emeraude", "Émeraude", 163, 40, { radial: true }),
  buildTheme("ocean", "Océan", 190, 44),
  buildTheme("aurore", "Aurore", 172, 36, { secondHue: 215 })
];

const LEGACY_THEME_IDS = {
  "g-noir-gris": "noir-radial",
  "g-bleu-nuit": "bleu-nuit",
  "g-rouge-braise": "rouge-braise",
  "noir-gris": "noir-radial",
  "charbon-acier": "graphite-acier",
  "ambre-cendre": "ambre"
};

const DEFAULT_SETTINGS = {
  autoPreview: true,
  customMinimizeActionEnabled: true,
  minimizeActionTarget: "taskbar",
  customCloseActionEnabled: true,
  closeActionTarget: "tray",
  saveWindowSize: true,
  defaultOutputDir: "",
  defaultVideoOutputDir: "",
  defaultFormat: "mp3",
  defaultQuality: "128kbps",
  defaultIsPlaylist: false,
  checkUpdatesOnStartup: true,
  autoUpdate: false,
  appearanceTheme: "noir-radial",
  limitDownloadSpeedEnabled: false,
  downloadSpeedKbps: "0",
  compactQueue: false,
  showQueueThumbnails: true,
  showQueueMeta: true,
  languageLocale: "fr-FR",
  use24HourClock: true,
  libraryIncludeSubfolders: true,
  playerAutoplayNext: true,
  playerMiniAlwaysOnTop: true,
  playerShowCovers: true,
  playerVisualizer: "bars",
  playerVisualizerColor: "theme",
  playerVisualizerCustomColor: "#8b5cf6",
  playerRememberRecent: true
};

const QUEUE_STORAGE_KEY = "rapidtunes.queue";
const HISTORY_QUEUE_STATUSES = ["success"];
const ALLOWED_QUEUE_STATUSES = ["queued", "running", "success", "cancelled"];

const INITIAL_FORM = {
  url: "",
  format: "mp3",
  quality: QUALITY_OPTIONS_BY_FORMAT.mp3[1],
  mode: "audio",
  is_playlist: false
};

const APP_VERSION = packageInfo.version;

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const DEFAULT_VIDEO_SETTINGS = { brightness: 100, contrast: 100, saturation: 100, fit: "contain" };
const VIDEO_FIT_MODES = [
  { id: "contain", label: "Ajuster" },
  { id: "cover", label: "Remplir" },
  { id: "fill", label: "Étirer" }
];
const VIDEO_ADJUSTMENTS = [
  { id: "brightness", label: "Luminosité" },
  { id: "contrast", label: "Contraste" },
  { id: "saturation", label: "Saturation" }
];

const EQ_BANDS = ["62 Hz", "125 Hz", "250 Hz", "500 Hz", "1 kHz", "2 kHz", "4 kHz", "8 kHz", "16 kHz"];
const EQ_RANGE_DB = 12;
const EQ_PRESETS = [
  { id: "flat", label: "Plat", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: "bass", label: "Basses renforcées", gains: [6, 5, 4, 2, 0, 0, 0, 0, 0] },
  { id: "treble", label: "Aigus renforcés", gains: [0, 0, 0, 0, 0, 2, 4, 5, 6] },
  { id: "vocal", label: "Voix", gains: [-2, -1, 0, 2, 4, 4, 2, 0, -1] },
  { id: "rock", label: "Rock", gains: [5, 4, 2, -1, -2, 1, 3, 4, 5] }
];

function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  const units = ["o", "Ko", "Mo", "Go"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

const LIBRARY_FOLDERS_KEY = "rapidtunes.library.folders.v2";
const PLAYLISTS_KEY = "rapidtunes.playlists";
const RECENTS_KEY = "rapidtunes.recents";
const MAX_RECENTS = 12;

function readRecents() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENTS_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (entry) =>
              entry &&
              ["track", "video", "album", "artist"].includes(entry.kind) &&
              typeof entry.key === "string"
          )
          .slice(0, MAX_RECENTS)
      : [];
  } catch {
    return [];
  }
}

function mapLibraryItem(item, art, session) {
  return {
    id: item.id,
    path: item.path,
    type: item.kind,
    session,
    title: item.title,
    artist: item.artist ?? "Artiste inconnu",
    album: item.album ?? "Album inconnu",
    albumArtist: item.albumArtist ?? "",
    genre: item.genre ?? "",
    year: item.year ?? null,
    track: item.track ?? null,
    durationSeconds: item.durationSeconds,
    duration: item.durationSeconds > 0 ? formatClock(item.durationSeconds) : "--:--",
    sizeBytes: item.sizeBytes,
    extension: item.extension,
    modifiedSecs: item.modifiedSecs,
    bitrateKbps: item.bitrateKbps,
    thumbnailUrl: art || null
  };
}

function readLibraryFolders() {
  const onlyStrings = (value) =>
    Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LIBRARY_FOLDERS_KEY) ?? "null");
    if (parsed && Array.isArray(parsed.music) && Array.isArray(parsed.video)) {
      return { music: onlyStrings(parsed.music), video: onlyStrings(parsed.video) };
    }
    const legacy = JSON.parse(window.localStorage.getItem("rapidtunes.library.folders") ?? "null");
    if (Array.isArray(legacy)) {
      return { music: onlyStrings(legacy), video: [], needsVideoDefault: true };
    }
  } catch {
    // stockage indisponible ou corrompu: valeurs par défaut
  }
  return null;
}

function readPlaylists() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PLAYLISTS_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed
          .filter((entry) => entry && typeof entry.id === "string" && typeof entry.name === "string")
          .map((entry) => ({
            id: entry.id,
            name: entry.name,
            itemIds: Array.isArray(entry.itemIds) ? entry.itemIds.filter((id) => typeof id === "string") : []
          }))
      : [];
  } catch {
    return [];
  }
}
const PLAYER_PREFS_KEY = "rapidtunes.player";
const WINDOW_SIZE_KEY = "rapidtunes.windowSize";
// Doit rester identique à width/height/minWidth/minHeight de tauri.conf.json.
const MIN_WINDOW_SIZE = { width: 980, height: 600 };

function readSavedWindowSize() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WINDOW_SIZE_KEY) ?? "null");
    if (parsed && Number.isFinite(parsed.width) && Number.isFinite(parsed.height)) {
      const maxWidth = Math.max(MIN_WINDOW_SIZE.width, window.screen?.availWidth || Infinity);
      const maxHeight = Math.max(MIN_WINDOW_SIZE.height, window.screen?.availHeight || Infinity);
      return {
        width: Math.min(maxWidth, Math.max(MIN_WINDOW_SIZE.width, Math.round(parsed.width))),
        height: Math.min(maxHeight, Math.max(MIN_WINDOW_SIZE.height, Math.round(parsed.height)))
      };
    }
  } catch {
    // taille non sauvegardée
  }
  return null;
}

function readPlayerPrefs() {
  try {
    return JSON.parse(window.localStorage.getItem(PLAYER_PREFS_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function savePlayerPrefs(patch) {
  try {
    window.localStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify({ ...readPlayerPrefs(), ...patch }));
  } catch {
    // préférences non persistées
  }
}

function formatDisplayValue(raw) {
  if (typeof raw !== "string") return raw;

  if (/^[a-z]+$/i.test(raw)) {
    return raw.toUpperCase();
  }

  const compactUnitMatch = raw.match(/^(\d+)(kbps|p)$/i);
  if (compactUnitMatch) {
    return `${compactUnitMatch[1]} ${compactUnitMatch[2].toLowerCase()}`;
  }

  const bitDepthMatch = raw.match(/^(\d+)-bit$/i);
  if (bitDepthMatch) {
    return `${bitDepthMatch[1]} bit`;
  }

  return raw;
}

function isLikelyPlaylistUrl(rawUrl) {
  if (typeof rawUrl !== "string") return false;

  try {
    const parsed = new URL(rawUrl.trim());
    const pathname = parsed.pathname.toLowerCase();

    if (pathname.includes("/playlist")) {
      return true;
    }

    const hasList = parsed.searchParams.has("list");
    const hasVideo = parsed.searchParams.has("v");
    return hasList && !hasVideo;
  } catch {
    return false;
  }
}

function resolvePlaylistFlag(form, preview) {
  return Boolean(preview?.is_playlist || isLikelyPlaylistUrl(form.url));
}

function resolveSpeedLimitKibps(settings) {
  if (!settings?.limitDownloadSpeedEnabled) {
    return null;
  }

  const raw =
    typeof settings.downloadSpeedKbps === "string"
      ? settings.downloadSpeedKbps.trim()
      : String(settings.downloadSpeedKbps ?? "").trim();

  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function normalizePayload(form, outputDir, preview, settings) {
  const mode = form.format === "mp4" ? "video" : "extract_audio";
  const inferredPlaylist = resolvePlaylistFlag(form, preview);

  return {
    ...form,
    mode,
    is_playlist: inferredPlaylist,
    output_dir: outputDir || null,
    speed_limit_kibps: resolveSpeedLimitKibps(settings)
  };
}

function createQueueItem(form, preview) {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    status: "queued",
    form: { ...form },
    preview: preview ? { ...preview } : null,
    progress: null,
    phase: "queued",
    message: "En attente de traitement...",
    resultMessage: "",
    downloadSpeedKibps: null,
    downloadSpeedText: null,
    rateLimitKibps: null,
    completedAt: null,
    outputPath: null
  };
}

function normalizeMp4QualityValue(rawQuality) {
  const [audio = MP4_AUDIO_OPTIONS[1], video = MP4_VIDEO_OPTIONS[3]] =
    typeof rawQuality === "string" ? rawQuality.split("|") : [];
  const normalizedAudio = MP4_AUDIO_OPTIONS.includes(audio) ? audio : MP4_AUDIO_OPTIONS[1];
  const normalizedVideo = MP4_VIDEO_OPTIONS.includes(video) ? video : MP4_VIDEO_OPTIONS[3];
  return `${normalizedAudio}|${normalizedVideo}`;
}

function normalizeQualityForFormat(format, rawQuality) {
  if (format === "mp4") {
    return normalizeMp4QualityValue(rawQuality);
  }

  const options = QUALITY_OPTIONS_BY_FORMAT[format] ?? QUALITY_OPTIONS_BY_FORMAT.mp3;
  return options.includes(rawQuality) ? rawQuality : options[0];
}

function formatQualityDisplayValue(format, rawQuality) {
  if (format === "mp4") {
    const [audio, video] = normalizeMp4QualityValue(rawQuality).split("|");
    return `${formatDisplayValue(audio)} + ${formatDisplayValue(video)}`;
  }

  return formatDisplayValue(rawQuality);
}

function formatMediaTitleLine(preview, fallbackTitle = "") {
  const authorRaw = preview?.channel ?? preview?.uploader ?? "";
  const titleRaw = preview?.title ?? fallbackTitle ?? "";

  const author = typeof authorRaw === "string" ? authorRaw.trim() : "";
  const title = typeof titleRaw === "string" ? titleRaw.trim() : String(titleRaw ?? "").trim();

  if (author && title) {
    return `${author} - ${title}`;
  }

  if (title) {
    return title;
  }

  if (author) {
    return author;
  }

  return "Média inconnu";
}

function resolveThemeStyles(settings) {
  const legacyId =
    settings.appearanceThemeMode === "gradient"
      ? settings.appearanceGradientTheme
      : settings.appearanceNormalTheme;
  const requestedId = settings.appearanceTheme ?? LEGACY_THEME_IDS[legacyId] ?? THEME_OPTIONS[0].id;
  const theme = THEME_OPTIONS.find((entry) => entry.id === requestedId) ?? THEME_OPTIONS[0];

  return {
    theme,
    style: {
      ...theme.vars,
      "--app-main-bg": theme.gradient
    }
  };
}

function sanitizeRestoredQueueItems(rawValue) {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  return rawValue
    .map((rawItem) => {
      if (!rawItem || typeof rawItem !== "object") return null;

      const rawForm = rawItem.form;
      if (!rawForm || typeof rawForm !== "object") return null;

      const rawUrl = typeof rawForm.url === "string" ? rawForm.url.trim() : "";
      if (!rawUrl) return null;

      const format = FORMAT_OPTIONS.includes(rawForm.format) ? rawForm.format : INITIAL_FORM.format;
      const qualityOptions = QUALITY_OPTIONS_BY_FORMAT[format] ?? QUALITY_OPTIONS_BY_FORMAT.mp3;
      const quality =
        format === "mp4"
          ? normalizeMp4QualityValue(rawForm.quality)
          : qualityOptions.includes(rawForm.quality)
            ? rawForm.quality
            : qualityOptions[0];

      const rawStatus = typeof rawItem.status === "string" ? rawItem.status : "queued";
      const statusWithRecovery = rawStatus === "running" ? "queued" : rawStatus;
      const normalizedStatus = ALLOWED_QUEUE_STATUSES.includes(statusWithRecovery)
        ? statusWithRecovery
        : "queued";

      if (normalizedStatus === "cancelled") {
        return null;
      }

      const normalizedProgress =
        typeof rawItem.progress === "number" ? Math.max(0, Math.min(100, rawItem.progress)) : null;
      const normalizedDownloadSpeedKibps =
        typeof rawItem.downloadSpeedKibps === "number" && rawItem.downloadSpeedKibps >= 0
          ? rawItem.downloadSpeedKibps
          : null;
      const normalizedRateLimitKibps =
        typeof rawItem.rateLimitKibps === "number" && rawItem.rateLimitKibps > 0
          ? rawItem.rateLimitKibps
          : null;
      const normalizedCompletedAt =
        typeof rawItem.completedAt === "string" && rawItem.completedAt.trim()
          ? rawItem.completedAt
          : null;
      const baseMessage =
        typeof rawItem.message === "string" && rawItem.message.trim()
          ? rawItem.message
          : "En attente de traitement...";

      const recoveredMessage =
        rawStatus === "running" ? "Téléchargement interrompu. Relance manuelle requise." : baseMessage;

      return {
        id:
          typeof rawItem.id === "string" && rawItem.id.trim()
            ? rawItem.id
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        status: normalizedStatus,
        form: {
          ...INITIAL_FORM,
          url: rawUrl,
          format,
          quality,
          mode: format === "mp4" ? "video" : "extract_audio",
          is_playlist: Boolean(rawForm.is_playlist)
        },
        preview: rawItem.preview && typeof rawItem.preview === "object" ? { ...rawItem.preview } : null,
        progress: normalizedStatus === "queued" ? null : normalizedProgress,
        phase:
          normalizedStatus === "queued"
            ? "queued"
            : typeof rawItem.phase === "string"
              ? rawItem.phase
              : normalizedStatus,
        message: recoveredMessage,
        resultMessage: typeof rawItem.resultMessage === "string" ? rawItem.resultMessage : "",
        downloadSpeedKibps: normalizedStatus === "running" ? normalizedDownloadSpeedKibps : null,
        downloadSpeedText:
          normalizedStatus === "running" && typeof rawItem.downloadSpeedText === "string"
            ? rawItem.downloadSpeedText
            : null,
        rateLimitKibps: normalizedRateLimitKibps,
        completedAt: normalizedCompletedAt,
        outputPath:
          typeof rawItem.outputPath === "string" && rawItem.outputPath.trim()
            ? rawItem.outputPath
            : null
      };
    })
    .filter(Boolean);
}

function queueStatusLabel(status) {
  switch (status) {
    case "queued":
      return "À venir";
    case "running":
      return "Actif";
    case "success":
      return "Réussi";
    case "error":
      return "Échec";
    case "cancelled":
      return "Annulé";
    default:
      return "Inconnu";
  }
}

function queueStatusClass(status) {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "success":
      return "success";
    case "error":
      return "error";
    case "cancelled":
      return "cancelled";
    default:
      return "neutral";
  }
}

function formatProgressPhase(phase) {
  switch (phase) {
    case "preparing":
      return "Préparation";
    case "downloading":
      return "Téléchargement";
    case "converting":
      return "Conversion";
    case "completed":
      return "Terminé";
    case "error":
      return "Erreur";
    case "cancelled":
      return "Annulé";
    default:
      return "Traitement";
  }
}

function formatSpeedKibps(value) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    return null;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(2)} MiB/s`;
  }

  return `${Math.round(value)} ko/s`;
}

function formatHistoryDate(value, _locale = "fr-FR", use24HourClock = true) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = String(parsed.getFullYear());

  let hours = parsed.getHours();
  let suffix = "";

  if (!use24HourClock) {
    suffix = hours >= 12 ? " PM" : " AM";
    hours = hours % 12 || 12;
  }

  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  const displayHours = String(hours).padStart(2, "0");

  return `Le ${day}/${month}/${year} à ${displayHours}:${minutes}${suffix}`;
}

function LabelWithTooltip({ label, tooltip }) {
  return (
    <span className="field-label">
      <span>{label}</span>
      {tooltip ? (
        <span className="tooltip-chip" data-tip={tooltip} aria-label={`Info: ${label}`} tabIndex={0}>
          <img src={questionIcon} alt="" className="tooltip-chip__icon" />
        </span>
      ) : null}
    </span>
  );
}

function DurationInline({ durationText, className = "" }) {
  const normalizedDuration =
    typeof durationText === "string" && durationText.trim() ? durationText.trim() : "--:--";

  return (
    <span className={`duration-inline ${className}`.trim()} aria-label={`Durée ${normalizedDuration}`}>
      <img src={timeIcon} alt="" className="duration-inline__icon" />
      <span className="duration-inline__value">{normalizedDuration}</span>
    </span>
  );
}

function QueuePlaceholderThumb({ isPlaylist = false, className = "queue-media-thumb queue-media-thumb--placeholder" }) {
  const icon = isPlaylist ? musicAlbumIcon : musicIcon;

  return (
    <div className={className} aria-hidden="true">
      <img src={icon} alt="" className="queue-placeholder-icon" />
    </div>
  );
}

/** Carte de paramètres repliable (repliée par défaut). */
function CollapsibleBlock({ head, defaultOpen = false, collapsible = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!collapsible) {
    return (
      <section className="settings-block">
        <div className="settings-card-head settings-static__head">{head}</div>
        {children}
      </section>
    );
  }
  return (
    <section className={`settings-block settings-collapsible ${open ? "" : "settings-collapsible--closed"}`}>
      <button
        type="button"
        className="settings-collapsible__head settings-card-head"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{head}</span>
        <span className="settings-collapsible__chevron">
          <PlayerIcon name="chevron" />
        </span>
      </button>
      {open ? children : null}
    </section>
  );
}

function CustomSelect({ value, options, onChange, ariaLabel, disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  // Une option est soit une chaîne (affichée via formatDisplayValue), soit { value, label }.
  const entries = options.map((option) =>
    typeof option === "object" ? option : { value: option, label: formatDisplayValue(option) }
  );
  const current = entries.find((entry) => entry.value === value);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div className={`custom-select-box ${open ? "open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="custom-select-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{current ? current.label : formatDisplayValue(value)}</span>
      </button>

      {open && (
        <ul className="custom-select-menu" role="listbox">
          {entries.map((entry) => (
            <li key={entry.value}>
              <button
                type="button"
                className={`custom-select-option ${entry.value === value ? "active" : ""}`}
                onClick={() => {
                  onChange(entry.value);
                  setOpen(false);
                }}
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Mp4QualitySelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const [audioValue, videoValue] = value.split("|");

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const updatePart = (kind, next) => {
    const nextAudio = kind === "audio" ? next : audioValue;
    const nextVideo = kind === "video" ? next : videoValue;
    onChange(`${nextAudio}|${nextVideo}`);
  };

  return (
    <div className={`custom-select-box ${open ? "open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="custom-select-trigger"
        aria-label="Qualité MP4"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{`${formatDisplayValue(audioValue)} + ${formatDisplayValue(videoValue)}`}</span>
      </button>

      {open && (
        <div className="custom-select-menu grouped" role="listbox">
          <p className="custom-select-group-label">Qualité audio</p>
          {MP4_AUDIO_OPTIONS.map((option) => (
            <button
              key={`a-${option}`}
              type="button"
              className={`custom-select-option ${audioValue === option ? "active" : ""}`}
              onClick={() => updatePart("audio", option)}
            >
              {formatDisplayValue(option)}
            </button>
          ))}

          <div className="custom-select-separator" />
          <p className="custom-select-group-label">Qualité vidéo</p>
          {MP4_VIDEO_OPTIONS.map((option) => (
            <button
              key={`v-${option}`}
              type="button"
              className={`custom-select-option ${videoValue === option ? "active" : ""}`}
              onClick={() => updatePart("video", option)}
            >
              {formatDisplayValue(option)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


export default function App() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [queueItems, setQueueItems] = useState(() => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
      if (!raw) return [];
      return sanitizeRestoredQueueItems(JSON.parse(raw));
    } catch {
      return [];
    }
  });
  const queueItemsRef = useRef([]);
  const cancelRequestedRef = useRef(false);
  const errorRetryResolverRef = useRef(null);
  const [resultMessage, setResultMessage] = useState("");
  const [resultSuccess, setResultSuccess] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isCurrentPaused, setIsCurrentPaused] = useState(false);
  const [isPauseActionPending, setIsPauseActionPending] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [analyzedUrl, setAnalyzedUrl] = useState("");
  const [errorRetryModal, setErrorRetryModal] = useState(null);
  const [globalErrorModal, setGlobalErrorModal] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const toastCounterRef = useRef(0);
  const [updateState, setUpdateState] = useState({ status: "idle", info: null, message: "" });
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [changelog, setChangelog] = useState({ status: "idle", releases: [], message: "" });
  const [activeTopTab, setActiveTopTab] = useState("media-player");
  const [activeMainView, setActiveMainView] = useState("home");
  const [mediaDlMenuOpen, setMediaDlMenuOpen] = useState(false);
  const [selectedLibraryMediaId, setSelectedLibraryMediaId] = useState(null);
  const [libraryFolders, setLibraryFolders] = useState(readLibraryFolders);
  const [playlists, setPlaylists] = useState(readPlaylists);
  const [playQueueIds, setPlayQueueIds] = useState([]);
  const [recentEntries, setRecentEntries] = useState(readRecents);
  const [openedRawItems, setOpenedRawItems] = useState([]);
  const skipRecentRef = useRef(null);
  const [openReleases, setOpenReleases] = useState({});
  const [collapsedLibraryCards, setCollapsedLibraryCards] = useState({ music: true, video: true });
  const [panelHostNode, setPanelHostNode] = useState(null);
  const [libraryRawItems, setLibraryRawItems] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [mediaArtById, setMediaArtById] = useState({});
  const [playerPrefs] = useState(readPlayerPrefs);
  const [volume, setVolume] = useState(typeof playerPrefs.volume === "number" ? playerPrefs.volume : 0.8);
  const [isMuted, setIsMuted] = useState(Boolean(playerPrefs.muted));
  const librarySignatureRef = useRef("");
  const libraryScanBusyRef = useRef(false);
  const isMiniPlayerRef = useRef(false);
  const windowSizeReadyRef = useRef(false);
  const saveWindowSizeRef = useRef(null);
  const initialWindowSizeRef = useRef(readSavedWindowSize());
  const fullscreenActiveRef = useRef(false);
  const refreshLibraryRef = useRef(null);
  const artQueueRef = useRef(Promise.resolve());
  const libraryFoldersRef = useRef(null);
  const libraryRecursiveRef = useRef(true);
  const [speedSamples, setSpeedSamples] = useState([]);
  const [peakSpeedKibps, setPeakSpeedKibps] = useState(0);
  const dragQueueIdRef = useRef(null);
  const requestedArtRef = useRef(new Set());
  const fullscreenHostRef = useRef(null);
  const hiddenHostRef = useRef(null);
  const [videoDisplayMode, setVideoDisplayMode] = useState("windowed");
  const [isShuffleOn, setIsShuffleOn] = useState(false);
  const [repeatMode, setRepeatMode] = useState("off");
  const [isMiniPlayer, setIsMiniPlayer] = useState(false);
  const [playingLibraryMediaId, setPlayingLibraryMediaId] = useState(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  const [isVisualizerMenuOpen, setIsVisualizerMenuOpen] = useState(false);
  const wasMaximizedBeforeFullscreenRef = useRef(false);
  const [isVideoSettingsOpen, setIsVideoSettingsOpen] = useState(false);
  const [isVizColorOpen, setIsVizColorOpen] = useState(false);
  const [videoSettings, setVideoSettings] = useState(DEFAULT_VIDEO_SETTINGS);
  const [isEqOpen, setIsEqOpen] = useState(false);
  const [isEqEnabled, setIsEqEnabled] = useState(false);
  const [eqPresetId, setEqPresetId] = useState("flat");
  const [eqGains, setEqGains] = useState(EQ_PRESETS[0].gains);
  const [isEqLinked, setIsEqLinked] = useState(true);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
  const savedWindowSizeRef = useRef(null);
  const [activeSettingsTab, setActiveSettingsTab] = useState("behaviors");
  const [settings, setSettings] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_SETTINGS;
    }

    try {
      const raw = window.localStorage.getItem("rapidtunes.settings");
      if (!raw) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const qualityOptionsForFormat = useMemo(
    () => QUALITY_OPTIONS_BY_FORMAT[form.format] ?? QUALITY_OPTIONS_BY_FORMAT.mp3,
    [form.format]
  );
  const trimmedUrl = form.url.trim();
  const settingsQualityOptions = useMemo(
    () =>
      settings.defaultFormat === "mp4"
        ? MP4_COMBINED_QUALITY_OPTIONS
        : (QUALITY_OPTIONS_BY_FORMAT[settings.defaultFormat] ?? QUALITY_OPTIONS_BY_FORMAT.mp3),
    [settings.defaultFormat]
  );

  const canRun = useMemo(() => validateJob(form).isValid, [form]);
  const canSubmitDownload =
    canRun && Boolean(preview) && !previewLoading && analyzedUrl === trimmedUrl;
  const currentQueueItem = useMemo(
    () => queueItems.find((item) => item.status === "running") ?? null,
    [queueItems]
  );
  const waitingQueueItems = useMemo(
    () => queueItems.filter((item) => item.status === "queued"),
    [queueItems]
  );
  const finishedQueueItems = useMemo(
    () => queueItems.filter((item) => HISTORY_QUEUE_STATUSES.includes(item.status)).reverse(),
    [queueItems]
  );
  const hasCurrentQueueContent = Boolean(currentQueueItem);
  const hasWaitingQueueContent = waitingQueueItems.length > 0;
  const hasHistoryQueueContent = finishedQueueItems.length > 0;
  const topHeaderMediaItem = currentQueueItem ?? waitingQueueItems[0] ?? null;
  const hasAnyEmptyQueueSection =
    !hasCurrentQueueContent || !hasWaitingQueueContent || !hasHistoryQueueContent;
  const showQueueThumbnails = settings.showQueueThumbnails !== false;
  const showQueueMeta = settings.showQueueMeta !== false;
  const queueCardClassName = `queue-overview-card${settings.compactQueue ? " queue-overview-card--compact" : ""}${hasAnyEmptyQueueSection ? " queue-overview-card--with-empty" : ""}`;
  const libraryItems = useMemo(() => {
    const known = new Set(libraryRawItems.map((item) => item.id));
    // Pochette d'album: la première image trouvée parmi les morceaux d'un même album sert à tout l'album.
    const albumArt = new Map();
    libraryRawItems.forEach((item) => {
      if (item.kind === "audio" && item.album && mediaArtById[item.id] && !albumArt.has(item.album)) {
        albumArt.set(item.album, mediaArtById[item.id]);
      }
    });
    const artOf = (item) =>
      item.kind === "audio" && item.album ? albumArt.get(item.album) ?? mediaArtById[item.id] : mediaArtById[item.id];
    return [
      ...libraryRawItems.map((item) => mapLibraryItem(item, artOf(item), false)),
      ...openedRawItems
        .filter((item) => !known.has(item.id))
        .map((item) => mapLibraryItem(item, artOf(item), true))
    ];
  }, [libraryRawItems, openedRawItems, mediaArtById]);

  const selectedLibraryMedia = useMemo(
    () => libraryItems.find((item) => item.id === selectedLibraryMediaId) ?? null,
    [libraryItems, selectedLibraryMediaId]
  );

  const queueList = useMemo(() => {
    const byId = new Map(libraryItems.map((item) => [item.id, item]));
    return playQueueIds.map((id) => byId.get(id)).filter(Boolean);
  }, [libraryItems, playQueueIds]);

  const playingLibraryMedia = useMemo(
    () => libraryItems.find((item) => item.id === playingLibraryMediaId) ?? null,
    [libraryItems, playingLibraryMediaId]
  );

  const engine = useMediaEngine({
    source: playingLibraryMedia ? toMediaUrl(playingLibraryMedia.path) : null,
    speed: playbackSpeed,
    volume,
    muted: isMuted,
    eqEnabled: isEqEnabled,
    eqGains,
    onEnded: handleTrackEnded
  });

  useEffect(() => {
    const element = engine.element;
    if (!element) return;
    // Un filtre CSS même neutre force un rendu GPU supplémentaire: on ne l'applique que si un réglage a changé.
    const isNeutral =
      videoSettings.brightness === 100 && videoSettings.contrast === 100 && videoSettings.saturation === 100;
    element.style.filter = isNeutral
      ? ""
      : `brightness(${videoSettings.brightness}%) contrast(${videoSettings.contrast}%) saturate(${videoSettings.saturation}%)`;
    element.style.objectFit = videoSettings.fit;
  }, [engine.element, videoSettings]);

  const isAudioPlaying = engine.isPlaying;
  isMiniPlayerRef.current = isMiniPlayer;
  const visualizerMode = VISUALIZER_MODES.some((entry) => entry.id === settings.playerVisualizer)
    ? settings.playerVisualizer
    : "bars";
  const isPlayerFullscreen =
    activeTopTab === "media-player" && Boolean(playingLibraryMedia) && videoDisplayMode === "fullscreen";
  const shouldRenderPlayerBar = activeTopTab === "media-player" && Boolean(playingLibraryMedia);
  const playingDurationSeconds = engine.duration || playingLibraryMedia?.durationSeconds || 0;
  const audioPlayerProgress =
    playingDurationSeconds > 0 ? Math.min(100, (engine.currentTime / playingDurationSeconds) * 100) : 0;
  const audioPlayerCurrentTime = formatClock(engine.currentTime);
  const audioPlayerDuration = playingDurationSeconds > 0 ? formatClock(playingDurationSeconds) : "--:--";
  const isVideoEngineInPanel =
    Boolean(playingLibraryMedia) &&
    playingLibraryMedia.type === "video" &&
    selectedLibraryMedia?.id === playingLibraryMedia.id &&
    !isPlayerFullscreen;

  const mediaLibraryStats = useMemo(() => {
    const inLibrary = libraryItems.filter((item) => !item.session);
    const total = inLibrary.length;
    const videos = inLibrary.filter((item) => item.type === "video").length;
    const audios = inLibrary.filter((item) => item.type === "audio").length;
    return { total, videos, audios };
  }, [libraryItems]);

  useEffect(() => {
    queueItemsRef.current = queueItems;
  }, [queueItems]);

  useEffect(() => {
    if (!loading || !currentQueueItem) {
      setIsCurrentPaused(false);
      setIsPauseActionPending(false);
    }
  }, [loading, currentQueueItem]);

  useEffect(() => {
    const enforceFramelessWindow = async () => {
      try {
        const appWindow = getCurrentWindow();
        await appWindow.setDecorations(false);
        await appWindow.setShadow(false);
      } catch (err) {
        console.warn("Impossible de forcer le style de fenêtre non native:", err);
      }

      try {
        const appWindow = getCurrentWindow();
        await appWindow.setMinSize(new LogicalSize(MIN_WINDOW_SIZE.width, MIN_WINDOW_SIZE.height));
        if (startupWindowSize) {
          await appWindow.setSize(new LogicalSize(startupWindowSize.width, startupWindowSize.height));
        }
        // Dans tous les cas la fenêtre est recentrée, affichée et au premier plan (jamais hors écran ni masquée).
        await appWindow.center();
        await appWindow.unminimize();
        await appWindow.show();
        await appWindow.setFocus();
      } catch (err) {
        console.warn("Impossible de restaurer la taille de la fenêtre:", err);
      } finally {
        // On laisse passer les événements de redimensionnement du démarrage avant de sauvegarder.
        window.setTimeout(() => {
          windowSizeReadyRef.current = true;
        }, 800);
      }
    };

    const startupWindowSize = settings.saveWindowSize ? initialWindowSizeRef.current : null;

    enforceFramelessWindow();
  }, []);

  useEffect(() => {
    const url = form.url.trim();

    if (!settings.autoPreview || !url || !isValidUrl(url)) {
      setPreview(null);
      setPreviewError("");
      setPreviewLoading(false);
      setAnalyzedUrl("");
      return undefined;
    }

    setAnalyzedUrl("");

    let cancelled = false;
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError("");

      try {
        const response = await fetchMediaPreview(url);
        if (cancelled) return;
        setPreview(response);
        setAnalyzedUrl(url);
      } catch (err) {
        if (cancelled) return;
        setPreview(null);
        setAnalyzedUrl(url);
        const previewMessage = typeof err === "string" && err.trim() ? err : "Impossible d'analyser ce lien.";
        setPreviewError(previewMessage);
        notifyRef.current(previewMessage, { kind: "error", duration: 8000, id: "preview-error", title: "Analyse impossible" });
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.url, settings.autoPreview]);

  useEffect(() => {
    if (form.format === "mp4") {
      const composite = normalizeMp4QualityValue(form.quality);
      if (form.quality !== composite) {
        setForm((prev) => ({ ...prev, quality: composite }));
      }
      return;
    }

    if (qualityOptionsForFormat.includes(form.quality)) return;
    setForm((prev) => ({ ...prev, quality: qualityOptionsForFormat[0] }));
  }, [form.format, form.quality, qualityOptionsForFormat]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("rapidtunes.settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (!FORMAT_OPTIONS.includes(settings.defaultFormat)) {
      updateSetting("defaultFormat", INITIAL_FORM.format);
      return;
    }

    const normalizedQuality = normalizeQualityForFormat(settings.defaultFormat, settings.defaultQuality);
    if (normalizedQuality !== settings.defaultQuality) {
      updateSetting("defaultQuality", normalizedQuality);
    }
  }, [settings.defaultFormat, settings.defaultQuality]);

  // Le formulaire Media DL reprend le format et la qualité par défaut au démarrage et à chaque changement.
  useEffect(() => {
    if (!FORMAT_OPTIONS.includes(settings.defaultFormat)) return;
    const quality = normalizeQualityForFormat(settings.defaultFormat, settings.defaultQuality);
    setForm((prev) =>
      prev.format === settings.defaultFormat && prev.quality === quality
        ? prev
        : {
            ...prev,
            format: settings.defaultFormat,
            mode: settings.defaultFormat === "mp4" ? "video" : "extract_audio",
            quality
          }
    );
  }, [settings.defaultFormat, settings.defaultQuality]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queueItems));
    } catch (err) {
      console.warn("Impossible de sauvegarder la file d'attente en local:", err);
    }
  }, [queueItems]);

  useEffect(() => {
    const hydrateDefaultOutputDir = async () => {
      if (settings.defaultOutputDir.trim()) return;

      try {
        const downloadDir = await getDefaultDownloadDir();
        if (!downloadDir) return;
        updateSetting("defaultOutputDir", downloadDir);
      } catch (err) {
        console.warn("Impossible de récupérer le dossier Téléchargements par défaut:", err);
      }
    };

    const hydrateDefaultVideoDir = async () => {
      if (settings.defaultVideoOutputDir?.trim()) return;

      try {
        const videoDir = await getDefaultVideoDir();
        if (!videoDir) return;
        updateSetting("defaultVideoOutputDir", videoDir);
      } catch (err) {
        console.warn("Impossible de récupérer le dossier Vidéos par défaut:", err);
      }
    };

    hydrateDefaultOutputDir();
    hydrateDefaultVideoDir();
  }, []);

  useEffect(() => {
    if (!settingsOpen) return undefined;

    const handleEsc = (event) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [settingsOpen]);

  useEffect(() => {
    const formatErrorDetail = (title, detail, stack) => {
      const detailText = typeof detail === "string" ? detail : String(detail ?? "Erreur inconnue");
      const stackText = typeof stack === "string" ? stack.trim() : "";
      return {
        title,
        message: detailText,
        details: stackText ? `${detailText}\n\n${stackText}` : detailText
      };
    };

    const handleGlobalError = (event) => {
      const err = event?.error;
      const message = err?.message ?? event?.message ?? "Erreur JavaScript non gérée";
      const stack = err?.stack ?? "";
      setGlobalErrorModal(formatErrorDetail("Erreur de l'application", message, stack));
      setError(message);
    };

    const handleUnhandledRejection = (event) => {
      const reason = event?.reason;
      const message =
        (typeof reason === "string" && reason) ||
        reason?.message ||
        "Promesse rejetée non gérée";
      const stack = reason?.stack ?? "";
      setGlobalErrorModal(formatErrorDetail("Erreur asynchrone", message, stack));
      setError(message);
    };

    window.addEventListener("error", handleGlobalError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleGlobalError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  const handleCopyGlobalError = async () => {
    if (!globalErrorModal?.details) return;
    try {
      await navigator.clipboard.writeText(globalErrorModal.details);
      setResultMessage("Détails de l'erreur copiés.");
      setResultSuccess(true);
    } catch {
      setError("Impossible de copier les détails de l'erreur.");
    }
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const pushValidationError = (validationErrors) => {
    setError(validationErrors.join(" | "));
  };

  const askRetryAfterError = (message) =>
    new Promise((resolve) => {
      errorRetryResolverRef.current = resolve;
      setErrorRetryModal({ message });
    });

  const resolveRetryModal = (shouldRetry) => {
    const resolver = errorRetryResolverRef.current;
    errorRetryResolverRef.current = null;
    setErrorRetryModal(null);
    if (typeof resolver === "function") {
      resolver(shouldRetry);
    }
  };

  const enqueueCurrentJob = () => {
    const validation = validateJob(form);
    if (!validation.isValid) {
      pushValidationError(validation.errors);
      return null;
    }

    const newItem = createQueueItem(form, preview);
    queueItemsRef.current = [...queueItemsRef.current, newItem];
    setQueueItems((prev) => [...prev, newItem]);
    setError("");
    setResultMessage("Ajouté à la file d'attente.");
    setResultSuccess(true);
    return newItem;
  };

  const handleEnqueueSubmit = (event) => {
    event.preventDefault();

    if (!canSubmitDownload) {
      if (trimmedUrl && isValidUrl(trimmedUrl)) {
        setError("Le lien doit être analysé avant de lancer le téléchargement.");
      } else {
        setError("Colle un lien ou choisis un résultat de recherche.");
      }
      return;
    }

    const queuedItem = enqueueCurrentJob();
    if (!queuedItem) return;

    if (!loading) {
      runQueue(queuedItem.id);
    }
  };

  const handleFormSubmit = (event) => {
    if (activeTopTab !== "media-dl") {
      event.preventDefault();
      return;
    }

    handleEnqueueSubmit(event);
  };

  const runQueue = async (priorityItemId = null) => {
    if (loading) return;

    if (!queueItemsRef.current.some((item) => item.status === "queued")) {
      return;
    }

    let resolvedOutputDir = settings.defaultOutputDir.trim();

    if (!resolvedOutputDir) {
      let pickedDir = null;
      try {
        pickedDir = await pickOutputDirectory();
      } catch (err) {
        console.warn("Sélection de dossier indisponible:", err);
      }

      if (!pickedDir) {
        return;
      }

      resolvedOutputDir = pickedDir.trim();
      if (!resolvedOutputDir) {
        setError("Dossier de sortie requis ou définis un emplacement par défaut dans Paramètres.");
        return;
      }
    }

    setLoading(true);
    cancelRequestedRef.current = false;
    setIsCurrentPaused(false);
    setError("");
    setResultMessage("");

    let completedCount = 0;
    let failedCount = 0;
    let cancelledCount = 0;
    let isFirstIteration = true;

    while (true) {
      const queuedSnapshot = queueItemsRef.current.filter((item) => item.status === "queued");
      if (queuedSnapshot.length === 0) {
        break;
      }

      const job =
        isFirstIteration && priorityItemId
          ? queuedSnapshot.find((item) => item.id === priorityItemId) ?? queuedSnapshot[0]
          : queuedSnapshot[0];
      isFirstIteration = false;
      setIsCurrentPaused(false);

      setQueueItems((prev) =>
        prev.map((item) =>
          item.id === job.id
            ? {
                ...item,
                status: "running",
                phase: "preparing",
                message: "Préparation du téléchargement...",
                progress: 0,
                downloadSpeedKibps: null,
                downloadSpeedText: null,
                downloadStartedAt: null,
                rateLimitKibps: resolveSpeedLimitKibps(settings),
                completedAt: null,
                outputPath: null
              }
            : item
        )
      );
      setSpeedSamples([]);

      let unlistenProgress;
      try {
        unlistenProgress = await subscribeToDownloadProgress((payload) => {
          if (!payload || typeof payload !== "object") return;

          const normalizedPercent =
            typeof payload.percent === "number" ? Math.max(0, Math.min(100, payload.percent)) : null;

          if (payload.phase === "downloading" && typeof payload.download_speed_kibps === "number") {
            const sample = Math.max(0, payload.download_speed_kibps);
            setSpeedSamples((prev) => [...prev.slice(-59), sample]);
            setPeakSpeedKibps((prev) => Math.max(prev, sample));
          }

          setQueueItems((prev) =>
            prev.map((item) =>
              item.id === job.id
                ? {
                    ...item,
                    phase: payload.phase ?? item.phase,
                    message: payload.message ?? item.message,
                    progress: normalizedPercent,
                    downloadStartedAt:
                      item.downloadStartedAt ?? (payload.phase === "downloading" ? Date.now() : null),
                    downloadSpeedKibps:
                      typeof payload.download_speed_kibps === "number"
                        ? Math.max(0, payload.download_speed_kibps)
                        : null,
                    downloadSpeedText:
                      typeof payload.download_speed_text === "string"
                        ? payload.download_speed_text
                        : null,
                    rateLimitKibps:
                      typeof payload.rate_limit_kibps === "number" && payload.rate_limit_kibps > 0
                        ? payload.rate_limit_kibps
                        : item.rateLimitKibps
                  }
                : item
            )
          );
        });

        const jobIsVideo = job.form.format === "mp4";
        const jobOutputDir =
          jobIsVideo && settings.defaultVideoOutputDir?.trim()
            ? settings.defaultVideoOutputDir.trim()
            : resolvedOutputDir;
        const requestPayload = normalizePayload(
          job.form,
          jobOutputDir,
          job.preview,
          settings
        );

        const response = await runSingleJob(
          requestPayload
        );

        completedCount += 1;
        handleDownloadFinished(requestPayload.output_dir ?? jobOutputDir, jobIsVideo ? "video" : "music");
        setResultSuccess(true);
        setResultMessage(response.message);
        setQueueItems((prev) =>
          prev.map((item) =>
            item.id === job.id
              ? {
                  ...item,
                  status: "success",
                  phase: "completed",
                  progress: 100,
                  message: response.message,
                  resultMessage: response.message,
                  downloadSpeedKibps: null,
                  downloadSpeedText: null,
                  rateLimitKibps:
                    typeof item.rateLimitKibps === "number"
                      ? item.rateLimitKibps
                      : requestPayload.speed_limit_kibps,
                  completedAt: new Date().toISOString(),
                  outputPath:
                    typeof response.output_path === "string" && response.output_path.trim()
                      ? response.output_path
                      : null
                }
              : item
          )
        );
      } catch (err) {
        const rawError = err?.toString?.() ?? "Erreur inconnue pendant le traitement.";
        const cancelled = cancelRequestedRef.current || /annul|cancel/i.test(rawError);

        if (cancelled) {
          setQueueItems((prev) => prev.filter((item) => item.id !== job.id));
          cancelledCount += 1;
          cancelRequestedRef.current = false;
          setIsCurrentPaused(false);
          continue;
        }

        setError(rawError);

        const shouldRetry = await askRetryAfterError(rawError);

        if (shouldRetry) {
          setQueueItems((prev) =>
            prev.map((item) =>
              item.id === job.id
                ? {
                    ...item,
                    status: "queued",
                    phase: "queued",
                    progress: null,
                    message: "Relance demandée après erreur.",
                    resultMessage: "",
                    downloadSpeedKibps: null,
                    downloadSpeedText: null,
                    completedAt: null,
                    outputPath: null
                  }
                : item
            )
          );
          continue;
        }

        setQueueItems((prev) => prev.filter((item) => item.id !== job.id));

        failedCount += 1;
        continue;
      } finally {
        if (typeof unlistenProgress === "function") {
          await unlistenProgress();
        }
      }
    }

    const totalProcessed = completedCount + failedCount + cancelledCount;
    if (totalProcessed > 0) {
      const summary = `File terminée: ${completedCount} réussi(s), ${failedCount} erreur(s), ${cancelledCount} annulé(s).`;
      setResultSuccess(failedCount === 0);
      setResultMessage(summary);
    }

    // File terminée : on repart d'un état vide (plus d'aperçu du média déjà téléchargé).
    if (completedCount > 0) {
      setForm((prev) => ({ ...prev, url: "" }));
    }

    setLoading(false);
    cancelRequestedRef.current = false;
    setIsCurrentPaused(false);
  };

  const handleRunQueuedItem = (itemId) => {
    runQueue(itemId);
  };

  const handleRemoveQueuedItem = (itemId) => {
    if (loading) return;
    setQueueItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleRemoveFinishedItem = (itemId) => {
    setQueueItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleOpenFinishedItemLocation = async (item) => {
    const outputPath = typeof item?.outputPath === "string" ? item.outputPath.trim() : "";
    if (!outputPath) {
      setError("Chemin de sortie introuvable pour cet élément de l'historique.");
      return;
    }

    try {
      await openFileLocation(outputPath);
    } catch (err) {
      setError(err?.toString?.() ?? "Impossible d'ouvrir l'emplacement du fichier.");
    }
  };

  const handleMoveQueuedItem = (itemId, direction) => {
    if (loading) return;

    setQueueItems((prev) => {
      const queuedIndexes = prev
        .map((item, index) => (item.status === "queued" ? index : -1))
        .filter((index) => index >= 0);

      const sourcePosition = queuedIndexes.findIndex((index) => prev[index].id === itemId);
      if (sourcePosition < 0) return prev;

      const targetPosition = sourcePosition + direction;
      if (targetPosition < 0 || targetPosition >= queuedIndexes.length) return prev;

      const sourceIndex = queuedIndexes[sourcePosition];
      const targetIndex = queuedIndexes[targetPosition];

      const next = [...prev];
      [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];
      return next;
    });
  };

  const handleClearWaitingQueue = () => {
    if (loading) return;
    setQueueItems((prev) => prev.filter((item) => item.status !== "queued"));
  };

  const handleClearFinishedQueue = () => {
    setQueueItems((prev) => prev.filter((item) => !HISTORY_QUEUE_STATUSES.includes(item.status)));
  };

  const handleCancelCurrent = async () => {
    if (!loading) return;
    cancelRequestedRef.current = true;
    setIsCurrentPaused(false);

    try {
      await cancelActiveDownload();
    } catch (err) {
      setError(err?.toString?.() ?? "Impossible d'annuler le téléchargement actif.");
    }
  };

  const handleTogglePauseCurrent = async () => {
    if (!loading || !currentQueueItem || isPauseActionPending) return;

    setIsPauseActionPending(true);

    try {
      if (isCurrentPaused) {
        await resumeActiveDownload();
        setIsCurrentPaused(false);
        setResultSuccess(true);
        setResultMessage("Téléchargement repris.");
      } else {
        await pauseActiveDownload();
        setIsCurrentPaused(true);
        setResultSuccess(true);
        setResultMessage("Téléchargement mis en pause.");
      }
    } catch (err) {
      setError(err?.toString?.() ?? "Impossible de modifier l'état pause/reprise.");
    } finally {
      setIsPauseActionPending(false);
    }
  };

  useEffect(() => {
    let unlisten = null;
    let cancelled = false;
    const refresh = async () => {
      try {
        const maximized = await getCurrentWindow().isMaximized();
        if (!cancelled) setIsWindowMaximized(maximized);
      } catch {
        // Hors contexte Tauri (mode web): l'état reste « non agrandie ».
      }
    };
    refresh();
    getCurrentWindow()
      .onResized(refresh)
      .then((off) => {
        if (cancelled) off();
        else unlisten = off;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const handleWindowAction = async (action) => {
    try {
      const appWindow = getCurrentWindow();

      if (action === "minimize") {
        await appWindow.minimize();
      } else if (action === "maximize") {
        await appWindow.toggleMaximize();
      } else if (action === "close") {
        saveWindowSizeRef.current?.();
        await appWindow.close();
      }
    } catch (err) {
      console.warn("Action fenêtre indisponible hors contexte Tauri:", err);
    }
  };

  const stopDragPropagation = (event) => {
    event.stopPropagation();
  };

  const handleStartDragging = async (event) => {
    if (event.button !== 0) return;

    const target = event.target;
    if (target instanceof Element) {
      const blocked = target.closest("button, input, select, textarea, a, .tooltip-chip, .window-controls");
      if (blocked) return;
    }

    try {
      const appWindow = getCurrentWindow();
      await appWindow.startDragging();
    } catch (err) {
      console.warn("Drag de fenêtre indisponible hors contexte Tauri:", err);
    }
  };

  const handleCheckUpdate = async ({ silent = false } = {}) => {
    setUpdateState((prev) => ({ ...prev, status: "checking", message: "" }));
    try {
      const info = await checkForUpdate(APP_VERSION);
      if (info.available) {
        setUpdateState({ status: "available", info, message: "" });
      } else {
        setUpdateState({
          status: "uptodate",
          info,
          message: info.version ? "" : "Aucune version publiée pour le moment."
        });
      }
    } catch (error) {
      setUpdateState({
        status: silent ? "idle" : "error",
        info: null,
        message: silent ? "" : `Vérification impossible : ${error?.message ?? error}`
      });
    }
  };

  const handleDownloadUpdate = async () => {
    const asset = updateState.info?.asset;
    if (!asset) {
      setUpdateState((prev) => ({ ...prev, status: "error", message: "Aucun installateur (.exe / .msi) dans cette version." }));
      return;
    }
    setUpdateState((prev) => ({ ...prev, status: "downloading", message: "" }));
    try {
      const path = await downloadUpdate(asset.url, asset.name);
      setUpdateState((prev) => ({ ...prev, status: "ready", message: "", path }));
    } catch (error) {
      setUpdateState((prev) => ({ ...prev, status: "error", message: String(error) }));
    }
  };

  const handleInstallUpdate = async () => {
    try {
      await launchUpdate(updateState.path);
    } catch (error) {
      setUpdateState((prev) => ({ ...prev, status: "error", message: String(error) }));
    }
  };

  const renderUpdatePanel = () => (
    <div className="about-update" aria-live="polite">
      <p className="about-update__status">
        {updateState.status === "checking" && "Recherche de mises à jour..."}
        {updateState.status === "uptodate" &&
          (updateState.message || "RapidTunes est à jour.")}
        {updateState.status === "available" &&
          `Nouvelle version disponible : ${updateState.info.version} (actuelle : ${APP_VERSION})`}
        {updateState.status === "downloading" && "Téléchargement de la mise à jour..."}
        {updateState.status === "ready" && "Mise à jour téléchargée. Prête à être installée."}
        {updateState.status === "error" && updateState.message}
        {updateState.status === "idle" && "Vérifie si une nouvelle version est disponible."}
      </p>
      <div className="about-update__actions">
        {updateState.status === "available" ? (
          <button type="button" className="about-update__btn about-update__btn--primary" onClick={handleDownloadUpdate}>
            Télécharger la mise à jour
          </button>
        ) : null}
        {updateState.status === "ready" ? (
          <button type="button" className="about-update__btn about-update__btn--primary" onClick={handleInstallUpdate}>
            Installer et redémarrer
          </button>
        ) : null}
        {updateState.status !== "downloading" && updateState.status !== "ready" ? (
          <button
            type="button"
            className="about-update__btn"
            onClick={() => handleCheckUpdate()}
            disabled={updateState.status === "checking"}
          >
            Rechercher des mises à jour
          </button>
        ) : null}
      </div>
    </div>
  );

  // Vérification au démarrage (silencieuse), puis téléchargement automatique si l'option est activée.
  useEffect(() => {
    if (!settings.checkUpdatesOnStartup && !settings.autoUpdate) return;
    (async () => {
      try {
        const info = await checkForUpdate(APP_VERSION);
        if (!info.available) {
          setUpdateState((prev) => (prev.status === "idle" ? { status: "uptodate", info, message: "" } : prev));
          return;
        }
        setUpdateState({ status: "available", info, message: "" });
        if (settings.autoUpdate && info.asset) {
          setUpdateState((prev) => ({ ...prev, status: "downloading" }));
          const path = await downloadUpdate(info.asset.url, info.asset.name);
          setUpdateState((prev) => ({ ...prev, status: "ready", message: "", path }));
        }
      } catch (error) {
        console.warn("Vérification des mises à jour au démarrage impossible:", error);
        setUpdateState((prev) => (prev.status === "downloading" ? { ...prev, status: "available" } : prev));
      }
    })();
    // Une seule fois au lancement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissToast = (id) => setToasts((prev) => prev.filter((toast) => toast.id !== id));

  /** Affiche une notification. Une notification avec le même `id` en remplace une existante. */
  const notify = (message, { kind = "info", duration = 6000, id, title } = {}) => {
    if (!message) return;
    toastCounterRef.current += 1;
    const toastId = id ?? `toast-${toastCounterRef.current}`;
    setToasts((prev) => [...prev.filter((toast) => toast.id !== toastId), { id: toastId, key: toastCounterRef.current, kind, duration, title, message }].slice(-4));
  };
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  // Les erreurs et résultats d'actions passent tous par les notifications.
  useEffect(() => {
    if (!error) return;
    notifyRef.current(error, { kind: "error", duration: 8000 });
    setError("");
  }, [error]);

  useEffect(() => {
    if (!resultMessage) return;
    notifyRef.current(resultMessage, { kind: resultSuccess ? "success" : "error", duration: resultSuccess ? 4000 : 8000 });
    setResultMessage("");
  }, [resultMessage, resultSuccess]);

  // Installe automatiquement yt-dlp, ffmpeg et deno s'ils manquent (machine vierge).
  useEffect(() => {
    (async () => {
      try {
        const missing = await getMissingTools();
        if (!missing.length) return;
        notifyRef.current(
          "Installation des composants requis (yt-dlp, ffmpeg) : première utilisation, quelques minutes. Une connexion Internet est nécessaire.",
          { id: "tools", kind: "info", duration: 0, title: "Installation en cours" }
        );
        await prepareTools();
        notifyRef.current("Composants installés. Tout est prêt.", { id: "tools", kind: "success", duration: 4000 });
      } catch (error) {
        notifyRef.current(
          `${String(error?.message ?? error)} Vérifie ta connexion Internet puis relance RapidTunes.`,
          { id: "tools", kind: "error", duration: 12000, title: "Installation impossible" }
        );
      }
    })();
  }, []);

  const loadChangelog = async () => {
    setChangelog((prev) => ({ ...prev, status: "loading", message: "" }));
    try {
      const releases = await fetchChangelog();
      setChangelog({ status: "ready", releases, message: "" });
    } catch (error) {
      setChangelog({ status: "error", releases: [], message: `Journal des modifications indisponible : ${error?.message ?? error}` });
    }
  };

  useEffect(() => {
    if (activeTopTab === "about" && changelog.status === "idle") {
      loadChangelog();
    }
    // Chargé à la première ouverture de l'onglet « À propos ».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopTab]);

  useEffect(() => {
    handleCheckUpdate({ silent: true });
    // Vérification unique au démarrage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSetting = (name, value) => {
    setSettings((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleBrowseDefaultVideoDir = async () => {
    try {
      const selected = await pickOutputDirectory();
      if (!selected) return;
      updateSetting("defaultVideoOutputDir", selected);
    } catch (err) {
      console.warn("Sélection de dossier indisponible:", err);
    }
  };

  const handleBrowseDefaultOutputDir = async () => {
    try {
      const selected = await pickOutputDirectory();
      if (!selected) return;
      updateSetting("defaultOutputDir", selected);
    } catch (err) {
      console.warn("Sélection de dossier indisponible:", err);
    }
  };

  const applyFormDefaultsFromSettings = () => {
    const resolvedFormat = FORMAT_OPTIONS.includes(settings.defaultFormat)
      ? settings.defaultFormat
      : INITIAL_FORM.format;
    const resolvedQuality = normalizeQualityForFormat(resolvedFormat, settings.defaultQuality);

    setForm((prev) => ({
      ...prev,
      format: resolvedFormat,
      mode: resolvedFormat === "mp4" ? "video" : "extract_audio",
      quality: resolvedQuality,
      is_playlist: false
    }));
  };

  const resetSettingsToDefault = () => {
    setSettings({
      ...DEFAULT_SETTINGS,
      defaultOutputDir: settings.defaultOutputDir
    });
  };

  const currentQueueProgress =
    typeof currentQueueItem?.progress === "number"
      ? Math.max(0, Math.min(100, currentQueueItem.progress))
      : null;
  const currentDownloadSpeedLabel =
    typeof currentQueueItem?.downloadSpeedText === "string" && currentQueueItem.downloadSpeedText.trim()
      ? currentQueueItem.downloadSpeedText
      : formatSpeedKibps(currentQueueItem?.downloadSpeedKibps ?? null);
  const currentRateLimitLabel = formatSpeedKibps(currentQueueItem?.rateLimitKibps ?? null);
  const currentHeaderProgress = currentQueueProgress === null ? 0 : currentQueueProgress;
  const isCurrentIndeterminate =
    Boolean(currentQueueItem) && currentQueueProgress === null && currentQueueItem.phase !== "completed";
  const currentHeaderPercentText = isCurrentIndeterminate ? "..." : `${currentHeaderProgress.toFixed(1)} %`;
  const currentHeaderStatusText = currentQueueItem
    ? `${isCurrentPaused ? "En pause" : formatProgressPhase(currentQueueItem.phase)}${currentDownloadSpeedLabel && currentQueueItem.phase === "downloading" ? ` • ${currentDownloadSpeedLabel}` : ""}`
    : "En attente";
  let currentHeaderEtaText = "Estimation restante : --:--";
  if (currentQueueItem) {
    if (isCurrentPaused) {
      currentHeaderEtaText = "En pause";
    } else if (currentQueueItem.phase === "converting") {
      currentHeaderEtaText = "Conversion en cours...";
    } else if (currentQueueItem.phase === "completed") {
      currentHeaderEtaText = "Terminé";
    } else if (currentQueueItem.phase === "preparing") {
      currentHeaderEtaText = "Préparation en cours...";
    } else if (
      currentQueueItem.phase === "downloading" &&
      currentQueueProgress !== null &&
      currentQueueProgress >= 2 &&
      typeof currentQueueItem.downloadStartedAt === "number"
    ) {
      const elapsedSeconds = (Date.now() - currentQueueItem.downloadStartedAt) / 1000;
      const remainingSeconds = (elapsedSeconds * (100 - currentQueueProgress)) / currentQueueProgress;
      currentHeaderEtaText =
        currentQueueProgress >= 99.5
          ? "Finalisation..."
          : `Estimation restante : ${formatClock(remainingSeconds)}`;
    } else {
      currentHeaderEtaText = "Estimation restante : calcul en cours...";
    }
  }
  const currentSpeedKibps =
    typeof currentQueueItem?.downloadSpeedKibps === "number" ? currentQueueItem.downloadSpeedKibps : 0;
  const speedGraphMax = Math.max(1024, ...speedSamples);
  const speedGraphPoints = speedSamples.map((sample, index) => {
    const x = speedSamples.length > 1 ? (index / (speedSamples.length - 1)) * 100 : 100;
    const y = 100 - (sample / speedGraphMax) * 100;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const speedGraphLine = speedGraphPoints.join(" ");
  const speedGraphArea = speedGraphPoints.length > 0 ? `0,100 ${speedGraphLine} 100,100` : "";
  const hasQueueActivity = Boolean(currentQueueItem) || waitingQueueItems.length > 0;
  const historyDateLocale = LANGUAGE_OPTIONS.some((entry) => entry.value === settings.languageLocale)
    ? settings.languageLocale
    : "fr-FR";
  const queueDockWaitingCountText = `File d’attente : ${waitingQueueItems.length}`;
  const activeSettingsEntry = SETTINGS_MENU.find((entry) => entry.id === activeSettingsTab);
  const settingsPanelTitle = activeSettingsEntry?.label ?? "Paramètres";
  const settingsPanelDescription =
    SETTINGS_TAB_DESCRIPTIONS[activeSettingsTab] ??
    "Configuration des options de l'application.";
  const resolvedTheme = useMemo(() => resolveThemeStyles(settings), [settings]);

  const handleSelectMediaDlView = (view) => {
    setActiveTopTab("media-dl");
    setActiveMainView(view);
    setMediaDlMenuOpen(false);
  };


  function getPlaybackList() {
    if (queueList.some((item) => item.id === playingLibraryMediaId)) return queueList;
    const type = playingLibraryMedia?.type;
    return libraryItems.filter((item) => !type || item.type === type);
  }

  function handleTrackEnded() {
    const list = getPlaybackList();
    if (list.length === 0) return;
    if (repeatMode === "one") {
      engine.restart();
      return;
    }
    if (settings.playerAutoplayNext === false) return;
    const index = list.findIndex((item) => item.id === playingLibraryMediaId);
    if (!isShuffleOn && index === list.length - 1 && repeatMode === "off") return;
    if (list.length === 1) {
      if (repeatMode === "all") engine.restart();
      return;
    }
    stepLibraryMedia(1);
  }

  const recordRecent = (kind, key) => {
    if (settings.playerRememberRecent === false) return;
    setRecentEntries((prev) =>
      [{ kind, key }, ...prev.filter((entry) => !(entry.kind === kind && entry.key === key))].slice(0, MAX_RECENTS)
    );
  };

  const playLibraryItem = (item, list, options = {}) => {
    if (options.source) {
      recordRecent(options.source.kind, options.source.key);
    }
    skipRecentRef.current = options.source && item.id !== playingLibraryMediaId ? item.id : null;
    setSelectedLibraryMediaId(item.id);
    if (Array.isArray(list) && list.length > 0) {
      setPlayQueueIds(list.map((entry) => entry.id));
    }
    if (options.shuffle) setIsShuffleOn(true);
    if (item.id === playingLibraryMediaId) {
      engine.restart();
    } else {
      setPlayingLibraryMediaId(item.id);
    }
  };

  const playNext = (targets) => {
    if (!targets || targets.length === 0) return;
    if (!playingLibraryMediaId) {
      playLibraryItem(targets[0], targets);
      return;
    }
    const ids = targets.map((entry) => entry.id).filter((id) => id !== playingLibraryMediaId);
    setPlayQueueIds((prev) => {
      const base = prev.includes(playingLibraryMediaId) ? prev : [playingLibraryMediaId, ...prev];
      const rest = base.filter((id) => !ids.includes(id));
      const at = rest.indexOf(playingLibraryMediaId) + 1;
      return [...rest.slice(0, at), ...ids, ...rest.slice(at)];
    });
  };

  const addToPlayQueue = (targets) => {
    if (!targets || targets.length === 0) return;
    if (!playingLibraryMediaId) {
      playLibraryItem(targets[0], targets);
      return;
    }
    setPlayQueueIds((prev) => {
      const base = prev.includes(playingLibraryMediaId) ? prev : [playingLibraryMediaId, ...prev];
      return [...base, ...targets.map((entry) => entry.id).filter((id) => !base.includes(id))];
    });
  };

  const handleSaveTags = async (updates) => {
    await updateMediaTags(updates);
    librarySignatureRef.current = "";
    await refreshLibrary({ silent: false });
  };

  const openFilesAndPlay = async (loader) => {
    try {
      const raw = await loader();
      if (!raw || raw.length === 0) return;
      setOpenedRawItems((prev) => {
        const known = new Set(prev.map((entry) => entry.id));
        return [...prev, ...raw.filter((entry) => !known.has(entry.id))];
      });
      const mapped = raw.map((entry) => mapLibraryItem(entry, null, true));
      playLibraryItem(mapped[0], mapped);
    } catch (err) {
      console.warn("Ouverture de fichiers impossible:", err);
    }
  };

  const openFilesAndEnqueue = async (loader) => {
    try {
      const raw = await loader();
      if (!raw || raw.length === 0) return;
      setOpenedRawItems((prev) => {
        const known = new Set(prev.map((entry) => entry.id));
        return [...prev, ...raw.filter((entry) => !known.has(entry.id))];
      });
      addToPlayQueue(raw.map((entry) => mapLibraryItem(entry, null, true)));
    } catch (err) {
      console.warn("Ajout à la file d'attente impossible:", err);
    }
  };

  const handleAddFilesToQueue = () => openFilesAndEnqueue(() => pickMediaFiles());

  const handleAddFolderToQueue = () =>
    openFilesAndEnqueue(async () => {
      const directory = await pickOutputDirectory();
      return directory ? scanLibrary([directory], true, "all") : [];
    });

  const handleAddUrl = () => {
    setActiveTopTab("media-dl");
    window.setTimeout(() => document.querySelector(".url-input")?.focus(), 80);
  };

  const renamePlaylist = (playlistId, name) => {
    setPlaylists((prev) => prev.map((playlist) => (playlist.id === playlistId ? { ...playlist, name } : playlist)));
  };

  const handleOpenFiles = () => openFilesAndPlay(() => pickMediaFiles());

  const handleOpenFolder = () =>
    openFilesAndPlay(async () => {
      const directory = await pickOutputDirectory();
      return directory ? scanLibrary([directory], true, "all") : [];
    });

  const stepLibraryMedia = (delta) => {
    const list = getPlaybackList();
    if (list.length === 0) return;
    if (delta < 0 && engine.currentTime > 3) {
      engine.restart();
      return;
    }
    const currentIndex = list.findIndex((item) => item.id === playingLibraryMedia?.id);
    let nextItem;
    if (isShuffleOn && list.length > 1) {
      const others = list.filter((item) => item.id !== playingLibraryMedia?.id);
      nextItem = others[Math.floor(Math.random() * others.length)];
    } else {
      nextItem = list[(currentIndex + delta + list.length) % list.length];
    }
    if (nextItem.id === playingLibraryMedia?.id) {
      engine.restart();
      return;
    }
    setSelectedLibraryMediaId(nextItem.id);
    setPlayingLibraryMediaId(nextItem.id);
  };

  const renderSettingToggle = (name, title, description) => (
    <section className="settings-block" key={name}>
      <div className="settings-toggle-row settings-toggle-row--head">
        <div className="settings-toggle-text">
          <strong>{title}</strong>
          <small>{description}</small>
        </div>
        <span className="settings-switch">
          <input
            type="checkbox"
            checked={settings[name] !== false}
            onChange={(event) => updateSetting(name, event.target.checked)}
          />
          <span className="settings-switch-track">
            <span className="settings-switch-thumb" />
          </span>
        </span>
      </div>
    </section>
  );

  const reorderQueueItems = (dragId, targetId) => {
    if (!dragId || dragId === targetId) return;
    setQueueItems((prev) => {
      const from = prev.findIndex((item) => item.id === dragId);
      const to = prev.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0 || prev[from].status !== "queued" || prev[to].status !== "queued") return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleTrackClick = (event) => {
    if (playingDurationSeconds <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    engine.seek(ratio * playingDurationSeconds);
  };

  const handleAddLibraryFolder = async (kind = "music") => {
    try {
      const selected = await pickOutputDirectory();
      if (!selected) return;
      setLibraryFolders((prev) => {
        const current = prev ?? { music: [], video: [] };
        const list = current[kind] ?? [];
        if (list.includes(selected)) return current;
        return { ...current, needsVideoDefault: false, [kind]: [...list, selected] };
      });
    } catch (err) {
      console.warn("Sélection de dossier indisponible:", err);
    }
  };

  const handleRemoveLibraryFolder = (kind, folder) => {
    setLibraryFolders((prev) =>
      prev ? { ...prev, needsVideoDefault: false, [kind]: prev[kind].filter((item) => item !== folder) } : prev
    );
  };

  libraryFoldersRef.current = libraryFolders;
  libraryRecursiveRef.current = settings.libraryIncludeSubfolders !== false;

  const refreshLibrary = async ({ silent = false } = {}) => {
    const folders = libraryFoldersRef.current;
    if (!folders || libraryScanBusyRef.current) return;

    libraryScanBusyRef.current = true;
    if (!silent) setLibraryLoading(true);
    try {
      const recursive = libraryRecursiveRef.current;
      const [music, video] = await Promise.all([
        folders.music.length > 0 ? scanLibrary(folders.music, recursive, "audio") : [],
        folders.video.length > 0 ? scanLibrary(folders.video, recursive, "video") : []
      ]);

      const seen = new Set();
      const merged = [...music, ...video].filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      const signature = merged.map((item) => `${item.id}|${item.modifiedSecs}|${item.sizeBytes}`).join("\n");
      if (signature !== librarySignatureRef.current) {
        librarySignatureRef.current = signature;
        setLibraryRawItems(merged);
      }
      setLibraryError("");
    } catch (err) {
      if (!silent) {
        setLibraryError(typeof err === "string" ? err : "Impossible d'analyser la bibliothèque.");
      }
    } finally {
      libraryScanBusyRef.current = false;
      if (!silent) setLibraryLoading(false);
    }
  };
  refreshLibraryRef.current = refreshLibrary;

  function handleDownloadFinished(outputDir, kind = "music") {
    const current = libraryFoldersRef.current;
    if (!current) return;
    const directory = typeof outputDir === "string" ? outputDir.trim() : "";
    const normalize = (path) => path.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();
    const list = current[kind] ?? [];
    const covered =
      !directory ||
      list.some((folder) => {
        const root = normalize(folder);
        const target = normalize(directory);
        return target === root || target.startsWith(`${root}/`);
      });

    if (!covered) {
      setLibraryFolders({ ...current, needsVideoDefault: false, [kind]: [...list, directory] });
    }
  }

  const createPlaylist = (name, itemIds = []) => {
    const id = `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setPlaylists((prev) => [...prev, { id, name, itemIds }]);
    return id;
  };

  const deletePlaylist = (playlistId) => {
    setPlaylists((prev) => prev.filter((playlist) => playlist.id !== playlistId));
  };

  const addToPlaylist = (playlistId, itemId) => {
    setPlaylists((prev) =>
      prev.map((playlist) =>
        playlist.id === playlistId && !playlist.itemIds.includes(itemId)
          ? { ...playlist, itemIds: [...playlist.itemIds, itemId] }
          : playlist
      )
    );
  };

  const removeFromPlaylist = (playlistId, itemId) => {
    setPlaylists((prev) =>
      prev.map((playlist) =>
        playlist.id === playlistId
          ? { ...playlist, itemIds: playlist.itemIds.filter((id) => id !== itemId) }
          : playlist
      )
    );
  };

  // Pochette d'un album: on essaie les morceaux de l'album jusqu'à en trouver une.
  const requestAlbumArt = (item, priority) => {
    const key = `album:${item.album}`;
    if (requestedArtRef.current.has(key)) return;
    requestedArtRef.current.add(key);
    const candidates = libraryItems
      .filter((entry) => entry.type === "audio" && entry.album === item.album)
      .sort((a, b) => (a.track ?? 9999) - (b.track ?? 9999))
      .slice(0, 6);
    const run = async () => {
      for (const candidate of candidates) {
        let art = "";
        try {
          art = (await getMediaCover(candidate.path)) || "";
        } catch {
          art = "";
        }
        setMediaArtById((prev) => ({ ...prev, [candidate.id]: art }));
        if (art) return;
      }
    };
    if (priority) {
      run();
    } else {
      artQueueRef.current = artQueueRef.current.then(run);
    }
  };

  const requestArt = (item, { priority = false } = {}) => {
    if (!item || settings.playerShowCovers === false) return;
    if (item.type === "audio" && item.album && item.album !== "Album inconnu") {
      requestAlbumArt(item, priority);
      return;
    }
    if (requestedArtRef.current.has(item.id)) return;
    requestedArtRef.current.add(item.id);
    const loadArt = item.type === "video" ? getVideoThumbnail : getMediaCover;
    const task = () =>
      loadArt(item.path)
        .then((art) => setMediaArtById((prev) => ({ ...prev, [item.id]: art || "" })))
        .catch(() => setMediaArtById((prev) => ({ ...prev, [item.id]: "" })));

    if (priority) {
      task();
    } else {
      artQueueRef.current = artQueueRef.current.then(task);
    }
  };

  const renderMoreMenu = () => {
    const closeSubmenus = () => {
      setIsSpeedMenuOpen(false);
      setIsVisualizerMenuOpen(false);
      setIsVizColorOpen(false);
      setIsVideoSettingsOpen(false);
    };
    const openPage = (open) => {
      closeSubmenus();
      open(true);
    };
    const isVideoMedia = playingLibraryMedia?.type === "video";
    const page = isSpeedMenuOpen
      ? "speed"
      : isVisualizerMenuOpen
        ? "viz"
        : isVizColorOpen
          ? "color"
          : isVideoSettingsOpen && isVideoMedia
            ? "video"
            : null;
    const pageTitles = {
      speed: "Vitesse de lecture",
      viz: "Visualisation",
      color: "Couleurs de la visualisation",
      video: "Paramètres vidéo"
    };
    const goBack = () => {
      if (page === "color") openPage(setIsVisualizerMenuOpen);
      else closeSubmenus();
    };
    const visualizerLabel = VISUALIZER_MODES.find((entry) => entry.id === visualizerMode)?.label;
    const colorLabel = VISUALIZER_COLORS.find((entry) => entry.id === settings.playerVisualizerColor)?.label;
    const checkMark = (active) => (
      <span className="media-player-menu__check">{active ? <PlayerIcon name="check" /> : null}</span>
    );

    return (
      <div className="media-player-menu-anchor">
        <button
          type="button"
          className={`media-player-btn ${isMoreMenuOpen ? "active" : ""}`}
          onClick={() => {
            closeSubmenus();
            setIsMoreMenuOpen((prev) => !prev);
          }}
          aria-haspopup="menu"
          aria-expanded={isMoreMenuOpen}
          aria-label="Plus d'options"
          title="Plus d'options"
        >
          <PlayerIcon name="more" />
        </button>
        {isMoreMenuOpen ? (
          <div className="media-player-menu" role="menu">
            {page ? (
              <>
                <button type="button" className="media-player-menu__back" onClick={goBack}>
                  <span className="media-player-menu__chevron media-player-menu__chevron--back">
                    <PlayerIcon name="chevron" />
                  </span>
                  <span>{pageTitles[page]}</span>
                </button>
                <div className="media-player-menu__divider" />
                {page === "speed"
                  ? PLAYBACK_SPEEDS.map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        role="menuitemradio"
                        aria-checked={playbackSpeed === speed}
                        className="media-player-menu__item media-player-menu__item--sub"
                        onClick={() => setPlaybackSpeed(speed)}
                      >
                        {checkMark(playbackSpeed === speed)}
                        <span>{speed === 1 ? "Normale (1x)" : `${speed}x`}</span>
                      </button>
                    ))
                  : null}
                {page === "viz" ? (
                  <>
                    {VISUALIZER_MODES.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={visualizerMode === entry.id}
                        className="media-player-menu__item media-player-menu__item--sub"
                        onClick={() => updateSetting("playerVisualizer", entry.id)}
                      >
                        {checkMark(visualizerMode === entry.id)}
                        <span>{entry.label}</span>
                      </button>
                    ))}
                    {visualizerMode !== "off" ? (
                      <>
                        <div className="media-player-menu__divider" />
                        <button
                          type="button"
                          role="menuitem"
                          className="media-player-menu__item"
                          onClick={() => openPage(setIsVizColorOpen)}
                        >
                          <PlayerIcon name="equalizer" />
                          <span>Couleurs ({colorLabel})</span>
                          <span className="media-player-menu__chevron">
                            <PlayerIcon name="chevron" />
                          </span>
                        </button>
                      </>
                    ) : null}
                  </>
                ) : null}
                {page === "color" ? (
                  <>
                    {VISUALIZER_COLORS.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={settings.playerVisualizerColor === entry.id}
                        className="media-player-menu__item media-player-menu__item--sub"
                        onClick={() => updateSetting("playerVisualizerColor", entry.id)}
                      >
                        {checkMark(settings.playerVisualizerColor === entry.id)}
                        <span>{entry.label}</span>
                        <span
                          className="media-player-menu__swatch"
                          style={{
                            background: entry.colors
                              ? `linear-gradient(90deg, ${entry.colors.join(", ")})`
                              : entry.id === "custom"
                                ? settings.playerVisualizerCustomColor
                                : "linear-gradient(90deg, var(--neon-2), var(--neon-1), var(--neon-3))"
                          }}
                        />
                      </button>
                    ))}
                    {settings.playerVisualizerColor === "custom" ? (
                      <label className="media-player-menu__slider">
                        <span>Couleur personnalisée</span>
                        <input
                          type="color"
                          value={settings.playerVisualizerCustomColor}
                          onChange={(event) => updateSetting("playerVisualizerCustomColor", event.target.value)}
                        />
                      </label>
                    ) : null}
                  </>
                ) : null}
                {page === "video" ? (
                  <>
                    {VIDEO_ADJUSTMENTS.map((adjustment) => (
                      <label key={adjustment.id} className="media-player-menu__slider">
                        <span>
                          {adjustment.label} ({videoSettings[adjustment.id]}%)
                        </span>
                        <input
                          type="range"
                          min="50"
                          max="150"
                          step="5"
                          value={videoSettings[adjustment.id]}
                          onChange={(event) =>
                            setVideoSettings((prev) => ({ ...prev, [adjustment.id]: Number(event.target.value) }))
                          }
                        />
                      </label>
                    ))}
                    <div className="media-player-menu__divider" />
                    {VIDEO_FIT_MODES.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={videoSettings.fit === mode.id}
                        className="media-player-menu__item media-player-menu__item--sub"
                        onClick={() => setVideoSettings((prev) => ({ ...prev, fit: mode.id }))}
                      >
                        {checkMark(videoSettings.fit === mode.id)}
                        <span>{mode.label}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      role="menuitem"
                      className="media-player-menu__item media-player-menu__item--sub"
                      onClick={() => setVideoSettings(DEFAULT_VIDEO_SETTINGS)}
                    >
                      <span />
                      <span>Réinitialiser</span>
                    </button>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <button type="button" role="menuitem" className="media-player-menu__item" onClick={openProperties}>
                  <PlayerIcon name="info" />
                  <span>Propriétés</span>
                  <kbd>Ctrl+I</kbd>
                </button>
                <button type="button" role="menuitem" className="media-player-menu__item" onClick={openEqualizer}>
                  <PlayerIcon name="equalizer" />
                  <span>Égaliseur</span>
                  <kbd>Ctrl+Maj+E</kbd>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="media-player-menu__item"
                  onClick={() => openPage(setIsSpeedMenuOpen)}
                >
                  <PlayerIcon name="speed" />
                  <span>Vitesse ({playbackSpeed}x)</span>
                  <span className="media-player-menu__chevron">
                    <PlayerIcon name="chevron" />
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="media-player-menu__item"
                  onClick={() => openPage(setIsVisualizerMenuOpen)}
                >
                  <PlayerIcon name="equalizer" />
                  <span>Visualisation ({visualizerLabel})</span>
                  <span className="media-player-menu__chevron">
                    <PlayerIcon name="chevron" />
                  </span>
                </button>
                <button type="button" role="menuitem" className="media-player-menu__item" disabled title="Non disponible">
                  <PlayerIcon name="cast" />
                  <span>Diffuser sur un appareil</span>
                  <kbd>Ctrl+K</kbd>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="media-player-menu__item"
                  disabled={!isVideoMedia}
                  title={!isVideoMedia ? "Disponible pour les vidéos" : undefined}
                  onClick={() => openPage(setIsVideoSettingsOpen)}
                >
                  <PlayerIcon name="video" />
                  <span>Paramètres vidéo</span>
                  <span className="media-player-menu__chevron">
                    <PlayerIcon name="chevron" />
                  </span>
                </button>
                <button type="button" role="menuitem" className="media-player-menu__item" onClick={() => seekBy(-10)}>
                  <PlayerIcon name="back10" />
                  <span>Retour rapide de 10 secondes</span>
                  <kbd>Ctrl+Gauche</kbd>
                </button>
                <button type="button" role="menuitem" className="media-player-menu__item" onClick={() => seekBy(30)}>
                  <PlayerIcon name="forward30" />
                  <span>Avance rapide de 30 secondes</span>
                  <kbd>Ctrl+Droite</kbd>
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const renderPlayerBar = (isFullscreen) => (
    <section
      className={`media-player-bar ${isFullscreen ? "media-player-bar--fullscreen" : ""}`}
      aria-label="Barre de lecture"
    >
      <div className="media-player-bar__timeline">
        <span>{audioPlayerCurrentTime}</span>
        <div
          className="media-player-bar__track"
          onClick={handleTrackClick}
          role="slider"
          aria-label="Position de lecture"
          aria-valuemin={0}
          aria-valuemax={Math.round(playingDurationSeconds)}
          aria-valuenow={Math.round(engine.currentTime)}
        >
          <span style={{ width: `${audioPlayerProgress}%` }} />
        </div>
        <span>{audioPlayerDuration}</span>
      </div>

      <div className="media-player-bar__row">
        <div className="media-player-bar__meta">
          {!isFullscreen ? (
            <div className="media-player-bar__thumb" aria-hidden="true">
              {playingLibraryMedia?.thumbnailUrl ? (
                <img src={playingLibraryMedia.thumbnailUrl} alt="" />
              ) : (
                <img src={playingLibraryMedia?.type === "video" ? playIcon : musicIcon} alt="" />
              )}
            </div>
          ) : null}
          <div className="media-player-bar__text">
            <strong>{playingLibraryMedia?.title ?? "Aucun titre"}</strong>
            <span>
              {engine.error ||
                (playingLibraryMedia?.type === "video"
                  ? [playingLibraryMedia.artist, playingLibraryMedia.album]
                      .filter((value) => value && value !== "Artiste inconnu" && value !== "Album inconnu")
                      .join(" • ")
                  : `${playingLibraryMedia?.artist ?? "Artiste inconnu"} • ${playingLibraryMedia?.album ?? ""}`)}
            </span>
          </div>
        </div>

        <div className="media-player-bar__controls">
          <button
            type="button"
            className={`media-player-btn ${isShuffleOn ? "active" : ""}`}
            onClick={() => setIsShuffleOn((prev) => !prev)}
            aria-pressed={isShuffleOn}
            aria-label="Lecture aléatoire"
            title="Lecture aléatoire"
          >
            <PlayerIcon name="shuffle" />
          </button>
          <button
            type="button"
            className="media-player-btn"
            onClick={() => stepLibraryMedia(-1)}
            aria-label="Précédent"
            title="Précédent"
          >
            <PlayerIcon name="prev" />
          </button>
          <button
            type="button"
            className="media-player-btn media-player-btn--play"
            onClick={engine.toggle}
            aria-label={isAudioPlaying ? "Mettre en pause" : "Lire"}
            title={isAudioPlaying ? "Pause (Espace)" : "Lecture (Espace)"}
          >
            <PlayerIcon name={isAudioPlaying ? "pause" : "play"} />
          </button>
          <button
            type="button"
            className="media-player-btn"
            onClick={() => stepLibraryMedia(1)}
            aria-label="Suivant"
            title="Suivant"
          >
            <PlayerIcon name="next" />
          </button>
          <button
            type="button"
            className={`media-player-btn ${repeatMode !== "off" ? "active" : ""}`}
            onClick={() =>
              setRepeatMode((prev) => (prev === "off" ? "all" : prev === "all" ? "one" : "off"))
            }
            aria-pressed={repeatMode !== "off"}
            aria-label={
              repeatMode === "one"
                ? "Répéter le média"
                : repeatMode === "all"
                  ? "Répéter la liste"
                  : "Répétition désactivée"
            }
            title={
              repeatMode === "one"
                ? "Répéter le média"
                : repeatMode === "all"
                  ? "Répéter la liste"
                  : "Répétition désactivée"
            }
          >
            <PlayerIcon
              name={repeatMode === "one" ? "repeat-one" : repeatMode === "all" ? "repeat" : "repeat-off"}
            />
          </button>
        </div>

        <div className="media-player-bar__side">
          <div className="media-player-volume">
            <button
              type="button"
              className="media-player-btn"
              onClick={() => setIsMuted((prev) => !prev)}
              aria-label={isMuted ? "Réactiver le son" : "Couper le son"}
              title={isMuted ? "Réactiver le son" : "Couper le son"}
            >
              <PlayerIcon name={isMuted || volume === 0 ? "volume-0" : volume < 0.34 ? "volume-1" : volume < 0.67 ? "volume-2" : "volume-3"} />
            </button>
            <input
              type="range"
              className="media-player-volume__slider"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(event) => {
                setVolume(Number(event.target.value));
                setIsMuted(false);
              }}
              aria-label="Volume"
            />
          </div>
          <button
            type="button"
            className="media-player-btn"
            onClick={toggleMiniPlayer}
            aria-label="Mini lecteur (Ctrl+M)"
            title="Mini lecteur (Ctrl+M)"
          >
            <PlayerIcon name="mini" />
          </button>
          <button
            type="button"
            className="media-player-btn"
            onClick={() => setVideoDisplayMode(isFullscreen ? "windowed" : "fullscreen")}
            aria-label={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
            title={isFullscreen ? "Quitter le plein écran (Échap)" : "Plein écran"}
          >
            <PlayerIcon name={isFullscreen ? "minimize" : "maximize"} />
          </button>
          {renderMoreMenu()}
        </div>
      </div>
    </section>
  );

  const toggleMiniPlayer = async () => {
    const enteringMini = !isMiniPlayer;
    try {
      const appWindow = getCurrentWindow();
      if (enteringMini) {
        const scale = await appWindow.scaleFactor();
        savedWindowSizeRef.current = (await appWindow.innerSize()).toLogical(scale);
        setVideoDisplayMode("windowed");
        await appWindow.setMinSize(new LogicalSize(320, 220));
        await appWindow.setSize(new LogicalSize(460, 260));
        await appWindow.setAlwaysOnTop(settings.playerMiniAlwaysOnTop !== false);
      } else {
        await appWindow.setAlwaysOnTop(false);
        await appWindow.setMinSize(new LogicalSize(MIN_WINDOW_SIZE.width, MIN_WINDOW_SIZE.height));
        const previous = savedWindowSizeRef.current;
        await appWindow.setSize(
          new LogicalSize(
            previous?.width ?? MIN_WINDOW_SIZE.width,
            previous?.height ?? MIN_WINDOW_SIZE.height
          )
        );
      }
    } catch (err) {
      console.warn("Mini lecteur indisponible hors contexte Tauri:", err);
    }
    setIsMiniPlayer(enteringMini);
  };

  const seekBy = (deltaSeconds) => {
    if (playingDurationSeconds <= 0) return;
    engine.seek(engine.currentTime + deltaSeconds);
    setIsMoreMenuOpen(false);
  };

  function openProperties() {
    setIsMoreMenuOpen(false);
    setIsPropertiesOpen(true);
  }

  function openEqualizer() {
    setIsMoreMenuOpen(false);
    setIsEqOpen(true);
  }

  const applyEqPreset = (presetId) => {
    const preset = EQ_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setEqPresetId(preset.id);
    setEqGains(preset.gains);
  };

  const changeEqGain = (index, value) => {
    setEqPresetId("custom");
    setEqGains((prev) => {
      const delta = value - prev[index];
      return prev.map((gain, i) => {
        if (i === index) return value;
        if (!isEqLinked) return gain;
        const distance = Math.abs(i - index);
        const factor = distance === 1 ? 0.5 : distance === 2 ? 0.25 : 0;
        return Math.max(-EQ_RANGE_DB, Math.min(EQ_RANGE_DB, Math.round(gain + delta * factor)));
      });
    });
  };

  useEffect(() => {
    if (libraryFolders !== null && !libraryFolders.needsVideoDefault) return undefined;
    let cancelled = false;
    (async () => {
      const safe = async (loader) => {
        try {
          return (await loader()) ?? "";
        } catch {
          return "";
        }
      };
      const musicDir = settings.defaultOutputDir?.trim() || (await safe(getDefaultDownloadDir));
      const videoDir = settings.defaultVideoOutputDir?.trim() || (await safe(getDefaultVideoDir));
      if (cancelled) return;
      setLibraryFolders((prev) => {
        if (prev === null) {
          return { music: musicDir ? [musicDir] : [], video: videoDir ? [videoDir] : [] };
        }
        return {
          music: prev.music,
          video: videoDir && !prev.video.includes(videoDir) ? [...prev.video, videoDir] : prev.video
        };
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (libraryFolders === null) return;
    try {
      window.localStorage.setItem(
        LIBRARY_FOLDERS_KEY,
        JSON.stringify({ music: libraryFolders.music, video: libraryFolders.video })
      );
    } catch {
      // stockage indisponible: la liste reste valable pour la session
    }
    librarySignatureRef.current = "";
    refreshLibraryRef.current?.({ silent: false });
  }, [libraryFolders, settings.libraryIncludeSubfolders]);

  useEffect(() => {
    if (!playingLibraryMedia) return;
    if (skipRecentRef.current === playingLibraryMedia.id) {
      skipRecentRef.current = null;
      return;
    }
    recordRecent(playingLibraryMedia.type === "video" ? "video" : "track", playingLibraryMedia.id);
  }, [playingLibraryMediaId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(RECENTS_KEY, JSON.stringify(settings.playerRememberRecent === false ? [] : recentEntries));
    } catch {
      // historique non persisté
    }
  }, [recentEntries, settings.playerRememberRecent]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
    } catch {
      // listes de lecture non persistées
    }
  }, [playlists]);

  useEffect(() => {
    savePlayerPrefs({ volume, muted: isMuted });
  }, [volume, isMuted]);

  useEffect(() => {
    // Plus de sélection mémorisée: au lancement, aucun média n'est sélectionné.
    savePlayerPrefs({ lastMediaId: null });
  }, []);

  useEffect(() => {
    requestArt(selectedLibraryMedia, { priority: true });
    requestArt(playingLibraryMedia, { priority: true });
  }, [selectedLibraryMedia?.id, playingLibraryMedia?.id, settings.playerShowCovers]);

  const saveWindowSizeNow = () => {
    if (!settings.saveWindowSize || !windowSizeReadyRef.current) return;
    // Ni en plein écran, ni en mini lecteur, ni maximisée: ces tailles ne sont pas celles de la fenêtre normale.
    if (isMiniPlayerRef.current || fullscreenActiveRef.current || document.fullscreenElement) return;
    const maximized =
      window.outerWidth >= window.screen.availWidth - 8 && window.outerHeight >= window.screen.availHeight - 8;
    if (maximized) return;
    try {
      window.localStorage.setItem(
        WINDOW_SIZE_KEY,
        JSON.stringify({ width: window.innerWidth, height: window.innerHeight })
      );
    } catch {
      // taille non sauvegardée
    }
  };
  saveWindowSizeRef.current = saveWindowSizeNow;

  useEffect(() => {
    let timer = null;
    const handleResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => saveWindowSizeRef.current?.(), 150);
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("beforeunload", handleResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("beforeunload", handleResize);
    };
  }, []);

  useEffect(() => {
    fullscreenActiveRef.current = isPlayerFullscreen;
    // Vrai plein écran: la fenêtre occupe tout l'écran et ne peut plus être déplacée.
    (async () => {
      try {
        const appWindow = getCurrentWindow();
        if (isPlayerFullscreen) {
          // Sans cadre de redimensionnement ni barre des tâches par-dessus, la bordure Windows disparaît.
          // Une fenêtre sans cadre agrandie garde la zone de travail (barre des tâches visible): on la restaure d'abord.
          wasMaximizedBeforeFullscreenRef.current = await appWindow.isMaximized();
          if (wasMaximizedBeforeFullscreenRef.current) await appWindow.unmaximize();
          await appWindow.setResizable(false);
          await appWindow.setAlwaysOnTop(true);
          await appWindow.setFullscreen(true);
        } else {
          await appWindow.setFullscreen(false);
          if (!isMiniPlayerRef.current) await appWindow.setAlwaysOnTop(false);
          await appWindow.setResizable(true);
          if (wasMaximizedBeforeFullscreenRef.current) {
            wasMaximizedBeforeFullscreenRef.current = false;
            await appWindow.maximize();
          }
        }
      } catch (err) {
        console.warn("Plein écran indisponible hors contexte Tauri:", err);
      }
    })();
  }, [isPlayerFullscreen]);

  useLayoutEffect(() => {
    const element = engine.element;
    if (!element) return;
    const target =
      (isPlayerFullscreen && playingLibraryMedia?.type === "video" ? fullscreenHostRef.current : null) ??
      (isVideoEngineInPanel ? panelHostNode : null) ??
      hiddenHostRef.current;
    if (target && element.parentNode !== target) {
      const wasPlaying = !element.paused;
      target.appendChild(element);
      if (wasPlaying && element.paused) element.play().catch(() => {});
    }
  });

  useEffect(() => {
    if (!isMoreMenuOpen) return undefined;
    const handlePointerDown = (event) => {
      if (event.target instanceof Element && event.target.closest(".media-player-menu-anchor")) return;
      setIsMoreMenuOpen(false);
      setIsSpeedMenuOpen(false);
      setIsVisualizerMenuOpen(false);
      setIsVizColorOpen(false);
      setIsVideoSettingsOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isMoreMenuOpen]);

  useEffect(() => {
    const canUsePlayerShortcuts = isMiniPlayer || (activeTopTab === "media-player" && Boolean(playingLibraryMedia));
    if (!canUsePlayerShortcuts) return undefined;
    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();
      if (event.key === "Escape") {
        if (isEqOpen) setIsEqOpen(false);
        else if (isPropertiesOpen) setIsPropertiesOpen(false);
        else if (isMoreMenuOpen) setIsMoreMenuOpen(false);
        else if (isPlayerFullscreen) setVideoDisplayMode("windowed");
      } else if (
        event.key === " " &&
        !(event.target instanceof Element && event.target.closest("input, select, textarea, button, a"))
      ) {
        event.preventDefault();
        engine.toggle();
      } else if (event.ctrlKey && event.shiftKey && key === "e") {
        event.preventDefault();
        openEqualizer();
      } else if (event.ctrlKey && key === "m") {
        event.preventDefault();
        toggleMiniPlayer();
      } else if (event.ctrlKey && key === "i") {
        event.preventDefault();
        openProperties();
      } else if (event.ctrlKey && event.key === "ArrowLeft") {
        event.preventDefault();
        seekBy(-10);
      } else if (event.ctrlKey && event.key === "ArrowRight") {
        event.preventDefault();
        seekBy(30);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <main className="app-root" style={resolvedTheme.style}>
      <section className="window-frame">
        <header className="titlebar" data-tauri-drag-region onMouseDown={handleStartDragging}>
          <div className="titlebar-hit-zone" onMouseDown={handleStartDragging} aria-hidden="true" />
          <div className="titlebar-drag" data-tauri-drag-region onMouseDown={handleStartDragging}>
            <h1>RapidTunes</h1>
            <div className="titlebar-nav-shell" onMouseDown={stopDragPropagation}>
              <nav className="titlebar-tabs" aria-label="Navigation principale">
                <button
                  type="button"
                  className={`titlebar-tab ${activeTopTab === "media-player" ? "active" : ""}`}
                  onClick={() => {
                    setActiveTopTab("media-player");
                    setMediaDlMenuOpen(false);
                  }}
                >
                  Lecteur média
                </button>

                <button
                  type="button"
                  className={`titlebar-tab ${activeTopTab === "media-dl" ? "active" : ""}`}
                  onClick={() => {
                    setActiveTopTab("media-dl");
                    setMediaDlMenuOpen(false);
                  }}
                >
                  Media DL
                </button>

                <button
                  type="button"
                  className={`titlebar-tab ${activeTopTab === "about" ? "active" : ""}`}
                  onClick={() => {
                    setActiveTopTab("about");
                    setMediaDlMenuOpen(false);
                  }}
                >
                  À propos
                </button>
              </nav>
            </div>
          </div>

          <div className="window-controls">
            <button
              type="button"
              className="window-btn"
              onMouseDown={stopDragPropagation}
              onClick={() => {
                setActiveSettingsTab("updates");
                setSettingsOpen(true);
              }}
              aria-label="Paramètres"
              title="Paramètres"
            >
              <img src={settingsIcon} alt="" className="window-btn-icon" />
            </button>
            <button
              type="button"
              className="window-btn"
              onMouseDown={stopDragPropagation}
              onClick={() => handleWindowAction("minimize")}
              aria-label="Réduire"
              title="Réduire"
            >
              <img src={windowReduceIcon} alt="" className="window-btn-icon" />
            </button>
            <button
              type="button"
              className="window-btn"
              onMouseDown={stopDragPropagation}
              onClick={() => handleWindowAction("maximize")}
              aria-label={isWindowMaximized ? "Restaurer" : "Agrandir"}
              title={isWindowMaximized ? "Restaurer" : "Agrandir"}
            >
              <img src={windowMaximizeIcon} alt="" className="window-btn-icon" />
            </button>
            <button
              type="button"
              className="window-btn close"
              onMouseDown={stopDragPropagation}
              onClick={() => handleWindowAction("close")}
              aria-label="Fermer"
              title="Fermer"
            >
              <img src={windowCloseIcon} alt="" className="window-btn-icon" />
            </button>
          </div>
        </header>

        <div className="window-content">
          <form
            noValidate
            className={`converter-form ${activeTopTab === "media-dl" ? "converter-form--unified" : ""} ${activeTopTab === "media-player" ? "converter-form--player" : ""}`}
            onSubmit={handleFormSubmit}
          >
            {activeTopTab === "media-dl" ? (
              <>
            <div className="form-field form-field--url">
              <LabelWithTooltip
                label="Lien ou recherche"
                tooltip="Colle un lien direct YouTube / playlist etc... ou tape un titre pour chercher sur YouTube."
              />
              <MediaSearch url={form.url} onUrlChange={(url) => setForm((prev) => ({ ...prev, url }))} />
            </div>

            <div className="form-grid">
              <div className="form-field">
                <LabelWithTooltip label="Format" />
                <CustomSelect
                  value={form.format}
                  options={FORMAT_OPTIONS}
                  ariaLabel="Format"
                  onChange={(next) =>
                    setForm((prev) => ({
                      ...prev,
                      format: next,
                      mode: next === "mp4" ? "video" : "extract_audio",
                      quality:
                        next === "mp4"
                          ? `${MP4_AUDIO_OPTIONS[1]}|${MP4_VIDEO_OPTIONS[3]}`
                          : (QUALITY_OPTIONS_BY_FORMAT[next]?.[0] ?? prev.quality)
                    }))
                  }
                />
              </div>

              <div className="form-field">
                <LabelWithTooltip
                  label="Qualité"
                  tooltip="Les options changent selon le format (ex: MP4 propose des qualités audio en kbps et vidéo en 1080p par exemple)."
                />
                {form.format === "mp4" ? (
                  <Mp4QualitySelect
                    value={form.quality}
                    onChange={(next) => setForm((prev) => ({ ...prev, quality: next }))}
                  />
                ) : (
                  <CustomSelect
                    value={form.quality}
                    options={qualityOptionsForFormat}
                    ariaLabel="Qualité"
                    onChange={(next) => setForm((prev) => ({ ...prev, quality: next }))}
                  />
                )}
              </div>
            </div>

            <button
              type="submit"
              className="run-btn"
              disabled={!canSubmitDownload}
            >
              <span className="run-btn__content">
                <img src={downloadIcon} alt="" className="run-btn__icon" />
                <span>Télécharger</span>
              </span>
            </button>

              </>
            ) : null}

            {activeTopTab === "media-player" ? (
              <MediaLibraryView
                items={libraryItems}
                loading={libraryLoading}
                error={libraryError}
                selectedId={selectedLibraryMedia?.id ?? null}
                playingId={playingLibraryMediaId}
                isPlaying={isAudioPlaying}
                onSelect={setSelectedLibraryMediaId}
                onPlay={playLibraryItem}
                playlists={playlists}
                onCreatePlaylist={createPlaylist}
                onDeletePlaylist={deletePlaylist}
                onAddToPlaylist={addToPlaylist}
                onRemoveFromPlaylist={removeFromPlaylist}
                queueItems={queueList}
                onClearQueue={() => setPlayQueueIds([])}
                onAddFolder={handleAddLibraryFolder}
                recents={recentEntries}
                onPlayNext={playNext}
                onAddToQueue={addToPlayQueue}
                onSaveTags={handleSaveTags}
                onOpenLocation={(path) => openFileLocation(path).catch(() => {})}
                onOpenFiles={handleOpenFiles}
                onOpenFolder={handleOpenFolder}
                onAddFilesToQueue={handleAddFilesToQueue}
                onAddFolderToQueue={handleAddFolderToQueue}
                onAddUrl={handleAddUrl}
                onRenamePlaylist={renamePlaylist}
                onOpenSettings={() => {
                  setActiveSettingsTab("player");
                  setSettingsOpen(true);
                }}
                requestArt={requestArt}
                onNotify={(message) => notify(message, { kind: "success", duration: 4000 })}
                setPanelHost={setPanelHostNode}
                showPanelVideo={isVideoEngineInPanel}
                onToggleFullscreen={() => setVideoDisplayMode("fullscreen")}
                visualizer={
                  visualizerMode === "off"
                    ? null
                    : { getAnalyser: engine.getAnalyser, mode: visualizerMode, isPlaying: isAudioPlaying }
                }
              />
            ) : null}

            {activeTopTab === "about" ? (
              <section className="about-panel" aria-label="À propos de RapidTunes">
                <div className="about-layout">
                <div className="about-col about-col--info">
                <img className="about-logo" src={appLogo} alt="RapidTunes" draggable="false" />
                <h2 className="about-title">RapidTunes</h2>
                <p className="about-version">Version {APP_VERSION}</p>
                <p className="about-credit">Développé par <strong>Ghost Face</strong></p>
                <p className="about-copyright">© {new Date().getFullYear()} Ghost Industry. Tous droits réservés.</p>
                </div>
                <div className="about-col about-col--changelog">
                <div className="changelog" aria-live="polite">
                  <h3 className="changelog__title">Journal des modifications</h3>
                  {changelog.status === "loading" ? <p className="changelog__empty">Chargement...</p> : null}
                  {changelog.status === "error" ? (
                    <p className="changelog__empty">
                      {changelog.message}{" "}
                      <button type="button" className="about-update__btn" onClick={loadChangelog}>Réessayer</button>
                    </p>
                  ) : null}
                  {changelog.status === "ready" && changelog.releases.length === 0 ? (
                    <p className="changelog__empty">Aucune version publiée pour le moment.</p>
                  ) : null}
                  {changelog.releases.map((release) => (
                    <article
                      key={release.version}
                      className={`changelog__release ${openReleases[release.version] ? "" : "changelog__release--closed"}`}
                    >
                      <button
                        type="button"
                        className="changelog__toggle"
                        aria-expanded={Boolean(openReleases[release.version])}
                        onClick={() => setOpenReleases((prev) => ({ ...prev, [release.version]: !prev[release.version] }))}
                      >
                      <header className="changelog__head">
                        <strong>Version {release.version}</strong>
                        {release.prerelease ? <span className="changelog__badge">Pré-version</span> : null}
                        {release.date ? (
                          <time dateTime={release.date}>{new Date(release.date).toLocaleDateString("fr-FR")}</time>
                        ) : null}
                        <span className="settings-collapsible__chevron" aria-hidden="true">
                          <PlayerIcon name="chevron" />
                        </span>
                      </header>
                      </button>
                      {!openReleases[release.version] ? null : release.sections.length === 0 ? (
                        <p className="changelog__empty">Aucune note pour cette version.</p>
                      ) : (
                        release.sections.map((section, index) => (
                          <div key={`${section.title}-${index}`} className="changelog__section">
                            {section.title ? <h4>{section.title}</h4> : null}
                            <ul>
                              {section.items.map((item, itemIndex) => (
                                <li key={itemIndex}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ))
                      )}
                    </article>
                  ))}
                </div>
                </div>
                </div>
              </section>
            ) : null}

            {activeTopTab === "media-dl" ? (
            <>
            <section className={queueCardClassName} aria-live="polite">
                <section className={`queue-section queue-section--current ${hasCurrentQueueContent ? "queue-section--filled" : "queue-section--empty"}`}>
                  <div className="queue-overview-head queue-overview-head--top">
                    <div className="queue-topheader">
                      <div className="queue-topheader-content">
                        <div className="queue-topheader-file">
                          {topHeaderMediaItem ? (
                            <>
                              {showQueueThumbnails && (topHeaderMediaItem.preview?.thumbnail_url ? (
                                <img
                                  src={topHeaderMediaItem.preview.thumbnail_url}
                                  alt={topHeaderMediaItem.preview?.title ?? "Aperçu média"}
                                  className="queue-media-thumb"
                                />
                              ) : (
                                <QueuePlaceholderThumb isPlaylist={Boolean(topHeaderMediaItem.preview?.is_playlist)} />
                              ))}
                              <div className="queue-media-content">
                                <div className="queue-item-title-row">
                                  <p className="queue-item-title">
                                    {formatMediaTitleLine(topHeaderMediaItem.preview, topHeaderMediaItem.form.url)}
                                  </p>
                                  <DurationInline durationText={topHeaderMediaItem.preview?.duration_text} className="duration-inline--queue" />
                                </div>
                                {showQueueMeta && (
                                  <div className="queue-history-meta" role="list" aria-label="Détails du média actif">
                                    <span className="queue-history-chip" role="listitem">{topHeaderMediaItem.form.format.toUpperCase()}</span>
                                    <span className="queue-history-chip" role="listitem">{formatDisplayValue(topHeaderMediaItem.form.quality)}</span>
                                    {currentRateLimitLabel ? (
                                      <span className="queue-history-chip" role="listitem">Limite {currentRateLimitLabel}</span>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              {showQueueThumbnails && (
                                !previewLoading && preview?.thumbnail_url ? (
                                  <img src={preview.thumbnail_url} alt={preview.title} className="queue-media-thumb" />
                                ) : (
                                  <QueuePlaceholderThumb isPlaylist={Boolean(preview?.is_playlist)} />
                                )
                              )}
                              <div className="queue-media-content">
                                <div className="queue-item-title-row">
                                  <p className="queue-item-title">
                                    {previewLoading
                                      ? "Analyse en cours..."
                                      : preview
                                        ? formatMediaTitleLine(preview, form.url)
                                        : previewError || "Aucun téléchargement actif"}
                                  </p>
                                  <DurationInline durationText={!previewLoading && preview ? preview.duration_text : null} className="duration-inline--queue" />
                                </div>
                                {showQueueMeta && (
                                  <div className="queue-history-meta" role="list" aria-label="Détails du média actif">
                                    {!previewLoading && preview ? (
                                      <>
                                        <span className="queue-history-chip" role="listitem">{form.format.toUpperCase()}</span>
                                        <span className="queue-history-chip" role="listitem">
                                          {form.format === "mp4"
                                            ? form.quality.split("|").map((part) => formatDisplayValue(part)).join(" + ")
                                            : formatDisplayValue(form.quality)}
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="queue-history-chip" role="listitem">Format -</span>
                                        <span className="queue-history-chip" role="listitem">Qualité -</span>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>

                        <div className="queue-topheader-meta">
                          <div className="queue-topheader-speed">
                            <div className="queue-topheader-speed__head">
                              <span>Vitesse de téléchargement</span>
                              <strong>
                                {currentQueueItem?.phase === "downloading" && currentDownloadSpeedLabel
                                  ? currentDownloadSpeedLabel
                                  : "-"}
                              </strong>
                            </div>
                            <div className="queue-topheader-speed__graph">
                              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                                {speedGraphArea ? <polygon className="speed-graph__area" points={speedGraphArea} /> : null}
                                {speedGraphLine ? <polyline className="speed-graph__line" points={speedGraphLine} /> : null}
                              </svg>
                            </div>
                          </div>
                          <p className="queue-topheader-meta__status">{currentHeaderStatusText}</p>
                          <div className="queue-topheader-progress">
                            <div className={`queue-topheader-progress__track ${isCurrentIndeterminate ? "indeterminate" : ""}`}>
                              <span style={isCurrentIndeterminate ? undefined : { width: `${currentHeaderProgress}%` }} />
                            </div>
                            <span className="queue-topheader-progress__value">{currentHeaderPercentText}</span>
                            {currentQueueItem ? (
                              <button
                                type="button"
                                className="queue-btn queue-btn-ghost queue-btn-image queue-btn-control"
                                onClick={handleTogglePauseCurrent}
                                disabled={!loading || isPauseActionPending}
                                aria-label={isCurrentPaused ? "Reprendre" : "Mettre en pause"}
                                title={isCurrentPaused ? "Reprendre" : "Mettre en pause"}
                              >
                                <img src={isCurrentPaused ? playIcon : pauseIcon} alt="" className="queue-btn-image__img" />
                              </button>
                            ) : null}
                            {currentQueueItem ? (
                              <button
                                type="button"
                                className="queue-btn queue-btn-ghost queue-btn-image"
                                onClick={handleCancelCurrent}
                                disabled={!loading}
                                aria-label="Annuler le téléchargement"
                                title="Annuler"
                              >
                                <img src={stopIcon} alt="" className="queue-btn-image__img" />
                              </button>
                            ) : null}
                          </div>
                          <p className="queue-topheader-meta__eta">{currentHeaderEtaText}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                </section>

                <div className="queue-secondary-scroll">
                <section className={`queue-section queue-section--waiting ${hasWaitingQueueContent ? "queue-section--filled" : "queue-section--empty"}`}>
                <div className="queue-overview-head queue-overview-head--sub">
                  <div className="queue-head-title-with-badge">
                    <strong>À venir</strong>
                    {hasWaitingQueueContent ? (
                      <span className="queue-count-badge">{waitingQueueItems.length}</span>
                    ) : null}
                  </div>
                  <span className="queue-head-separator" aria-hidden="true" />
                  {waitingQueueItems.length > 0 && (
                    <button
                      type="button"
                      className="queue-btn queue-btn-ghost"
                      onClick={handleClearWaitingQueue}
                      disabled={loading}
                      aria-label="Vider la section À venir"
                      title="Vider la section À venir"
                    >
                      Tout vider
                    </button>
                  )}
                </div>

                <div className="queue-section-body">

                {waitingQueueItems.length > 0 ? (
                  <ul className="queue-list">
                    {waitingQueueItems.map((item, index) => (
                      <li
                        key={item.id}
                        className="queue-item queue-surface queue-item--draggable"
                        draggable
                        title="Glisse pour changer l'ordre"
                        onDragStart={() => {
                          dragQueueIdRef.current = item.id;
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          reorderQueueItems(dragQueueIdRef.current, item.id);
                          dragQueueIdRef.current = null;
                        }}
                        onDragEnd={() => {
                          dragQueueIdRef.current = null;
                        }}
                      >
                        <div className="queue-item-main">
                          <div className="queue-media-top">
                            {showQueueThumbnails && (item.preview?.thumbnail_url ? (
                              <img
                                src={item.preview.thumbnail_url}
                                alt={item.preview?.title ?? "Aperçu média"}
                                className="queue-media-thumb"
                              />
                            ) : (
                              <QueuePlaceholderThumb isPlaylist={Boolean(item.preview?.is_playlist)} />
                            ))}

                            <div className="queue-media-content">
                              <div className="queue-item-title-row">
                                <p className="queue-item-title">{formatMediaTitleLine(item.preview, item.form.url)}</p>
                                <DurationInline durationText={item.preview?.duration_text} className="duration-inline--queue" />
                              </div>
                              {showQueueMeta && (
                                <div className="queue-history-meta" role="list" aria-label="Détails du média en attente">
                                  <span className="queue-history-chip" role="listitem">#{index + 1}</span>
                                  <span className="queue-history-chip" role="listitem">{item.form.format.toUpperCase()}</span>
                                  <span className="queue-history-chip" role="listitem">{formatDisplayValue(item.form.quality)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="queue-item-right">
                          <div className="queue-item-right-top">
                            <span className={`queue-item-status queue-item-status-${queueStatusClass(item.status)}`}>
                              {queueStatusLabel(item.status)}
                            </span>
                            <button
                              type="button"
                              className="queue-btn queue-btn-ghost queue-btn-image"
                              onClick={() => handleRemoveQueuedItem(item.id)}
                              disabled={loading}
                              aria-label="Annuler cet élément"
                              title="Annuler"
                            >
                              <img src={stopIcon} alt="" className="queue-btn-image__img" />
                            </button>
                          </div>
                          <div className="queue-item-actions">
                            <button
                              type="button"
                              className="queue-btn queue-btn-icon"
                              onClick={() => handleMoveQueuedItem(item.id, -1)}
                              disabled={loading || index === 0}
                              aria-label="Monter dans la file"
                              title="Monter"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="queue-btn queue-btn-icon"
                              onClick={() => handleMoveQueuedItem(item.id, 1)}
                              disabled={loading || index === waitingQueueItems.length - 1}
                              aria-label="Descendre dans la file"
                              title="Descendre"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="queue-btn"
                              onClick={() => handleRunQueuedItem(item.id)}
                              disabled={loading}
                            >
                              Lancer
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
                </div>
                </section>

                <section className={`queue-section queue-section--history ${hasHistoryQueueContent ? "queue-section--filled" : "queue-section--empty"}`}>
                <div className="queue-overview-head queue-overview-head--sub">
                  <div className="queue-head-title-with-badge">
                    <strong>Historique</strong>
                    {hasHistoryQueueContent ? (
                      <span className="queue-count-badge">{finishedQueueItems.length}</span>
                    ) : null}
                  </div>
                  <span className="queue-head-separator" aria-hidden="true" />
                  {finishedQueueItems.length > 0 && (
                    <button
                      type="button"
                      className="queue-btn queue-btn-ghost"
                      onClick={handleClearFinishedQueue}
                    >
                      Tout supprimer
                    </button>
                  )}
                </div>

                <div className="queue-section-body">

                {finishedQueueItems.length > 0 ? (
                  <ul className="queue-list queue-list-compact">
                    {finishedQueueItems.map((item) => {
                      const historyDate = formatHistoryDate(
                        item.completedAt,
                        historyDateLocale,
                        settings.use24HourClock
                      );

                      return (
                      <li key={item.id} className={`queue-item queue-surface queue-item-history queue-item-finished queue-item-finished-${queueStatusClass(item.status)}`}>
                        <div className="queue-item-main queue-item-main--history">
                          <div className="queue-history-top">
                            {showQueueThumbnails && (item.preview?.thumbnail_url ? (
                              <img
                                src={item.preview.thumbnail_url}
                                alt={item.preview?.title ?? "Aperçu média"}
                                className="queue-history-thumb"
                              />
                            ) : (
                              <QueuePlaceholderThumb
                                isPlaylist={Boolean(item.preview?.is_playlist)}
                                className="queue-history-thumb queue-history-thumb--placeholder"
                              />
                            ))}

                            <div className="queue-history-content">
                              <div className="queue-history-inline queue-history-inline--stack">
                                <div className="queue-item-title-row">
                                  <p className="queue-item-title queue-item-title--history">
                                    {formatMediaTitleLine(item.preview, item.form.url)}
                                  </p>
                                  <DurationInline durationText={item.preview?.duration_text} className="duration-inline--queue" />
                                </div>

                                {showQueueMeta ? (
                                  <div className="preview-tags queue-history-tags" role="list" aria-label="Détails du média">
                                    <span role="listitem">{item.form.format.toUpperCase()}</span>
                                    <span role="listitem">{formatQualityDisplayValue(item.form.format, item.form.quality)}</span>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="queue-item-right queue-item-right--history">
                          <div className="queue-item-actions queue-item-actions--history">
                            <button
                              type="button"
                              className="queue-btn queue-btn-ghost queue-btn-delete"
                              onClick={() => handleOpenFinishedItemLocation(item)}
                              aria-label="Ouvrir l'emplacement du fichier"
                              title="Ouvrir l'emplacement du fichier"
                            >
                              <img src={folderIcon} alt="" className="queue-btn-delete__img" />
                            </button>
                            <button
                              type="button"
                              className="queue-btn queue-btn-ghost queue-btn-delete"
                              onClick={() => handleRemoveFinishedItem(item.id)}
                              aria-label="Supprimer de l'historique"
                              title="Supprimer"
                            >
                              <img src={deleteIcon} alt="" className="queue-btn-delete__img" />
                            </button>
                          </div>
                        </div>
                        {historyDate ? (
                          <div className="queue-history-footer">
                            <p className="queue-history-date">{historyDate}</p>
                          </div>
                        ) : null}
                      </li>
                      );
                    })}
                  </ul>
                ) : null}
                </div>
                </section>
                </div>
            </section>
            </>
            ) : null}

            {/* Notifications bas écran supprimées à la demande utilisateur */}
          </form>
        </div>

        {activeTopTab === "media-player" ? (
          shouldRenderPlayerBar && !isPlayerFullscreen ? renderPlayerBar(false) : null
        ) : activeTopTab === "media-dl" ? (
          <footer className="dl-statusbar">
            <button
              type="button"
              className="dl-statusbar__add"
              onClick={() => document.querySelector(".url-input")?.focus()}
            >
              <span aria-hidden="true">+</span>
              Ajouter un média
            </button>
            <span className="dl-statusbar__info">
              Téléchargements terminés : {queueItems.filter((item) => item.status === "success").length} sur{" "}
              {queueItems.filter((item) => item.status !== "cancelled").length}
            </span>
            <span className="dl-statusbar__info">{queueDockWaitingCountText}</span>
          </footer>
        ) : null}
      </section>

      <div className="media-engine-hidden" ref={hiddenHostRef} aria-hidden="true" />

      {isMiniPlayer ? (
        <section className="media-mini-player" onMouseDown={handleStartDragging} aria-label="Mini lecteur">
          <div className="media-mini-player__head">
            <strong>{playingLibraryMedia?.title ?? "Lecteur média"}</strong>
            <button
              type="button"
              className="media-player-btn"
              onClick={() => handleWindowAction("close")}
              aria-label="Fermer"
              title="Fermer"
            >
              <PlayerIcon name="close" />
            </button>
          </div>

          {visualizerMode !== "off" && playingLibraryMedia?.type !== "video" ? (
            <div className="media-mini-player__viz">
              <AudioVisualizer
                getAnalyser={engine.getAnalyser}
                mode={visualizerMode}
                isPlaying={isAudioPlaying}
                colorTheme={settings.playerVisualizerColor}
                customColor={settings.playerVisualizerCustomColor}
              />
            </div>
          ) : null}

          <div className="media-mini-player__controls">
            <button type="button" className="media-player-btn" onClick={() => stepLibraryMedia(-1)} aria-label="Précédent" title="Précédent">
              <PlayerIcon name="prev" />
            </button>
            <button
              type="button"
              className="media-player-btn media-player-btn--play"
              onClick={engine.toggle}
              aria-label={isAudioPlaying ? "Mettre en pause" : "Lire"}
              title={isAudioPlaying ? "Pause (Espace)" : "Lecture (Espace)"}
            >
              <PlayerIcon name={isAudioPlaying ? "pause" : "play"} />
            </button>
            <button type="button" className="media-player-btn" onClick={() => stepLibraryMedia(1)} aria-label="Suivant" title="Suivant">
              <PlayerIcon name="next" />
            </button>
          </div>

          <div className="media-mini-player__foot">
            <div className="media-player-bar__track">
              <span style={{ width: `${audioPlayerProgress}%` }} />
            </div>
            {renderMoreMenu()}
            <button
              type="button"
              className="media-player-btn"
              onClick={toggleMiniPlayer}
              aria-label="Quitter le mini lecteur (Ctrl+M)"
              title="Quitter le mini lecteur (Ctrl+M)"
            >
              <PlayerIcon name="maximize" />
            </button>
          </div>
        </section>
      ) : null}

      {isPlayerFullscreen ? (
        <section className="media-fs-player" role="dialog" aria-label="Lecteur plein écran">
          <div className={`media-fs-player__stage media-fs-player__stage--${playingLibraryMedia.type}`}>
            {playingLibraryMedia.type === "video" ? (
              <div
                className="media-engine-host media-engine-host--fullscreen"
                ref={fullscreenHostRef}
                onDoubleClick={() => setVideoDisplayMode("windowed")}
              />
            ) : (
              <>
                {visualizerMode !== "off" ? (
                  <div className="media-fs-player__viz">
                    <AudioVisualizer
                      getAnalyser={engine.getAnalyser}
                      mode={visualizerMode}
                      isPlaying={isAudioPlaying}
                      colorTheme={settings.playerVisualizerColor}
                      customColor={settings.playerVisualizerCustomColor}
                    />
                  </div>
                ) : null}
              <div className="media-fs-player__art" aria-hidden="true">
                {playingLibraryMedia.thumbnailUrl ? (
                  <img src={playingLibraryMedia.thumbnailUrl} alt="" />
                ) : (
                  <img src={musicAlbumIcon} alt="" />
                )}
              </div>
              </>
            )}
          </div>
          {renderPlayerBar(true)}
        </section>
      ) : null}

      {isEqOpen ? (
        <div className="player-modal-backdrop" onClick={() => setIsEqOpen(false)}>
          <section
            className="player-modal player-modal--eq"
            role="dialog"
            aria-modal="true"
            aria-label="Égaliseur"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="player-modal__body">
              <header className="player-modal__head">
                <h3>Égaliseur</h3>
                <label className="player-modal__switch">
                  <span>{isEqEnabled ? "Activé" : "Désactivé"}</span>
                  <span className="settings-switch">
                    <input
                      type="checkbox"
                      checked={isEqEnabled}
                      onChange={(event) => setIsEqEnabled(event.target.checked)}
                    />
                    <span className="settings-switch-track">
                      <span className="settings-switch-thumb" />
                    </span>
                  </span>
                </label>
              </header>

              <label className="player-modal__preset">
                <span>Prédéfini</span>
                <CustomSelect
                  value={eqPresetId}
                  ariaLabel="Prédéfini"
                  options={[
                    ...EQ_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })),
                    ...(eqPresetId === "custom" ? [{ value: "custom", label: "Personnalisé" }] : [])
                  ]}
                  onChange={applyEqPreset}
                  disabled={!isEqEnabled}
                />
              </label>

              <div className={`eq-panel ${isEqEnabled ? "" : "eq-panel--disabled"}`}>
                <div className="eq-scale" aria-hidden="true">
                  <span>+12 dB</span>
                  <span>+6 dB</span>
                  <span>0 dB</span>
                  <span>-6 dB</span>
                  <span>-12 dB</span>
                </div>
                {EQ_BANDS.map((band, index) => (
                  <div key={band} className="eq-band">
                    <input
                      type="range"
                      className="eq-slider"
                      min={-EQ_RANGE_DB}
                      max={EQ_RANGE_DB}
                      step={1}
                      value={eqGains[index]}
                      disabled={!isEqEnabled}
                      onChange={(event) => changeEqGain(index, Number(event.target.value))}
                      aria-label={`${band} (${eqGains[index]} dB)`}
                    />
                    <span>{band}</span>
                  </div>
                ))}
              </div>

              <label className="player-modal__check">
                <input
                  type="checkbox"
                  checked={isEqLinked}
                  onChange={(event) => setIsEqLinked(event.target.checked)}
                  disabled={!isEqEnabled}
                />
                <span>Déplacer les curseurs à proximité ensemble</span>
              </label>
            </div>
            <footer className="player-modal__foot">
              <button type="button" className="player-modal__btn" onClick={() => setIsEqOpen(false)}>
                Fermer
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {isPropertiesOpen && playingLibraryMedia ? (
        <div className="player-modal-backdrop" onClick={() => setIsPropertiesOpen(false)}>
          <section
            className="player-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Propriétés"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="player-modal__body">
              <header className="player-modal__head">
                <h3>Propriétés</h3>
              </header>
              <dl className="about-list">
                <div className="about-row"><dt>Titre</dt><dd>{playingLibraryMedia.title}</dd></div>
                {playingLibraryMedia.type === "video" && playingLibraryMedia.artist === "Artiste inconnu" ? null : (
                  <div className="about-row"><dt>Artiste</dt><dd>{playingLibraryMedia.artist}</dd></div>
                )}
                {playingLibraryMedia.type === "video" && playingLibraryMedia.album === "Album inconnu" ? null : (
                  <div className="about-row"><dt>Album</dt><dd>{playingLibraryMedia.album}</dd></div>
                )}
                <div className="about-row"><dt>Type</dt><dd>{playingLibraryMedia.type === "video" ? "Vidéo" : "Musique"}</dd></div>
                <div className="about-row"><dt>Format</dt><dd>{playingLibraryMedia.extension.toUpperCase()}</dd></div>
                <div className="about-row"><dt>Durée</dt><dd>{audioPlayerDuration}</dd></div>
                {playingLibraryMedia.bitrateKbps ? (
                  <div className="about-row"><dt>Débit</dt><dd>{playingLibraryMedia.bitrateKbps} kb/s</dd></div>
                ) : null}
                <div className="about-row"><dt>Taille</dt><dd>{formatBytes(playingLibraryMedia.sizeBytes)}</dd></div>
                <div className="about-row">
                  <dt>Modifié le</dt>
                  <dd>{new Date(playingLibraryMedia.modifiedSecs * 1000).toLocaleString("fr-FR")}</dd>
                </div>
                <div className="about-row"><dt>Chemin</dt><dd className="about-row__path">{playingLibraryMedia.path}</dd></div>
              </dl>
            </div>
            <footer className="player-modal__foot">
              <button type="button" className="player-modal__btn" onClick={() => setIsPropertiesOpen(false)}>
                Fermer
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {errorRetryModal && (
        <div className="error-modal-backdrop" onClick={() => resolveRetryModal(false)}>
          <section
            className="error-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Avertissement d'erreur"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Avertissement</h3>
            <p>{errorRetryModal.message}</p>
            <div className="error-modal-actions">
              <button
                type="button"
                className="queue-btn"
                onClick={() => resolveRetryModal(true)}
              >
                Réessayer
              </button>
              <button
                type="button"
                className="queue-btn queue-btn-ghost"
                onClick={() => resolveRetryModal(false)}
              >
                Annuler
              </button>
            </div>
          </section>
        </div>
      )}

      {globalErrorModal && (
        <div className="error-modal-backdrop" onClick={() => setGlobalErrorModal(null)}>
          <section
            className="error-modal error-modal--global"
            role="dialog"
            aria-modal="true"
            aria-label="Erreur globale"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>{globalErrorModal.title}</h3>
            <p>{globalErrorModal.message}</p>
            <pre className="error-modal-details">{globalErrorModal.details}</pre>
            <div className="error-modal-actions">
              <button type="button" className="queue-btn" onClick={handleCopyGlobalError}>
                Copier
              </button>
              <button type="button" className="queue-btn" onClick={() => window.location.reload()}>
                Recharger
              </button>
              <button type="button" className="queue-btn queue-btn-ghost" onClick={() => setGlobalErrorModal(null)}>
                Fermer
              </button>
            </div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="settings-modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <section className="settings-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header className="settings-modal-header">
              <div className="settings-modal-title">
                <h2>{settingsPanelTitle}</h2>
                <p>{settingsPanelDescription}</p>
              </div>
              <button
                type="button"
                className="settings-close-btn"
                onClick={() => setSettingsOpen(false)}
                aria-label="Fermer les paramètres"
                title="Fermer les paramètres"
              >
                <img src={windowCloseIcon} alt="" className="window-btn-icon" />
              </button>
            </header>

            <nav className="settings-tabs" role="tablist" aria-label="Onglets paramètres">
              {SETTINGS_MENU.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={activeSettingsTab === entry.id}
                  className={`settings-tab ${activeSettingsTab === entry.id ? "active" : ""}`}
                  onClick={() => setActiveSettingsTab(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </nav>

            <div className="settings-panel">
              {activeSettingsTab === "behaviors" ? (
                <div className="settings-stack">
                  <section className="settings-block">
                    <div className="settings-toggle-row settings-toggle-row--head">
                      <div className="settings-toggle-text">
                        <strong>Bouton « Réduire »</strong>
                        <small>Active une action personnalisée quand tu cliques sur Réduire.</small>
                      </div>
                      <span className="settings-switch">
                        <input
                          type="checkbox"
                          checked={settings.customMinimizeActionEnabled}
                          onChange={(event) => updateSetting("customMinimizeActionEnabled", event.target.checked)}
                        />
                        <span className="settings-switch-track">
                          <span className="settings-switch-thumb" />
                        </span>
                      </span>
                    </div>
                    <div className="settings-radio-group" role="radiogroup" aria-label="Action Réduire">
                      <label className="settings-radio-option">
                        <input
                          type="radio"
                          name="minimize-action"
                          value="taskbar"
                          checked={settings.minimizeActionTarget === "taskbar"}
                          onChange={(event) => updateSetting("minimizeActionTarget", event.target.value)}
                          disabled={!settings.customMinimizeActionEnabled}
                        />
                        <span>Réduire dans la barre des tâches</span>
                      </label>
                      <label className="settings-radio-option">
                        <input
                          type="radio"
                          name="minimize-action"
                          value="tray"
                          checked={settings.minimizeActionTarget === "tray"}
                          onChange={(event) => updateSetting("minimizeActionTarget", event.target.value)}
                          disabled={!settings.customMinimizeActionEnabled}
                        />
                        <span>Arrière-plan dans les icônes cachées de la barre des tâches</span>
                      </label>
                    </div>
                  </section>

                  <section className="settings-block">
                    <div className="settings-toggle-row settings-toggle-row--head">
                      <div className="settings-toggle-text">
                        <strong>Bouton « Fermer »</strong>
                        <small>Active une action personnalisée quand tu cliques sur Fermer.</small>
                      </div>
                      <span className="settings-switch">
                        <input
                          type="checkbox"
                          checked={settings.customCloseActionEnabled}
                          onChange={(event) => updateSetting("customCloseActionEnabled", event.target.checked)}
                        />
                        <span className="settings-switch-track">
                          <span className="settings-switch-thumb" />
                        </span>
                      </span>
                    </div>
                    <div className="settings-radio-group" role="radiogroup" aria-label="Action Fermer">
                      <label className="settings-radio-option">
                        <input
                          type="radio"
                          name="close-action"
                          value="exit"
                          checked={settings.closeActionTarget === "exit"}
                          onChange={(event) => updateSetting("closeActionTarget", event.target.value)}
                          disabled={!settings.customCloseActionEnabled}
                        />
                        <span>Fermer l'application</span>
                      </label>
                      <label className="settings-radio-option">
                        <input
                          type="radio"
                          name="close-action"
                          value="tray"
                          checked={settings.closeActionTarget === "tray"}
                          onChange={(event) => updateSetting("closeActionTarget", event.target.value)}
                          disabled={!settings.customCloseActionEnabled}
                        />
                        <span>Arrière-plan dans les icônes cachées de la barre des tâches</span>
                      </label>
                    </div>
                  </section>

                  <section className="settings-block">
                    <div className="settings-toggle-row settings-toggle-row--head">
                      <div className="settings-toggle-text">
                        <strong>Sauvegarder la taille de la fenêtre</strong>
                        <small>Conserve la taille actuelle pour les prochains lancements.</small>
                      </div>
                      <span className="settings-switch">
                        <input
                          type="checkbox"
                          checked={settings.saveWindowSize}
                          onChange={(event) => updateSetting("saveWindowSize", event.target.checked)}
                        />
                        <span className="settings-switch-track">
                          <span className="settings-switch-thumb" />
                        </span>
                      </span>
                    </div>
                  </section>
                </div>
              ) : activeSettingsTab === "appearance" ? (
                <div className="settings-stack">
                  <CollapsibleBlock
                    collapsible={false}
                    head={
                      <>
                      <h3>Thèmes</h3>
                      <p>Choisis le thème de l'application (fond dégradé et couleurs accordées).</p>
                      </>
                    }
                  >
                    <div className="theme-gradient-grid">
                      {THEME_OPTIONS.map((theme) => {
                        const active = resolvedTheme.theme.id === theme.id;
                        return (
                          <button
                            key={theme.id}
                            type="button"
                            className={`theme-gradient-btn ${active ? "active" : ""}`}
                            onClick={() => updateSetting("appearanceTheme", theme.id)}
                            aria-pressed={active}
                          >
                            <span className="theme-gradient-btn__preview" style={{ background: theme.gradient }} />
                            <span className="theme-gradient-btn__name">{theme.name}</span>
                          </button>
                        );
                      })}
                    </div>
                                    </CollapsibleBlock>
                </div>
              ) : activeSettingsTab === "player" ? (
                <div className="settings-stack">
                  {[
                    { kind: "music", title: "Dossiers de la bibliothèque musicale", empty: "Aucun dossier de musique." },
                    { kind: "video", title: "Dossiers de la bibliothèque vidéo", empty: "Aucun dossier de vidéos." }
                  ].map((group) => (
                    <section
                      className={`settings-block settings-collapsible ${collapsedLibraryCards[group.kind] ? "settings-collapsible--closed" : ""}`}
                      key={group.kind}
                    >
                      <button
                        type="button"
                        className="settings-collapsible__head settings-card-head"
                        aria-expanded={!collapsedLibraryCards[group.kind]}
                        onClick={() =>
                          setCollapsedLibraryCards((prev) => ({ ...prev, [group.kind]: !prev[group.kind] }))
                        }
                      >
                        <span>
                          <h3>{group.title}</h3>
                          <p>Utilise « Actualiser » après avoir ajouté ou retiré des fichiers dans ces dossiers.</p>
                        </span>
                        <span className="settings-collapsible__chevron">
                          <PlayerIcon name="chevron" />
                        </span>
                      </button>
                      {collapsedLibraryCards[group.kind] ? null : (
                      <>
                      <div className="settings-folder-list">
                        {(libraryFolders?.[group.kind] ?? []).length === 0 ? (
                          <p className="settings-folder-empty">{group.empty}</p>
                        ) : (
                          libraryFolders[group.kind].map((folder) => (
                            <div key={folder} className="settings-folder-item">
                              <span title={folder}>{folder}</span>
                              <button
                                type="button"
                                className="settings-browse-btn"
                                onClick={() => handleRemoveLibraryFolder(group.kind, folder)}
                              >
                                Retirer
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="settings-actions-row">
                        <button
                          type="button"
                          className="settings-browse-btn"
                          onClick={() => handleAddLibraryFolder(group.kind)}
                        >
                          Ajouter un dossier
                        </button>
                        <button
                          type="button"
                          className="settings-browse-btn"
                          onClick={() => refreshLibrary()}
                          disabled={libraryLoading}
                        >
                          {libraryLoading ? "Analyse en cours..." : "Actualiser"}
                        </button>
                        <small className="settings-folder-count">
                          {group.kind === "music"
                            ? `${mediaLibraryStats.audios} musique(s)`
                            : `${mediaLibraryStats.videos} vidéo(s)`}
                        </small>
                      </div>
                      {group.kind === "video" && libraryError ? (
                        <p className="preview-error">{libraryError}</p>
                      ) : null}
                      </>
                      )}
                    </section>
                  ))}

                  {renderSettingToggle(
                    "libraryIncludeSubfolders",
                    "Inclure les sous-dossiers",
                    "Analyse aussi les dossiers contenus dans chaque emplacement."
                  )}
                  {renderSettingToggle(
                    "playerAutoplayNext",
                    "Lire automatiquement le média suivant",
                    "Passe au média suivant de la liste à la fin de la lecture."
                  )}
                  {renderSettingToggle(
                    "playerMiniAlwaysOnTop",
                    "Mini lecteur toujours au premier plan",
                    "Garde le mini lecteur au-dessus des autres fenêtres."
                  )}
                  {renderSettingToggle(
                    "playerShowCovers",
                    "Afficher les pochettes et miniatures",
                    "Charge la pochette intégrée des musiques et une image des vidéos."
                  )}
                  {renderSettingToggle(
                    "playerRememberRecent",
                    "Mémoriser les médias récents",
                    "Affiche sur l'accueil les vidéos regardées, musiques écoutées, albums et artistes."
                  )}
                  <section className="settings-block">
                    <div className="settings-actions-row">
                      <button
                        type="button"
                        className="settings-browse-btn"
                        onClick={() => setRecentEntries([])}
                        disabled={recentEntries.length === 0}
                      >
                        Effacer les médias récents
                      </button>
                    </div>
                  </section>
                </div>
              ) : activeSettingsTab === "language" ? (
                <div className="settings-stack">
                  <section className="settings-block">
                    <label className="settings-field">
                      <span>Langue / locale</span>
                      <CustomSelect
                        value={historyDateLocale}
                        ariaLabel="Langue / locale"
                        options={LANGUAGE_OPTIONS.map((entry) => ({ value: entry.value, label: entry.label }))}
                        onChange={(next) => updateSetting("languageLocale", next)}
                      />
                    </label>
                  </section>

                  <section className="settings-block">
                    <div className="settings-toggle-row settings-toggle-row--head">
                      <div className="settings-toggle-text">
                        <strong>Format 24 heures</strong>
                        <small>Appliqué aux dates de l'historique.</small>
                      </div>
                      <span className="settings-switch">
                        <input
                          type="checkbox"
                          checked={settings.use24HourClock}
                          onChange={(event) => updateSetting("use24HourClock", event.target.checked)}
                        />
                        <span className="settings-switch-track">
                          <span className="settings-switch-thumb" />
                        </span>
                      </span>
                    </div>
                  </section>
                </div>
              ) : activeSettingsTab === "download" ? (
                <div className="settings-stack">
                  <CollapsibleBlock
                    head={
                      <>
                      <h3>Dossiers de téléchargement</h3>
                      <p>
                        Si vide, le dossier sera demandé à chaque téléchargement.
                      </p>
                      </>
                    }
                  >

                    <label className="settings-field">
                      <span>Dossier musique</span>
                      <div className="settings-path-row">
                        <input
                          type="text"
                          value={settings.defaultOutputDir}
                          onChange={(event) => updateSetting("defaultOutputDir", event.target.value)}
                          placeholder="C:/Users/Vous/Downloads"
                        />
                        <button
                          type="button"
                          className="settings-browse-btn"
                          onClick={handleBrowseDefaultOutputDir}
                        >
                          Parcourir
                        </button>
                      </div>
                    </label>

                    <label className="settings-field">
                      <span>Dossier vidéo</span>
                      <div className="settings-path-row">
                        <input
                          type="text"
                          value={settings.defaultVideoOutputDir}
                          onChange={(event) => updateSetting("defaultVideoOutputDir", event.target.value)}
                          placeholder="C:/Users/Vous/Videos"
                        />
                        <button
                          type="button"
                          className="settings-browse-btn"
                          onClick={handleBrowseDefaultVideoDir}
                        >
                          Parcourir
                        </button>
                      </div>
                    </label>
                                    </CollapsibleBlock>

                  <CollapsibleBlock
                    head={
                      <>
                      <h3>Format et qualité</h3>
                      <p>Utilisés par défaut pour les nouveaux téléchargements.</p>
                      </>
                    }
                  >

                    <div className="form-grid">
                      <label className="settings-field">
                        <span>Format par défaut</span>
                        <CustomSelect
                          value={settings.defaultFormat}
                          ariaLabel="Format par défaut"
                          options={FORMAT_OPTIONS.map((option) => ({ value: option, label: option.toUpperCase() }))}
                          onChange={(nextFormat) =>
                            setSettings((prev) => ({
                              ...prev,
                              defaultFormat: nextFormat,
                              defaultQuality: normalizeQualityForFormat(nextFormat, prev.defaultQuality)
                            }))
                          }
                        />
                      </label>

                      <label className="settings-field">
                        <span>Qualité par défaut</span>
                        <CustomSelect
                          value={normalizeQualityForFormat(settings.defaultFormat, settings.defaultQuality)}
                          ariaLabel="Qualité par défaut"
                          options={settingsQualityOptions.map((option) => ({
                            value: option,
                            label: formatQualityDisplayValue(settings.defaultFormat, option)
                          }))}
                          onChange={(next) => updateSetting("defaultQuality", next)}
                        />
                      </label>
                    </div>

                    <div className="settings-actions-row">
                      <button type="button" className="settings-browse-btn" onClick={applyFormDefaultsFromSettings}>
                        Appliquer maintenant
                      </button>
                      <button type="button" className="settings-secondary-btn" onClick={resetSettingsToDefault}>
                        Réinitialiser
                      </button>
                    </div>
                                    </CollapsibleBlock>

                  <section className="settings-block">
                    <div className="settings-toggle-row settings-toggle-row--head">
                      <div className="settings-toggle-text">
                        <strong>Limiter la vitesse de téléchargement</strong>
                        <small>Définit la limite en kilooctets par seconde.</small>
                      </div>
                      <span className="settings-switch">
                        <input
                          type="checkbox"
                          checked={settings.limitDownloadSpeedEnabled}
                          onChange={(event) => updateSetting("limitDownloadSpeedEnabled", event.target.checked)}
                        />
                        <span className="settings-switch-track">
                          <span className="settings-switch-thumb" />
                        </span>
                      </span>
                    </div>

                    <label className="settings-field settings-field-inline" style={{ marginTop: 12 }}>
                      <span>Débit maximal</span>
                      <div className="settings-input-with-unit">
                        <input
                          type="number"
                          min="0"
                          value={settings.downloadSpeedKbps}
                          onChange={(event) => updateSetting("downloadSpeedKbps", event.target.value)}
                          disabled={!settings.limitDownloadSpeedEnabled}
                        />
                        <em>ko/s</em>
                      </div>
                    </label>
                  </section>


                </div>
              ) : activeSettingsTab === "updates" ? (
                <div className="settings-stack">
                  <CollapsibleBlock
                    collapsible={false}
                    head={
                      <>
                      <h3>Version installée : {APP_VERSION}</h3>
                      </>
                    }
                  >
                    {renderUpdatePanel()}
                                    </CollapsibleBlock>

                  <section className="settings-block">
                    <div className="settings-toggle-row settings-toggle-row--head">
                      <div className="settings-toggle-text">
                        <strong>Vérifier les mises à jour au démarrage</strong>
                        <small>Affiche une vérification automatique au lancement.</small>
                      </div>
                      <span className="settings-switch">
                        <input
                          type="checkbox"
                          checked={settings.checkUpdatesOnStartup}
                          onChange={(event) => updateSetting("checkUpdatesOnStartup", event.target.checked)}
                        />
                        <span className="settings-switch-track">
                          <span className="settings-switch-thumb" />
                        </span>
                      </span>
                    </div>
                  </section>

                  <section className="settings-block">
                    <div className="settings-toggle-row settings-toggle-row--head">
                      <div className="settings-toggle-text">
                        <strong>Mises à jour automatiques de l'application</strong>
                        <small>Télécharge automatiquement les nouvelles versions ; l'installation reste à valider.</small>
                      </div>
                      <span className="settings-switch">
                        <input
                          type="checkbox"
                          checked={settings.autoUpdate}
                          onChange={(event) => updateSetting("autoUpdate", event.target.checked)}
                        />
                        <span className="settings-switch-track">
                          <span className="settings-switch-thumb" />
                        </span>
                      </span>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="settings-placeholder">
                  <h3>{SETTINGS_MENU.find((entry) => entry.id === activeSettingsTab)?.label ?? "Section"}</h3>
                  <p>Cette section sera configurée dans la prochaine itération. Le style est déjà aligné sur le design.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
      <ToastLayer toasts={toasts} onDismiss={dismissToast} />
      <TooltipLayer />
    </main>
  );
}
