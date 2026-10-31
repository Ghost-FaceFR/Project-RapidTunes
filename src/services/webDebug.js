// Mode debug (web): dans un navigateur il n'y a ni fenêtre Tauri ni backend Rust.
// On simule ici les commandes pour que toute l'interface reste utilisable (données de démonstration).
const DEMO_DIR = "C:\\Utilisateurs\\Demo\\Musique";
const DEMO_TRACKS = [
  { title: "Aurore", artist: "Démo Band", album: "Premier jour", genre: "Electro", base: 220 },
  { title: "Brume", artist: "Démo Band", album: "Premier jour", genre: "Electro", base: 262 },
  { title: "Crépuscule", artist: "Les Exemples", album: "Maquettes", genre: "Ambient", base: 330 },
  { title: "Dérive", artist: "Les Exemples", album: "Maquettes", genre: "Ambient", base: 196 },
  { title: "Écho", artist: "Test Sonore", album: "Sans titre", genre: "Pop", base: 294 }
];

const wavUrls = new Map();

export const isWebDebug = () => typeof window !== "undefined" && window.__RAPIDTUNES_WEB_DEBUG__ === true;

function demoItems() {
  return DEMO_TRACKS.map((track, index) => ({
    id: `demo-${index}`,
    path: `demo://${index}`,
    kind: "audio",
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationSeconds: 12,
    sizeBytes: 530000,
    extension: "wav",
    modifiedSecs: 1761900000 + index * 3600,
    bitrateKbps: 352,
    genre: track.genre,
    year: 2026,
    track: index + 1,
    albumArtist: track.artist
  }));
}

function coverFor(path) {
  const hue = (Number(String(path).replace(/\D/g, "")) * 67 + 250) % 360;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},60%,45%)"/>` +
    `<stop offset="1" stop-color="hsl(${(hue + 60) % 360},60%,22%)"/></linearGradient></defs>` +
    `<rect width="300" height="300" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/** URL lisible par le lecteur: un son de démonstration généré pour les pistes `demo://`. */
export function demoMediaUrl(path) {
  if (wavUrls.has(path)) return wavUrls.get(path);
  const index = Number(String(path).replace(/\D/g, "")) || 0;
  const base = DEMO_TRACKS[index % DEMO_TRACKS.length].base;
  const rate = 22050;
  const seconds = 12;
  const samples = rate * seconds;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  write(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples * 2, true);
  const ratios = [1, 1.25, 1.5, 1.25];
  for (let i = 0; i < samples; i += 1) {
    const t = i / rate;
    const freq = base * ratios[Math.floor(t * 2) % ratios.length];
    const envelope = 0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * t);
    const value = Math.sin(2 * Math.PI * freq * t) * 0.25 * (0.4 + 0.6 * envelope);
    view.setInt16(44 + i * 2, value * 32767, true);
  }
  const url = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
  wavUrls.set(path, url);
  return url;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function installWebDebug() {
  if (typeof window === "undefined" || window.__TAURI_INTERNALS__) return;
  window.__RAPIDTUNES_WEB_DEBUG__ = true;

  const { mockIPC, mockWindows } = await import("@tauri-apps/api/mocks");
  const { emit } = await import("@tauri-apps/api/event");

  mockWindows("main");

  let paused = false;
  let cancelled = false;

  mockIPC(
    async (cmd, args = {}) => {
      switch (cmd) {
        case "download_and_convert": {
          cancelled = false;
          for (let percent = 0; percent <= 100; percent += 10) {
            while (paused && !cancelled) await sleep(200);
            if (cancelled) return { success: false, message: "Téléchargement annulé (simulation).", output_path: null };
            await emit("download-progress", {
              phase: percent < 100 ? "download" : "convert",
              percent,
              message: percent < 100 ? "Téléchargement simulé..." : "Conversion simulée...",
              download_speed_kibps: 2048,
              download_speed_text: "2.0 MiB/s",
              rate_limit_kibps: null
            });
            await sleep(250);
          }
          return {
            success: true,
            message: "Téléchargement simulé (mode debug web).",
            output_path: `${DEMO_DIR}\\simulation.${args.request?.format ?? "mp3"}`
          };
        }
        case "download_batch":
          return (args.batch?.jobs ?? []).map(() => ({ success: true, message: "Simulation", output_path: null }));
        case "cancel_download":
          cancelled = true;
          paused = false;
          return undefined;
        case "pause_download":
          paused = true;
          return undefined;
        case "resume_download":
          paused = false;
          return undefined;
        case "preview_media":
          return {
            url: args.url,
            title: "Vidéo de démonstration",
            thumbnail_url: coverFor("1"),
            duration_seconds: 215,
            duration_text: "3:35",
            uploader: "Chaîne démo",
            channel: "Chaîne démo",
            upload_date: "20261031",
            view_count: 1234567,
            like_count: 4321,
            is_playlist: false,
            item_count: null,
            description: "Aperçu simulé: le mode debug web n'a pas accès à yt-dlp."
          };
        case "search_media":
          return [1, 2, 3, 4].map((n) => ({
            videoId: `demo${n}`,
            url: `https://www.youtube.com/watch?v=demo${n}`,
            title: `Résultat de démonstration ${n} pour « ${args.query} »`,
            channel: "Chaîne démo",
            durationSeconds: 120 + n * 30,
            durationText: `${2 + n}:00`,
            viewCount: n * 100000,
            thumbnailUrl: coverFor(String(n)),
            isLive: false
          }));
        case "get_default_download_dir":
        case "get_default_video_dir":
        case "pick_output_directory":
          return DEMO_DIR;
        case "open_file_location":
        case "update_media_tags":
        case "launch_update":
          return undefined;
        case "scan_library":
          return args.kind === "video" ? [] : demoItems();
        case "pick_media_files":
          return demoItems().slice(0, 2);
        case "get_media_cover":
          return coverFor(args.path);
        case "get_video_thumbnail":
          return null;
        case "missing_tools":
          return [];
        case "prepare_tools":
          return false;
        case "download_update":
          throw "Mise à jour indisponible en mode debug web.";
        case "plugin:window|is_maximized":
        case "plugin:window|is_fullscreen":
        case "plugin:window|is_minimized":
          return false;
        case "plugin:window|scale_factor":
          return 1;
        case "plugin:window|inner_size":
        case "plugin:window|outer_size":
          return { width: window.innerWidth, height: window.innerHeight };
        default:
          return undefined;
      }
    },
    { shouldMockEvents: true }
  );
}
