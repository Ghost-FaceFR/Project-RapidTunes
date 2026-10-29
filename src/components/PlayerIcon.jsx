import shuffleIcon from "../assets/images/components/shuffle.png";
import skipToStartIcon from "../assets/images/components/skip_to_start.png";
import endIcon from "../assets/images/components/end.png";
import repeatIcon from "../assets/images/components/repeat.png";
import repeatOneIcon from "../assets/images/components/repeat_one.png";
import noRepeatIcon from "../assets/images/components/no_repeat.png";
import playIcon from "../assets/images/components/play.png";
import pauseIcon from "../assets/images/components/pause.png";
import fastForwardIcon from "../assets/images/components/fast_forward.png";
import noVolumeIcon from "../assets/images/components/no_volume.png";
import lowVolumeIcon from "../assets/images/components/low_volume.png";
import mediumVolumeIcon from "../assets/images/components/medium_volume.png";
import heightVolumeIcon from "../assets/images/components/height_volume.png";
import musicIcon from "../assets/images/components/music.png";
import folderIcon from "../assets/images/components/folder.png";
import settingsIcon from "../assets/images/components/setting.png";
import deleteIcon from "../assets/images/components/delete.png";
import addIcon from "../assets/images/components/add.png";

// Icônes du projet (PNG): affichées en blanc pour rester lisibles sur tous les thèmes.
const IMAGE_ICONS = {
  shuffle: { src: shuffleIcon },
  prev: { src: skipToStartIcon },
  next: { src: endIcon },
  repeat: { src: repeatIcon },
  "repeat-one": { src: repeatOneIcon },
  "repeat-off": { src: noRepeatIcon },
  play: { src: playIcon },
  pause: { src: pauseIcon },
  forward30: { src: fastForwardIcon },
  back10: { src: fastForwardIcon, flipped: true },
  "volume-0": { src: noVolumeIcon },
  "volume-1": { src: lowVolumeIcon },
  "volume-2": { src: mediumVolumeIcon },
  "volume-3": { src: heightVolumeIcon },
  music: { src: musicIcon },
  folder: { src: folderIcon },
  settings: { src: settingsIcon },
  trash: { src: deleteIcon },
  plus: { src: addIcon }
};

export default function PlayerIcon({ name }) {
  const image = IMAGE_ICONS[name];
  if (image) {
    return (
      <img
        src={image.src}
        alt=""
        aria-hidden="true"
        className={`player-icon-img ${image.flipped ? "player-icon-img--flipped" : ""}`}
      />
    );
  }

  const props = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true
  };

  switch (name) {
    case "play-next":
      return <svg {...props}><path d="M4 4l10 7-10 7zM19 8v8M15 12h8" /></svg>;
    case "edit":
      return <svg {...props}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
    case "album":
      return <svg {...props}><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /></svg>;
    case "select":
      return <svg {...props}><path d="M3 6h4M3 12h4M3 18h4M10 6h11M10 12h11M10 18h11" /></svg>;
    case "person":
      return <svg {...props}><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0v1H5z" /></svg>;
    case "home":
      return <svg {...props}><path d="M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10" /></svg>;
    case "library-video":
      return <svg {...props}><path d="M4 4h16v16H4zM4 9h16M9 4v5M15 4v5M10 13l5 3-5 3z" /></svg>;
    case "queue":
      return <svg {...props}><path d="M3 6h13M3 12h13M3 18h8M18 14l4 3-4 3z" /></svg>;
    case "playlist":
      return <svg {...props}><path d="M3 6h13M3 12h13M3 18h7M19 14v6M16 17h6" /></svg>;
    case "search":
      return <svg {...props}><path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" /></svg>;
    case "more":
      return (
        <svg {...props} fill="currentColor" stroke="none">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      );
    case "info":
      return <svg {...props}><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01" /></svg>;
    case "equalizer":
      return <svg {...props}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>;
    case "speed":
      return <svg {...props}><path d="M12 14l4-4M3.34 19a10 10 0 1 1 17.32 0" /></svg>;
    case "cast":
      return <svg {...props}><path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6M2 12a9 9 0 0 1 8 8M2 16a5 5 0 0 1 4 4M2 20h.01" /></svg>;
    case "video":
      return <svg {...props}><path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" /></svg>;
    case "chevron":
      return <svg {...props}><path d="m9 18 6-6-6-6" /></svg>;
    case "check":
      return <svg {...props}><path d="M20 6 9 17l-5-5" /></svg>;
    case "mini":
      return <svg {...props}><path d="M3 5h18v14H3zM12 12h6v5h-6z" /></svg>;
    case "close":
      return <svg {...props}><path d="M6 6l12 12M18 6 6 18" /></svg>;
    case "minimize":
      return <svg {...props}><path d="M9 3v4a2 2 0 0 1-2 2H3M21 9h-4a2 2 0 0 1-2-2V3M3 15h4a2 2 0 0 1 2 2v4M15 21v-4a2 2 0 0 1 2-2h4" /></svg>;
    default:
      return <svg {...props}><path d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4" /></svg>;
  }
}
