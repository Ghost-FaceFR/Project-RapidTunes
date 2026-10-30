import { useEffect, useMemo, useState } from "react";
import PlayerIcon from "./PlayerIcon";
import "./MediaLibraryView.css";
import musicAlbumIcon from "../assets/images/components/music_album.png";
import musicIcon from "../assets/images/components/music.png";
import playIcon from "../assets/images/components/play.png";

const NAV_ITEMS = [
  { id: "home", label: "Accueil", icon: "home" },
  { id: "music", label: "Bibliothèque de musique", icon: "music" },
  { id: "video", label: "Bibliothèque vidéo", icon: "library-video" },
  { id: "queue", label: "File d'attente de lecture", icon: "queue", separated: true },
  { id: "playlists", label: "Playlists", icon: "playlist" }
];

const VIEW_TITLES = {
  home: "Accueil",
  music: "Musique",
  video: "Vidéo",
  queue: "File d'attente",
  playlists: "Playlists"
};

const MUSIC_TABS = [
  { id: "tracks", label: "Morceaux" },
  { id: "albums", label: "Albums" },
  { id: "artists", label: "Artistes" }
];

const VIDEO_TABS = [
  { id: "all", label: "Toutes les vidéos" },
  { id: "folders", label: "Dossiers vidéo" }
];

const MUSIC_SORTS = [
  { id: "az", label: "A - Z" },
  { id: "artist", label: "Artiste" },
  { id: "album", label: "Album" },
  { id: "year", label: "Année de sortie" },
  { id: "added", label: "Date d'ajout" }
];

const VIDEO_SORTS = [
  { id: "az", label: "A - Z" },
  { id: "modified", label: "Date de modification" }
];

const UNKNOWN_ARTIST = "Artiste inconnu";
const UNKNOWN_ALBUM = "Album inconnu";
const UNKNOWN_GENRE = "Genre inconnu";

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

const genreOf = (item) => item.genre || UNKNOWN_GENRE;

// Artiste principal d'une mention "A, B", "A & B", "A feat. B"...
function primaryArtist(artist) {
  if (!artist || artist === UNKNOWN_ARTIST) return UNKNOWN_ARTIST;
  const first = artist
    .split(/\s*(?:,|;|&|\bfeat\.?|\bft\.?|\bavec\b|\bx\b)\s*/i)
    .map((part) => part.trim())
    .find(Boolean);
  return first ?? artist;
}

function letterOf(title) {
  const base = title
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .charAt(0)
    .toUpperCase();
  return /[A-Z]/.test(base) ? base : "#";
}

function sortTracks(list, sort) {
  const sorted = [...list];
  const byTitle = (a, b) => collator.compare(a.title, b.title);
  const byTrack = (a, b) => (a.track ?? 9999) - (b.track ?? 9999);
  switch (sort) {
    case "artist":
      return sorted.sort(
        (a, b) =>
          collator.compare(primaryArtist(a.artist), primaryArtist(b.artist)) ||
          collator.compare(a.album, b.album) ||
          byTrack(a, b) ||
          byTitle(a, b)
      );
    case "album":
      return sorted.sort((a, b) => collator.compare(a.album, b.album) || byTrack(a, b) || byTitle(a, b));
    case "year":
      return sorted.sort((a, b) => (a.year ?? 99999) - (b.year ?? 99999) || byTitle(a, b));
    case "added":
    case "modified":
      return sorted.sort((a, b) => b.modifiedSecs - a.modifiedSecs);
    default:
      return sorted.sort(byTitle);
  }
}

function groupConsecutive(list, keyOf) {
  const groups = [];
  list.forEach((item) => {
    const key = keyOf(item);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  });
  return groups;
}

function groupHeader(sort) {
  switch (sort) {
    case "az":
      return (item) => letterOf(item.title);
    case "artist":
      return (item) => primaryArtist(item.artist);
    case "album":
      return (item) => item.album;
    case "year":
      return (item) => (item.year ? String(item.year) : "Année inconnue");
    default:
      return null;
  }
}

function groupNamedEntries(entries, unknownLabel) {
  const known = entries.filter((entry) => entry.name !== unknownLabel);
  const unknown = entries.filter((entry) => entry.name === unknownLabel);
  const groups = groupConsecutive(known, (entry) => letterOf(entry.name)).map((group) => ({
    letter: group.key,
    entries: group.items
  }));
  if (unknown.length > 0) groups.push({ letter: "...", entries: unknown });
  return groups;
}

function folderOf(path) {
  return path.replace(/[\\/][^\\/]*$/, "");
}

function folderName(path) {
  const parts = folderOf(path).split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
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

function formatVideoDuration(seconds) {
  const total = Math.round(seconds);
  if (total <= 0) return "Durée inconnue";
  if (total < 60) return `${total} seconde${total > 1 ? "s" : ""}`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, "0")} min`;
}

function plural(count, one, many) {
  return `${count} ${count > 1 ? many : one}`;
}

/* ---------- petits composants ---------- */

function Check({ checked, onToggle, label }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      className={`mlv-check ${checked ? "is-checked" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {checked ? <PlayerIcon name="check" /> : null}
    </button>
  );
}

function EqualizerIcon({ active }) {
  return (
    <span className={`mlv-eq ${active ? "is-active" : ""}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function ContextMenu({ menu, onClose }) {
  const [openSub, setOpenSub] = useState(null);

  useEffect(() => {
    const handleDown = (event) => {
      if (event.target instanceof Element && event.target.closest(".mlv-ctx")) return;
      onClose();
    };
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const height = menu.items.length * (menu.wide ? 62 : 34) + 16;
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - (menu.wide ? 440 : 250)));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - height - 8));
  const subOnLeft = left > window.innerWidth - 500;

  return (
    <div className={`mlv-ctx ${menu.wide ? "mlv-ctx--wide" : ""}`} style={{ left, top }} role="menu">
      {menu.items.map((entry, index) =>
        entry.divider ? (
          <div key={`divider-${index}`} className="mlv-ctx__divider" />
        ) : (
          <div
            key={entry.label}
            className="mlv-ctx__row"
            onMouseEnter={() => setOpenSub(entry.children ? index : null)}
          >
            <button
              type="button"
              role="menuitem"
              className="mlv-ctx__item"
              disabled={entry.disabled}
              onClick={() => {
                if (entry.children) {
                  setOpenSub(index);
                  return;
                }
                onClose();
                entry.onClick?.();
              }}
            >
              <PlayerIcon name={entry.icon ?? "chevron"} />
              {entry.description ? (
                <span className="mlv-ctx__text">
                  <span>{entry.label}</span>
                  <small>{entry.description}</small>
                </span>
              ) : (
                <span>{entry.label}</span>
              )}
              {entry.children ? <PlayerIcon name="chevron" /> : null}
            </button>
            {entry.children && openSub === index ? (
              <div className={`mlv-ctx__sub ${subOnLeft ? "mlv-ctx__sub--left" : ""}`} role="menu">
                {entry.children.map((child) => (
                  <button
                    key={child.label}
                    type="button"
                    role="menuitem"
                    className="mlv-ctx__item"
                    onClick={() => {
                      onClose();
                      child.onClick?.();
                    }}
                  >
                    <PlayerIcon name={child.icon ?? "playlist"} />
                    <span>{child.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )
      )}
    </div>
  );
}

function Dropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.target instanceof Element && event.target.closest(".mlv-dropdown")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const current = options.find((option) => option.id === value) ?? options[0];

  return (
    <div className="mlv-dropdown">
      <button type="button" className="mlv-dropdown__button" onClick={() => setOpen((prev) => !prev)}>
        <span>{label}</span>
        <strong>{current?.label}</strong>
        <PlayerIcon name="chevron" />
      </button>
      {open ? (
        <div className="mlv-dropdown__list" role="listbox">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === value}
              className={option.id === value ? "is-active" : ""}
              onClick={() => {
                onChange(option.id);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Dialog({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="mlv-dialog-backdrop" onMouseDown={onClose}>
      <section
        className={`mlv-dialog ${wide ? "mlv-dialog--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mlv-dialog__body">
          <h3>{title}</h3>
          {children}
        </div>
        <footer className="mlv-dialog__foot">{footer}</footer>
      </section>
    </div>
  );
}

function TagEditorDialog({ items, bulkLabel, onSave, onClose, onOpenLocation }) {
  const single = items.length === 1 ? items[0] : null;
  const common = (read) => {
    const values = new Set(items.map(read));
    return values.size === 1 ? [...values][0] : "";
  };
  const [fields, setFields] = useState(() => ({
    title: single?.title ?? "",
    artist: single && single.artist !== UNKNOWN_ARTIST ? single.artist : "",
    album: common((item) => (item.album === UNKNOWN_ALBUM ? "" : item.album)),
    albumArtist: common((item) => item.albumArtist ?? ""),
    track: single?.track ? String(single.track) : "",
    genre: common((item) => item.genre ?? ""),
    year: common((item) => (item.year ? String(item.year) : ""))
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = (name) => (event) => setFields((prev) => ({ ...prev, [name]: event.target.value }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const updates = items.map((item) => {
        if (single) {
          return { path: item.path, ...fields };
        }
        // Édition groupée: un champ vide reste inchangé.
        const patch = { path: item.path };
        ["album", "albumArtist", "genre", "year"].forEach((name) => {
          if (fields[name].trim()) patch[name] = fields[name];
        });
        return patch;
      });
      await onSave(updates);
      onClose();
    } catch (err) {
      setError(typeof err === "string" ? err : "Impossible d'enregistrer les modifications.");
      setSaving(false);
    }
  };

  const field = (name, label, extra = {}) => (
    <label className="mlv-field">
      <span>{label}</span>
      <input type="text" value={fields[name]} onChange={update(name)} {...extra} />
    </label>
  );

  return (
    <Dialog
      title={single ? "Modifier les infos du morceau" : bulkLabel}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="mlv-btn mlv-btn--primary mlv-dialog__btn" onClick={save} disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
          <button type="button" className="mlv-btn mlv-dialog__btn" onClick={onClose} disabled={saving}>
            Annuler
          </button>
        </>
      }
    >
      <div className="mlv-form">
        {single ? field("title", "Titre", { autoFocus: true }) : null}
        {single ? field("artist", "Interprète ayant collaboré") : null}
        {field("album", "Album", single ? {} : { placeholder: "Inchangé" })}
        {field("albumArtist", "Artiste de l'album", single ? {} : { placeholder: "Inchangé" })}
        {single ? field("track", "Piste", { inputMode: "numeric" }) : null}
        {field("genre", "Genre", single ? {} : { placeholder: "Inchangé" })}
        {field("year", "Année", { inputMode: "numeric", ...(single ? {} : { placeholder: "Inchangé" }) })}
      </div>
      {single ? (
        <div className="mlv-dialog__path">
          <span>Emplacement du fichier</span>
          <strong>{single.path}</strong>
          <button type="button" className="mlv-link" onClick={() => onOpenLocation(single.path)}>
            Ouvrir l'emplacement du fichier
          </button>
        </div>
      ) : (
        <p className="mlv-dialog__hint">{plural(items.length, "morceau modifié", "morceaux modifiés")} ensemble.</p>
      )}
      {error ? <p className="mlv-dialog__error">{error}</p> : null}
    </Dialog>
  );
}

function PropertiesDialog({ item, onClose, onOpenLocation }) {
  const rows =
    item.type === "video"
      ? [
          ["Titre", item.title],
          ["Durée", item.duration],
          ["Type d'élément", `.${item.extension}`],
          ["Taille", formatBytes(item.sizeBytes)]
        ]
      : [
          ["Titre", item.title],
          ["Artistes ayant collaboré", item.artist],
          ["Album", item.album],
          ["Artiste de l'album", item.albumArtist || ""],
          ["Piste", item.track ? String(item.track) : ""],
          ["Durée", item.duration],
          ["Genre", item.genre || ""],
          ["Année", item.year ? String(item.year) : ""],
          ["Débit binaire", item.bitrateKbps ? `${item.bitrateKbps} Kbits/s` : ""],
          ["Type d'élément", `.${item.extension}`]
        ];

  return (
    <Dialog
      title="Propriétés"
      onClose={onClose}
      wide
      footer={
        <button type="button" className="mlv-btn mlv-dialog__btn" onClick={onClose}>
          Fermer
        </button>
      }
    >
      <dl className="mlv-props">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mlv-dialog__path">
        <span>Emplacement du fichier</span>
        <strong>{item.path}</strong>
        <button type="button" className="mlv-link" onClick={() => onOpenLocation(item.path)}>
          Ouvrir l'emplacement du fichier
        </button>
      </div>
    </Dialog>
  );
}

function TrackRow({
  item,
  selected,
  checked,
  selectionMode,
  current,
  isPlaying,
  onSelect,
  onToggle,
  onPlay,
  onMenu
}) {
  return (
    <div
      className={`mlv-row ${selected ? "is-selected" : ""} ${current ? "is-current" : ""} ${checked ? "is-checked" : ""} ${selectionMode ? "selection-mode" : ""}`}
      role="row"
      tabIndex={0}
      onClick={() => onSelect(item.id)}
      onDoubleClick={() => onPlay(item)}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(event.clientX, event.clientY);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") onPlay(item);
      }}
    >
      <span className="mlv-row__check">
        <Check checked={checked} onToggle={onToggle} label={`Sélectionner ${item.title}`} />
      </span>
      <button
        type="button"
        className="mlv-row__lead"
        onClick={(event) => {
          event.stopPropagation();
          onPlay(item);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        aria-label={`Lire ${item.title}`}
        title="Lecture"
      >
        {current ? <EqualizerIcon active={isPlaying} /> : <PlayerIcon name="play" />}
      </button>
      <span className="mlv-row__art" aria-hidden="true">
        {item.thumbnailUrl ? (
          <img src={item.thumbnailUrl} alt="" />
        ) : (
          <img className="mlv-row__art-placeholder" src={musicIcon} alt="" />
        )}
      </span>
      <span className="mlv-row__title" title={item.title}>{item.title}</span>
      <span className="mlv-row__cell mlv-row__artist" title={item.artist}>{item.artist}</span>
      <span className="mlv-row__cell mlv-row__album" title={item.album}>{item.album}</span>
      <span className="mlv-row__cell mlv-row__genre">{genreOf(item)}</span>
      <span className="mlv-row__duration">{item.duration}</span>
      <button
        type="button"
        className="mlv-row__more"
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          onMenu(rect.left, rect.bottom + 4);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        aria-label="Plus d'actions"
        title="Plus d'actions"
      >
        <PlayerIcon name="more" />
      </button>
    </div>
  );
}

function MediaCard({
  title,
  subtitle,
  art,
  placeholder,
  shape,
  plain,
  noCheck,
  checked,
  selectionMode,
  current,
  selected,
  onOpen,
  onDoubleOpen,
  onToggle,
  onPlay,
  onMenu
}) {
  return (
    <div
      className={`mlv-card mlv-card--${shape} ${plain ? "mlv-card--plain" : ""} ${noCheck ? "mlv-card--nocheck" : ""} ${checked ? "is-checked" : ""} ${selectionMode ? "selection-mode" : ""} ${current ? "is-current" : ""} ${selected ? "is-selected" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onDoubleClick={onDoubleOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu?.(event.clientX, event.clientY);
      }}
    >
      <span className={`mlv-card__art mlv-card__art--${shape}`}>
        {art ? <img src={art} alt="" /> : placeholder}
        <span className="mlv-card__check">
          <Check checked={Boolean(checked)} onToggle={onToggle ?? (() => {})} label={`Sélectionner ${title}`} />
        </span>
        <button
          type="button"
          className="mlv-card__play"
          onClick={(event) => {
            event.stopPropagation();
            onPlay();
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          aria-label={`Lire ${title}`}
          title="Lire"
        >
          <PlayerIcon name="play" />
        </button>
        <button
          type="button"
          className="mlv-card__more"
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            onMenu?.(rect.left, rect.bottom + 4);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          aria-label="Plus d'actions"
          title="Plus d'actions"
        >
          <PlayerIcon name="more" />
        </button>
      </span>
      <strong title={title}>{title}</strong>
      {subtitle ? <span className="mlv-card__sub">{subtitle}</span> : null}
    </div>
  );
}

function MediaDetailsPanel({ item, showVideo, setPanelHost, onToggleFullscreen }) {
  if (!item) {
    return (
      <aside className="mlv-panel" aria-label="Média sélectionné">
        <h4>Média sélectionné</h4>
        <p className="mlv-empty">Sélectionne un média pour afficher ses informations.</p>
      </aside>
    );
  }

  return (
    <aside className="mlv-panel" aria-live="polite" aria-label="Média sélectionné">
      <h4>Média sélectionné</h4>

      {item.type === "video" && showVideo ? (
        <div
          className="media-engine-host media-engine-host--panel"
          ref={setPanelHost}
          onDoubleClick={onToggleFullscreen}
        />
      ) : (
        <div className={`mlv-panel__art mlv-panel__art--${item.type}`}>
          {item.thumbnailUrl ? (
            <img className="mlv-panel__cover" src={item.thumbnailUrl} alt="" />
          ) : (
            <img
              className="mlv-panel__placeholder"
              src={item.type === "video" ? playIcon : musicAlbumIcon}
              alt=""
            />
          )}
        </div>
      )}

      <div className="mlv-panel__meta">
        <strong title={item.title}>{item.title}</strong>
        {/* Une vidéo sans tags n'a ni artiste ni album ; un clip musical en mp4 garde les siens. */}
        {item.type === "video" && item.artist === UNKNOWN_ARTIST ? null : <span>{item.artist}</span>}
        {item.type === "video" && item.album === UNKNOWN_ALBUM ? null : <span>{item.album}</span>}
      </div>

      <dl className="mlv-panel__facts">
        <div><dt>Durée</dt><dd>{item.duration}</dd></div>
        <div><dt>Format</dt><dd>{item.extension.toUpperCase()}</dd></div>
        {item.bitrateKbps ? <div><dt>Débit</dt><dd>{item.bitrateKbps} kb/s</dd></div> : null}
        <div><dt>Taille</dt><dd>{formatBytes(item.sizeBytes)}</dd></div>
      </dl>
    </aside>
  );
}

/* ---------- vue principale ---------- */

export default function MediaLibraryView({
  items,
  loading,
  error,
  selectedId,
  playingId,
  isPlaying,
  recents,
  onSelect,
  onPlay,
  onPlayNext,
  onAddToQueue,
  playlists,
  onCreatePlaylist,
  onDeletePlaylist,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  queueItems,
  onClearQueue,
  onAddFolder,
  onOpenSettings,
  onSaveTags,
  onOpenLocation,
  onOpenFiles,
  onOpenFolder,
  onAddFilesToQueue,
  onAddFolderToQueue,
  onAddUrl,
  onRenamePlaylist,
  requestArt,
  setPanelHost,
  showPanelVideo,
  onToggleFullscreen,
  visualizer,
  onNotify
}) {
  const [view, setView] = useState("home");
  const [musicTab, setMusicTab] = useState("tracks");
  const [videoTab, setVideoTab] = useState("all");
  const [search, setSearch] = useState("");
  const [musicSort, setMusicSort] = useState("az");
  const [videoSort, setVideoSort] = useState("az");
  const [genre, setGenre] = useState("all");
  const [focus, setFocus] = useState(null);
  const [openPlaylistId, setOpenPlaylistId] = useState(null);
  const [playlistSort, setPlaylistSort] = useState("az");
  const [playlistsExpanded, setPlaylistsExpanded] = useState(false);
  const [renamePrompt, setRenamePrompt] = useState(null);
  const [toast, setToast] = useState("");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [selection, setSelection] = useState({ kind: null, keys: [] });
  const [menu, setMenu] = useState(null);
  const [editor, setEditor] = useState(null);
  const [propertiesItem, setPropertiesItem] = useState(null);
  const [namePrompt, setNamePrompt] = useState(null);

  const query = search.trim().toLowerCase();
  const matchesSearch = (item) =>
    !query || `${item.title} ${item.artist} ${item.album}`.toLowerCase().includes(query);

  // Les fichiers ouverts directement ("session") ne font pas partie des listes de la bibliothèque.
  const audioItems = useMemo(() => items.filter((item) => item.type === "audio" && !item.session), [items]);
  const videoItems = useMemo(() => items.filter((item) => item.type === "video" && !item.session), [items]);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const selectedAny = selectedId ? itemsById.get(selectedId) ?? null : null;
  // Le panneau n'affiche que la sélection qui correspond à la bibliothèque ouverte.
  const selected =
    selectedAny &&
    ((view === "music" && selectedAny.type !== "audio") || (view === "video" && selectedAny.type !== "video"))
      ? null
      : selectedAny;

  const genreOptions = useMemo(() => {
    const names = [...new Set(audioItems.map(genreOf))].sort((a, b) => collator.compare(a, b));
    return [
      { id: "all", label: "Tous les genres" },
      ...names.map((name) => ({ id: name, label: name }))
    ];
  }, [audioItems]);

  const filteredAudio = useMemo(
    () => audioItems.filter((item) => matchesSearch(item) && (genre === "all" || genreOf(item) === genre)),
    [audioItems, query, genre]
  );

  const tracks = useMemo(
    () =>
      sortTracks(
        filteredAudio.filter((item) => {
          if (focus?.type === "album") return item.album === focus.value;
          if (focus?.type === "artist") return primaryArtist(item.artist) === focus.value;
          return true;
        }),
        musicSort
      ),
    [filteredAudio, focus, musicSort]
  );

  const groupAlbums = (list) => {
    const map = new Map();
    list.forEach((item) => {
      const entry = map.get(item.album) ?? { name: item.album, artistCounts: new Map(), items: [] };
      const main = primaryArtist(item.artist);
      entry.artistCounts.set(main, (entry.artistCounts.get(main) ?? 0) + 1);
      entry.items.push(item);
      map.set(item.album, entry);
    });
    return [...map.values()]
      .map((entry) => {
        const [mainArtist] = [...entry.artistCounts.entries()].sort((a, b) => b[1] - a[1])[0];
        return { ...entry, artist: mainArtist, items: sortTracks(entry.items, "album") };
      })
      .sort((a, b) => collator.compare(a.name, b.name));
  };

  const groupArtists = (list) => {
    const map = new Map();
    list.forEach((item) => {
      const main = primaryArtist(item.artist);
      const entry = map.get(main) ?? { name: main, items: [] };
      entry.items.push(item);
      map.set(main, entry);
    });
    return [...map.values()]
      .map((entry) => ({ ...entry, items: sortTracks(entry.items, "album") }))
      .sort((a, b) => collator.compare(a.name, b.name));
  };

  const albums = useMemo(() => groupAlbums(filteredAudio), [filteredAudio]);
  const artists = useMemo(() => groupArtists(filteredAudio), [filteredAudio]);
  const allAlbums = useMemo(() => new Map(groupAlbums(audioItems).map((entry) => [entry.name, entry])), [audioItems]);
  const allArtists = useMemo(() => new Map(groupArtists(audioItems).map((entry) => [entry.name, entry])), [audioItems]);

  const videos = useMemo(
    () =>
      sortTracks(
        videoItems.filter((item) => {
          if (!matchesSearch(item)) return false;
          if (focus?.type === "folder") return folderOf(item.path) === focus.value;
          return true;
        }),
        videoSort
      ),
    [videoItems, query, focus, videoSort]
  );

  const videoFolders = useMemo(() => {
    const map = new Map();
    videoItems.filter(matchesSearch).forEach((item) => {
      const folder = folderOf(item.path);
      map.set(folder, (map.get(folder) ?? 0) + 1);
    });
    return [...map.entries()]
      .map(([path, count]) => ({ path, name: folderName(`${path}\\x`), count }))
      .sort((a, b) => collator.compare(a.name, b.name));
  }, [videoItems, query]);

  const activePlaylist = playlists.find((playlist) => playlist.id === openPlaylistId) ?? null;
  const playlistItems = useMemo(
    () => (activePlaylist ? activePlaylist.itemIds.map((id) => itemsById.get(id)).filter(Boolean) : []),
    [activePlaylist, itemsById]
  );

  // Médias récents: vidéo regardée, musique écoutée, album ou artiste lu.
  const recentCards = useMemo(() => {
    const cards = [];
    (recents ?? []).forEach((entry) => {
      if (entry.kind === "video" || entry.kind === "track") {
        const item = itemsById.get(entry.key);
        if (!item) return;
        cards.push({
          ...entry,
          // Même format carré que la musique pour que les cartes de l'accueil restent alignées.
          shape: "square",
          title: item.title,
          subtitle: item.type === "video" ? formatVideoDuration(item.durationSeconds) : item.artist,
          item,
          list: [item],
          art: item.thumbnailUrl
        });
      } else if (entry.kind === "album") {
        const album = allAlbums.get(entry.key);
        if (!album) return;
        cards.push({
          ...entry,
          shape: "square",
          title: album.name,
          subtitle: album.artist,
          item: album.items[0],
          list: album.items,
          art: album.items[0].thumbnailUrl
        });
      } else if (entry.kind === "artist") {
        const artist = allArtists.get(entry.key);
        if (!artist) return;
        cards.push({
          ...entry,
          shape: "round",
          title: artist.name,
          subtitle: null,
          item: artist.items[0],
          list: artist.items,
          art: artist.items[0].thumbnailUrl
        });
      }
    });
    return cards;
  }, [recents, itemsById, allAlbums, allArtists]);

  const showingMusicTracks = view === "music" && musicTab === "tracks";
  const showingVideoGrid = view === "video" && videoTab === "all";

  let activeList = [];
  if (showingMusicTracks) activeList = tracks;
  else if (showingVideoGrid) activeList = videos;
  else if (view === "queue") activeList = queueItems;
  else if (view === "playlists") activeList = playlistItems;

  const artTargets = useMemo(() => {
    // Une pochette par album suffit pour les listes de morceaux.
    const onePerAlbum = (list) => {
      const seen = new Set();
      return list
        .filter((item) => {
          const key = item.album && item.album !== UNKNOWN_ALBUM ? `a:${item.album}` : item.id;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 60);
    };
    if (view === "music" && musicTab === "tracks") return onePerAlbum(tracks);
    if (view === "queue") return onePerAlbum(queueItems);
    if (view === "playlists") return onePerAlbum(playlistItems);
    if (view === "home") return recentCards.map((card) => card.item);
    if (view === "music" && musicTab === "albums") return albums.slice(0, 60).map((album) => album.items[0]);
    if (view === "music" && musicTab === "artists") return artists.slice(0, 60).map((artist) => artist.items[0]);
    if (view === "video" && videoTab === "all") return videos.slice(0, 60);
    return [];
  }, [view, musicTab, videoTab, albums, artists, videos, recentCards, tracks, queueItems, playlistItems]);
  const artSignature = artTargets.map((item) => item.id).join("|");

  useEffect(() => {
    artTargets.forEach((item) => requestArt(item));
  }, [artSignature]);

  useEffect(() => {
    setSelection({ kind: null, keys: [] });
  }, [view, musicTab, videoTab, focus, genre]);

  /* ----- sélection ----- */
  const selectionMode = selection.keys.length > 0;
  const isChecked = (kind, key) => selection.kind === kind && selection.keys.includes(key);
  const toggleCheck = (kind, key) =>
    setSelection((prev) => {
      const base = prev.kind === kind ? prev.keys : [];
      return {
        kind,
        keys: base.includes(key) ? base.filter((entry) => entry !== key) : [...base, key]
      };
    });
  const clearSelection = () => setSelection({ kind: null, keys: [] });

  const itemsOf = (kind, keys) => {
    if (kind === "album") return albums.filter((album) => keys.includes(album.name)).flatMap((album) => album.items);
    if (kind === "artist") return artists.filter((artist) => keys.includes(artist.name)).flatMap((artist) => artist.items);
    return keys.map((key) => itemsById.get(key)).filter(Boolean);
  };

  /* ----- actions ----- */
  const playFrom = (item, list = activeList, options) => {
    if (!item) return;
    onPlay(item, list, options);
  };

  const playRandom = (list) => {
    if (list.length === 0) return;
    playFrom(list[Math.floor(Math.random() * list.length)], list, { shuffle: true });
  };

  const changeView = (next) => {
    setView(next);
    setFocus(null);
    setMenu(null);
  };

  const showAlbum = (item) => {
    setView("music");
    setMusicTab("tracks");
    setFocus({ type: "album", value: item.album, label: `Album : ${item.album}` });
  };

  const showArtist = (item) => {
    const main = primaryArtist(item.artist);
    setView("music");
    setMusicTab("tracks");
    setFocus({ type: "artist", value: main, label: `Artiste : ${main}` });
  };

  const openEditor = (kind, targetItems) => {
    setEditor({
      items: targetItems,
      bulkLabel: kind === "album" ? "Modifier les infos de l'album" : "Modifier les infos des morceaux"
    });
  };

  const addToChildren = (targetItems) => [
    { label: "File d'attente de lecture", icon: "queue", onClick: () => onAddToQueue(targetItems) },
    ...playlists.map((playlist) => ({
      label: playlist.name,
      icon: "playlist",
      onClick: () => targetItems.forEach((item) => onAddToPlaylist(playlist.id, item.id))
    })),
    { label: "Nouvelle playlist", icon: "plus", onClick: () => setNamePrompt({ items: targetItems }) }
  ];

  const sourceFor = (kind, key) => (kind === "album" || kind === "artist" ? { source: { kind, key } } : undefined);

  const buildMenu = (kind, keys, extraFactory) => {
    const targets = itemsOf(kind, keys);
    if (targets.length === 0) return [];
    const first = targets[0];
    const single = targets.length === 1 || kind === "album" || kind === "artist";
    const entries = [
      {
        label: "Lire",
        icon: "play",
        onClick: () => playFrom(first, targets, keys.length === 1 ? sourceFor(kind, keys[0]) : undefined)
      },
      { label: "Lire ensuite", icon: "play-next", onClick: () => onPlayNext(targets) },
      { label: "Ajouter à", icon: "plus", children: addToChildren(targets) }
    ];
    if (kind !== "video") {
      entries.push({ label: "Modifier les infos", icon: "edit", onClick: () => openEditor(kind, targets) });
      if (single && kind !== "artist") {
        entries.push({ label: "Afficher l'album", icon: "album", onClick: () => showAlbum(first) });
      }
      if (single) {
        entries.push({ label: "Afficher l'artiste", icon: "person", onClick: () => showArtist(first) });
      }
    }
    if ((kind === "track" || kind === "video") && single) {
      entries.push({ label: "Propriétés", icon: "info", onClick: () => setPropertiesItem(first) });
    }
    if (extraFactory) entries.push(...extraFactory(keys));
    entries.push({ divider: true });
    entries.push({
      label: "Sélectionner",
      icon: "select",
      onClick: () => keys.forEach((key) => !isChecked(kind, key) && toggleCheck(kind, key))
    });
    return entries;
  };

  const openMenu = (kind, key, x, y, extraFactory) => {
    // Si l'élément fait partie de la sélection, le menu agit sur toute la sélection.
    const keys = isChecked(kind, key) ? selection.keys : [key];
    setMenu({ x, y, items: buildMenu(kind, keys, extraFactory) });
  };

  const submitNamePrompt = () => {
    const name = newPlaylistName.trim();
    if (!name || !namePrompt) return;
    onCreatePlaylist(name, namePrompt.items.map((item) => item.id));
    setToast(`Playlist '${name}' créée.`);
    setNewPlaylistName("");
    setNamePrompt(null);
  };

  const createUntitledPlaylist = () => {
    const names = new Set(playlists.map((playlist) => playlist.name));
    let name = "Playlist sans titre";
    let counter = 2;
    while (names.has(name)) {
      name = `Playlist sans titre (${counter})`;
      counter += 1;
    }
    onCreatePlaylist(name, []);
    setToast(`Playlist '${name}' créée.`);
  };

  useEffect(() => {
    if (!toast) return undefined;
    if (onNotify) {
      onNotify(toast);
      setToast("");
      return undefined;
    }
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const openQueueAddMenu = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({
      x: rect.right - 430,
      y: rect.bottom + 4,
      wide: true,
      items: [
        {
          label: "Ajouter des fichiers à la file d'attente de lecture",
          description: "Rechercher des fichiers à ajouter à la file d'attente de lecture",
          icon: "folder",
          onClick: onAddFilesToQueue
        },
        {
          label: "Ajouter un dossier à la file d'attente de lecture",
          description: "Choisissez un dossier et ajoutez tous les médias de ce dossier à la file d'attente de lecture",
          icon: "folder",
          onClick: onAddFolderToQueue
        },
        {
          label: "Ajouter un média à la file d'attente de lecture à partir d'une URL",
          description: "Entrez une URL : le média est préparé dans Media DL pour être téléchargé puis lu",
          icon: "search",
          onClick: onAddUrl
        }
      ]
    });
  };

  const openOpenMenu = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({
      x: rect.left,
      y: rect.bottom + 4,
      items: [
        { label: "Ouvrir un ou plusieurs fichier(s)", icon: "folder", onClick: onOpenFiles },
        { label: "Ouvrir un dossier", icon: "folder", onClick: onOpenFolder }
      ]
    });
  };

  /* ----- rendu ----- */
  const emptyMessage = error
    ? error
    : loading
      ? "Analyse de la bibliothèque..."
      : items.length === 0
        ? "Aucun média. Ajoute un dossier pour remplir la bibliothèque."
        : "Aucun résultat.";

  const renderRow = (item, list, extraFactory) => (
    <TrackRow
      key={item.id}
      item={item}
      selected={selectedId === item.id}
      checked={isChecked("track", item.id)}
      selectionMode={selectionMode}
      current={playingId === item.id}
      isPlaying={isPlaying}
      onSelect={onSelect}
      onToggle={() => toggleCheck("track", item.id)}
      onPlay={(entry) => playFrom(entry, list)}
      onMenu={(x, y) => openMenu("track", item.id, x, y, extraFactory)}
    />
  );

  const renderSelectionBar = (visibleKeys) => {
    const { kind, keys } = selection;
    const targets = itemsOf(kind, keys);
    const first = targets[0];
    const count = keys.length;
    const noun =
      kind === "album"
        ? plural(count, "album sélectionné", "albums sélectionnés")
        : kind === "artist"
          ? plural(count, "artiste sélectionné", "artistes sélectionnés")
          : kind === "video"
            ? plural(count, "vidéo sélectionnée", "vidéos sélectionnées")
            : plural(count, "morceau sélectionné", "morceaux sélectionnés");
    const single = count === 1;
    const openAdd = (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setMenu({ x: rect.left, y: rect.bottom + 4, items: addToChildren(targets) });
    };

    return (
      <div className="mlv-selbar" role="toolbar" aria-label="Actions sur la sélection">
        <Check
          checked={count > 0 && count === visibleKeys.length}
          onToggle={() => (count === visibleKeys.length ? clearSelection() : setSelection({ kind, keys: visibleKeys }))}
          label="Tout sélectionner"
        />
        <span className="mlv-selbar__count">{noun}</span>
        <span className="mlv-selbar__dot">•</span>
        <button type="button" className="mlv-link" onClick={clearSelection}>Effacer</button>
        <span className="mlv-selbar__spacer" />
        <button
          type="button"
          className="mlv-btn mlv-btn--primary"
          onClick={() => playFrom(first, targets, single ? sourceFor(kind, keys[0]) : undefined)}
        >
          <PlayerIcon name="play" />
          <span>Lire</span>
        </button>
        <button type="button" className="mlv-btn" onClick={() => onPlayNext(targets)}>
          <PlayerIcon name="play-next" />
          <span>Lire ensuite</span>
        </button>
        <button type="button" className="mlv-btn" onClick={openAdd}>
          <PlayerIcon name="plus" />
          <span>Ajouter à</span>
        </button>
        {kind !== "video" && kind !== "artist" && single ? (
          <button type="button" className="mlv-btn" onClick={() => showAlbum(first)}>
            <PlayerIcon name="album" />
            <span>Afficher l'album</span>
          </button>
        ) : null}
        {kind !== "video" && single ? (
          <button type="button" className="mlv-btn" onClick={() => showArtist(first)}>
            <PlayerIcon name="person" />
            <span>Afficher l'artiste</span>
          </button>
        ) : null}
        {kind === "track" || kind === "album" ? (
          <button type="button" className="mlv-btn" onClick={() => openEditor(kind, targets)}>
            <PlayerIcon name="edit" />
            <span>Modifier les infos</span>
          </button>
        ) : null}
        {(kind === "track" || kind === "video") && single ? (
          <button type="button" className="mlv-btn" onClick={() => setPropertiesItem(first)}>
            <PlayerIcon name="info" />
            <span>Propriétés</span>
          </button>
        ) : null}
      </div>
    );
  };

  const renderToolbar = ({ primaryLabel, primaryIcon, onPrimary, canPlay, sortOptions, sortValue, onSort, withGenre }) => (
    <div className="mlv-toolbar">
      <button type="button" className="mlv-btn mlv-btn--primary" onClick={onPrimary} disabled={!canPlay}>
        <PlayerIcon name={primaryIcon} />
        <span>{primaryLabel}</span>
      </button>
      {focus ? (
        <button type="button" className="mlv-chip" onClick={() => setFocus(null)} title="Retirer le filtre">
          <span>{focus.label}</span>
          <PlayerIcon name="close" />
        </button>
      ) : null}
      <span className="mlv-toolbar__spacer" />
      {sortOptions ? <Dropdown label="Trier par :" options={sortOptions} value={sortValue} onChange={onSort} /> : null}
      {withGenre ? <Dropdown label="Genre :" options={genreOptions} value={genre} onChange={setGenre} /> : null}
    </div>
  );

  const renderTrackList = (list, extraFactory) => {
    if (list.length === 0) return <p className="mlv-empty">{emptyMessage}</p>;
    const keyOf = groupHeader(musicSort);
    const header = (
      <div className="mlv-row mlv-row--head" role="row">
        <span />
        <span />
        <span />
        <span className="mlv-row__title">Titre</span>
        <span className="mlv-row__cell mlv-row__artist">Artiste</span>
        <span className="mlv-row__cell mlv-row__album">Album</span>
        <span className="mlv-row__cell mlv-row__genre">Genre</span>
        <span className="mlv-row__duration">Durée</span>
        <span />
      </div>
    );
    if (showingMusicTracks && keyOf) {
      return (
        <>
          {header}
          {groupConsecutive(list, keyOf).map((group) => (
            <section key={group.key} className="mlv-group">
              <h5>{group.key}</h5>
              {group.items.map((item) => renderRow(item, list, extraFactory))}
            </section>
          ))}
        </>
      );
    }
    return (
      <>
        {header}
        {list.map((item) => renderRow(item, list, extraFactory))}
      </>
    );
  };

  const renderGroupedCards = (entries, unknownLabel, kind) =>
    groupNamedEntries(entries, unknownLabel).map((group) => (
      <section key={group.letter} className="mlv-group">
        <h5>{group.letter}</h5>
        <div className="mlv-grid">
          {group.entries.map((entry) => (
            <MediaCard
              key={entry.name}
              shape={kind === "artist" ? "round" : "square"}
              title={entry.name}
              subtitle={kind === "album" ? entry.artist : null}
              art={entry.items[0].thumbnailUrl}
              placeholder={
                kind === "artist" ? (
                  <span className="mlv-card__person"><PlayerIcon name="person" /></span>
                ) : (
                  <img className="mlv-card__placeholder" src={musicAlbumIcon} alt="" />
                )
              }
              checked={isChecked(kind, entry.name)}
              selectionMode={selectionMode}
              onOpen={() => {
                if (selectionMode) {
                  toggleCheck(kind, entry.name);
                  return;
                }
                setFocus({
                  type: kind,
                  value: entry.name,
                  label: `${kind === "album" ? "Album" : "Artiste"} : ${entry.name}`
                });
                setMusicTab("tracks");
              }}
              onToggle={() => toggleCheck(kind, entry.name)}
              onPlay={() => playFrom(entry.items[0], entry.items, sourceFor(kind, entry.name))}
              onMenu={(x, y) => openMenu(kind, entry.name, x, y)}
            />
          ))}
        </div>
      </section>
    ));

  const renderBody = () => {
    if (view === "home") {
      return (
        <div className="mlv-home">
          <h3 className="mlv-section-title mlv-section-title--big">Médias récents</h3>
          {recentCards.length > 0 ? (
            <div className="mlv-grid">
              {recentCards.map((card) => (
                <MediaCard
                  key={`${card.kind}:${card.key}`}
                  plain
                  shape={card.shape}
                  title={card.title}
                  subtitle={card.subtitle}
                  art={card.art}
                  placeholder={
                    card.shape === "round" ? (
                      <span className="mlv-card__person"><PlayerIcon name="person" /></span>
                    ) : card.item?.type === "video" ? (
                      <img className="mlv-card__placeholder" src={playIcon} alt="" />
                    ) : card.kind === "album" ? (
                      <img className="mlv-card__placeholder" src={musicAlbumIcon} alt="" />
                    ) : (
                      <img className="mlv-card__placeholder" src={musicIcon} alt="" />
                    )
                  }
                  current={card.kind !== "album" && card.kind !== "artist" && playingId === card.key}
                  onOpen={() => playFrom(card.item, card.list, sourceFor(card.kind, card.key))}
                  onPlay={() => playFrom(card.item, card.list, sourceFor(card.kind, card.key))}
                />
              ))}
            </div>
          ) : (
            <div className="mlv-empty-state">
              <p>
                {loading
                  ? "Analyse de la bibliothèque..."
                  : error ||
                    (items.length === 0
                      ? "Ta bibliothèque est vide. Ajoute un dossier de musique ou de vidéos."
                      : "Aucun média récent. Lance une musique, une vidéo, un album ou un artiste pour le retrouver ici.")}
              </p>
              {items.length === 0 ? (
                <div className="mlv-empty-state__actions">
                  <button type="button" className="mlv-btn" onClick={() => onAddFolder("music")}>
                    Ajouter un dossier de musique
                  </button>
                  <button type="button" className="mlv-btn" onClick={() => onAddFolder("video")}>
                    Ajouter un dossier vidéo
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      );
    }

    if (view === "music") {
      if (musicTab === "tracks") {
        return (
          <>
            {selectionMode && selection.kind === "track"
              ? renderSelectionBar(tracks.map((item) => item.id))
              : renderToolbar({
                  primaryLabel: "Lire en aléatoire",
                  primaryIcon: "shuffle",
                  onPrimary: () => playRandom(tracks),
                  canPlay: tracks.length > 0,
                  sortOptions: MUSIC_SORTS,
                  sortValue: musicSort,
                  onSort: setMusicSort,
                  withGenre: true
                })}
            <div className="mlv-list" role="table">{renderTrackList(tracks)}</div>
          </>
        );
      }

      const kind = musicTab === "albums" ? "album" : "artist";
      const entries = musicTab === "albums" ? albums : artists;
      return (
        <>
          {selectionMode && selection.kind === kind
            ? renderSelectionBar(entries.map((entry) => entry.name))
            : renderToolbar({
                primaryLabel: "Lire en aléatoire",
                primaryIcon: "shuffle",
                onPrimary: () => playRandom(filteredAudio),
                canPlay: filteredAudio.length > 0,
                withGenre: true
              })}
          {entries.length === 0 ? (
            <p className="mlv-empty">{emptyMessage}</p>
          ) : (
            renderGroupedCards(entries, kind === "album" ? UNKNOWN_ALBUM : UNKNOWN_ARTIST, kind)
          )}
        </>
      );
    }

    if (view === "video") {
      if (videoTab === "all") {
        return (
          <>
            {selectionMode && selection.kind === "video"
              ? renderSelectionBar(videos.map((video) => video.id))
              : renderToolbar({
                  primaryLabel: "Tout lire",
                  primaryIcon: "play",
                  onPrimary: () => playFrom(videos[0], videos),
                  canPlay: videos.length > 0,
                  sortOptions: VIDEO_SORTS,
                  sortValue: videoSort,
                  onSort: setVideoSort
                })}
            {videos.length === 0 ? (
              <p className="mlv-empty">{emptyMessage}</p>
            ) : (
              <div className="mlv-grid mlv-grid--video">
                {videos.map((video) => (
                  <MediaCard
                    key={video.id}
                    shape="video"
                    title={video.title}
                    subtitle={formatVideoDuration(video.durationSeconds)}
                    art={video.thumbnailUrl}
                    placeholder={<img className="mlv-card__placeholder" src={playIcon} alt="" />}
                    checked={isChecked("video", video.id)}
                    selectionMode={selectionMode}
                    current={playingId === video.id}
                    selected={selectedId === video.id}
                    onOpen={() => (selectionMode ? toggleCheck("video", video.id) : onSelect(video.id))}
                    onDoubleOpen={() => playFrom(video, videos)}
                    onToggle={() => toggleCheck("video", video.id)}
                    onPlay={() => playFrom(video, videos)}
                    onMenu={(x, y) => openMenu("video", video.id, x, y)}
                  />
                ))}
              </div>
            )}
          </>
        );
      }

      return videoFolders.length === 0 ? (
        <p className="mlv-empty">{emptyMessage}</p>
      ) : (
        <div className="mlv-list">
          {videoFolders.map((folder) => (
            <button
              key={folder.path}
              type="button"
              className="mlv-row mlv-row--simple"
              onClick={() => {
                setFocus({ type: "folder", value: folder.path, label: `Dossier : ${folder.name}` });
                setVideoTab("all");
              }}
              title={folder.path}
            >
              <span className="mlv-row__title">{folder.name}</span>
              <span className="mlv-row__cell">{folder.path}</span>
              <span className="mlv-row__duration">{folder.count} vidéo(s)</span>
            </button>
          ))}
        </div>
      );
    }

    if (view === "queue") {
      return (
        <>
          {selectionMode && selection.kind === "track" ? (
            renderSelectionBar(queueItems.map((item) => item.id))
          ) : (
            <div className="mlv-toolbar">
              <button
                type="button"
                className="mlv-btn mlv-btn--ghost"
                onClick={onClearQueue}
                disabled={queueItems.length === 0}
              >
                <PlayerIcon name="trash" />
                <span>Effacer</span>
              </button>
              <button
                type="button"
                className="mlv-btn mlv-btn--ghost"
                disabled={queueItems.length === 0}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setMenu({ x: rect.left, y: rect.bottom + 4, items: addToChildren(queueItems).slice(1) });
                }}
              >
                <PlayerIcon name="plus" />
                <span>Ajouter à</span>
              </button>
            </div>
          )}
          {queueItems.length > 0 ? (
            <div className="mlv-list" role="table">{renderTrackList(queueItems)}</div>
          ) : null}
        </>
      );
    }

    // Playlists
    if (activePlaylist) {
      return (
        <>
          <div className="mlv-toolbar">
            <button type="button" className="mlv-btn mlv-btn--ghost" onClick={() => setOpenPlaylistId(null)}>
              <span aria-hidden="true">‹</span>
              <span>Playlists</span>
            </button>
            <h3 className="mlv-playlist-title">{activePlaylist.name}</h3>
            <span className="mlv-toolbar__info">{plural(playlistItems.length, "élément", "éléments")}</span>
          </div>
          <div className="mlv-toolbar">
            <button
              type="button"
              className="mlv-btn mlv-btn--primary"
              onClick={() => playFrom(playlistItems[0], playlistItems)}
              disabled={playlistItems.length === 0}
            >
              <PlayerIcon name="play" />
              <span>Tout lire</span>
            </button>
            <button
              type="button"
              className="mlv-btn"
              onClick={() => playRandom(playlistItems)}
              disabled={playlistItems.length === 0}
            >
              <PlayerIcon name="shuffle" />
              <span>Aléatoire</span>
            </button>
            <button
              type="button"
              className="mlv-btn"
              onClick={() => setRenamePrompt({ id: activePlaylist.id, name: activePlaylist.name })}
            >
              <PlayerIcon name="edit" />
              <span>Renommer</span>
            </button>
            <button
              type="button"
              className="mlv-btn"
              onClick={() => {
                onDeletePlaylist(activePlaylist.id);
                setOpenPlaylistId(null);
              }}
            >
              <PlayerIcon name="trash" />
              <span>Supprimer</span>
            </button>
          </div>
          {selectionMode && selection.kind === "track" ? renderSelectionBar(playlistItems.map((item) => item.id)) : null}
          {playlistItems.length === 0 ? (
            <p className="mlv-empty">Cette playlist est vide. Utilise « Ajouter à » depuis la bibliothèque.</p>
          ) : (
            <div className="mlv-list" role="table">
              {renderTrackList(playlistItems, (keys) => [
                {
                  label: "Retirer de la playlist",
                  icon: "close",
                  onClick: () => keys.forEach((id) => onRemoveFromPlaylist(activePlaylist.id, id))
                }
              ])}
            </div>
          )}
        </>
      );
    }

    if (playlists.length === 0) {
      return (
        <div className="mlv-playlists-empty">
          <svg width="132" height="150" viewBox="0 0 132 150" aria-hidden="true">
            <defs>
              <linearGradient id="mlv-pl-gradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--neon-1, #f5a623)" />
                <stop offset="1" stopColor="var(--neon-3, #8e44ad)" />
              </linearGradient>
            </defs>
            <rect x="20" y="4" width="92" height="9" rx="4.5" fill="url(#mlv-pl-gradient)" />
            <rect x="4" y="22" width="124" height="124" rx="18" fill="none" stroke="url(#mlv-pl-gradient)" strokeWidth="9" />
            <circle cx="66" cy="84" r="34" fill="none" stroke="url(#mlv-pl-gradient)" strokeWidth="9" />
            <circle cx="66" cy="84" r="7" fill="url(#mlv-pl-gradient)" />
          </svg>
          <div>
            <h3>Vous n'avez aucune playlist</h3>
            <button type="button" className="mlv-btn mlv-btn--primary" onClick={createUntitledPlaylist}>
              <PlayerIcon name="plus" />
              <span>Créer une playlist</span>
            </button>
          </div>
        </div>
      );
    }

    const sortedPlaylists = [...playlists].sort((a, b) =>
      playlistSort === "count"
        ? b.itemIds.length - a.itemIds.length
        : playlistSort === "za"
          ? collator.compare(b.name, a.name)
          : collator.compare(a.name, b.name)
    );

    return (
      <>
        <div className="mlv-toolbar">
          <button type="button" className="mlv-btn mlv-btn--primary" onClick={createUntitledPlaylist}>
            <PlayerIcon name="plus" />
            <span>Nouvelle playlist</span>
          </button>
          <span className="mlv-toolbar__spacer" />
          <Dropdown
            label="Trier par :"
            options={[
              { id: "az", label: "A - Z" },
              { id: "za", label: "Z - A" },
              { id: "count", label: "Nombre d'éléments" }
            ]}
            value={playlistSort}
            onChange={setPlaylistSort}
          />
        </div>
        <div className="mlv-grid">
          {sortedPlaylists.map((playlist) => {
            const listItems = playlist.itemIds.map((id) => itemsById.get(id)).filter(Boolean);
            return (
              <MediaCard
                key={playlist.id}
                shape="square"
                noCheck
                title={playlist.name}
                subtitle={plural(playlist.itemIds.length, "élément", "éléments")}
                art={listItems[0]?.thumbnailUrl}
                placeholder={
                  <span className="mlv-card__person"><PlayerIcon name="playlist" /></span>
                }
                onOpen={() => setOpenPlaylistId(playlist.id)}
                onPlay={() => listItems.length > 0 && playFrom(listItems[0], listItems)}
                onMenu={(x, y) =>
                  setMenu({
                    x,
                    y,
                    items: [
                      {
                        label: "Lire",
                        icon: "play",
                        disabled: listItems.length === 0,
                        onClick: () => playFrom(listItems[0], listItems)
                      },
                      {
                        label: "Lire ensuite",
                        icon: "play-next",
                        disabled: listItems.length === 0,
                        onClick: () => onPlayNext(listItems)
                      },
                      {
                        label: "Renommer",
                        icon: "edit",
                        onClick: () => setRenamePrompt({ id: playlist.id, name: playlist.name })
                      },
                      { label: "Supprimer", icon: "trash", onClick: () => onDeletePlaylist(playlist.id) }
                    ]
                  })
                }
              />
            );
          })}
        </div>
      </>
    );
  };

  const hasTabs = view === "music" || view === "video";

  return (
    <section className="mlv" aria-label="Lecteur média et bibliothèque">
      <nav className="mlv-nav" aria-label="Navigation du lecteur">
        <label className="mlv-search">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher"
            aria-label="Rechercher dans la bibliothèque"
          />
          <PlayerIcon name="search" />
        </label>

        <div className="mlv-nav__list">
          {NAV_ITEMS.map((entry) => (
            <div key={entry.id} className="mlv-nav__group">
              <button
                type="button"
                className={`mlv-nav__item ${view === entry.id ? "active" : ""} ${entry.separated ? "mlv-nav__item--separated" : ""}`}
                onClick={() => {
                  changeView(entry.id);
                  if (entry.id === "playlists") setOpenPlaylistId(null);
                }}
              >
                <PlayerIcon name={entry.icon} />
                <span>{entry.label}</span>
                {entry.id === "playlists" ? (
                  <span
                    className={`mlv-nav__chevron ${playlistsExpanded ? "is-open" : ""}`}
                    role="button"
                    tabIndex={0}
                    aria-label="Afficher les playlists"
                    title="Afficher les playlists"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPlaylistsExpanded((prev) => !prev);
                    }}
                  >
                    <PlayerIcon name="chevron" />
                  </span>
                ) : null}
              </button>
              {entry.id === "playlists" && playlistsExpanded
                ? playlists.map((playlist) => (
                    <button
                      key={playlist.id}
                      type="button"
                      className={`mlv-nav__item mlv-nav__item--sub ${openPlaylistId === playlist.id && view === "playlists" ? "active" : ""}`}
                      onClick={() => {
                        setView("playlists");
                        setOpenPlaylistId(playlist.id);
                      }}
                    >
                      <span>{playlist.name}</span>
                    </button>
                  ))
                : null}
            </div>
          ))}
        </div>

        <button type="button" className="mlv-nav__item mlv-nav__settings" onClick={onOpenSettings}>
          <PlayerIcon name="settings" />
          <span>Paramètres</span>
        </button>
      </nav>

      <div className="mlv-main">
        <header className="mlv-head">
          <h2>{VIEW_TITLES[view]}</h2>
          {hasTabs ? (
            <div className="mlv-tabs" role="tablist">
              {(view === "music" ? MUSIC_TABS : VIDEO_TABS).map((tab) => {
                const active = (view === "music" ? musicTab : videoTab) === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`mlv-tab ${active ? "active" : ""}`}
                    onClick={() => {
                      if (view === "music") setMusicTab(tab.id);
                      else setVideoTab(tab.id);
                      setFocus(null);
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          {hasTabs ? (
            <button
              type="button"
              className="mlv-btn mlv-head__add"
              onClick={() => onAddFolder(view === "video" ? "video" : "music")}
            >
              <PlayerIcon name="folder" />
              <span>Ajouter un dossier</span>
            </button>
          ) : null}
          {view === "queue" ? (
            <div className="mlv-split mlv-head__add">
              <button type="button" className="mlv-btn mlv-split__main" onClick={onAddFilesToQueue}>
                <PlayerIcon name="folder" />
                <span>Ajouter un ou plusieurs fichiers</span>
              </button>
              <button
                type="button"
                className="mlv-btn mlv-split__more"
                onClick={openQueueAddMenu}
                aria-label="Autres façons d'ajouter"
                title="Autres façons d'ajouter"
              >
                <PlayerIcon name="chevron" />
              </button>
            </div>
          ) : null}
          {view === "home" ? (
            <div className="mlv-split mlv-head__add">
              <button type="button" className="mlv-btn mlv-split__main" onClick={onOpenFiles}>
                <PlayerIcon name="folder" />
                <span>Ouvrir un ou plusieurs fichier(s)</span>
              </button>
              <button
                type="button"
                className="mlv-btn mlv-split__more"
                onClick={openOpenMenu}
                aria-label="Autres façons d'ouvrir"
                title="Autres façons d'ouvrir"
              >
                <PlayerIcon name="chevron" />
              </button>
            </div>
          ) : null}
        </header>

        <div className="mlv-content">
          <div className="mlv-scroll">{renderBody()}</div>
          {view !== "home" ? (
            <MediaDetailsPanel
              item={selected}
              showVideo={showPanelVideo}
              setPanelHost={setPanelHost}
              onToggleFullscreen={onToggleFullscreen}
            />
          ) : null}
        </div>
      </div>

      {menu ? <ContextMenu menu={menu} onClose={() => setMenu(null)} /> : null}

      {editor ? (
        <TagEditorDialog
          items={editor.items}
          bulkLabel={editor.bulkLabel}
          onSave={onSaveTags}
          onClose={() => setEditor(null)}
          onOpenLocation={onOpenLocation}
        />
      ) : null}

      {propertiesItem ? (
        <PropertiesDialog
          item={propertiesItem}
          onClose={() => setPropertiesItem(null)}
          onOpenLocation={onOpenLocation}
        />
      ) : null}

      {renamePrompt ? (
        <Dialog
          title="Renommer la playlist"
          onClose={() => setRenamePrompt(null)}
          footer={
            <>
              <button
                type="button"
                className="mlv-btn mlv-btn--primary mlv-dialog__btn"
                onClick={() => {
                  if (renamePrompt.name.trim()) onRenamePlaylist(renamePrompt.id, renamePrompt.name.trim());
                  setRenamePrompt(null);
                }}
              >
                Enregistrer
              </button>
              <button type="button" className="mlv-btn mlv-dialog__btn" onClick={() => setRenamePrompt(null)}>
                Annuler
              </button>
            </>
          }
        >
          <label className="mlv-field">
            <span>Nom de la playlist</span>
            <input
              type="text"
              autoFocus
              value={renamePrompt.name}
              onChange={(event) => setRenamePrompt((prev) => ({ ...prev, name: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  if (renamePrompt.name.trim()) onRenamePlaylist(renamePrompt.id, renamePrompt.name.trim());
                  setRenamePrompt(null);
                }
              }}
            />
          </label>
        </Dialog>
      ) : null}

      {toast ? (
        <div className="mlv-toast" role="status">
          <span>{toast}</span>
          <button type="button" className="mlv-icon-btn" onClick={() => setToast("")} aria-label="Fermer" title="Fermer">
            <PlayerIcon name="close" />
          </button>
        </div>
      ) : null}

      {namePrompt ? (
        <Dialog
          title="Nouvelle playlist"
          onClose={() => setNamePrompt(null)}
          footer={
            <>
              <button type="button" className="mlv-btn mlv-btn--primary mlv-dialog__btn" onClick={submitNamePrompt}>
                Créer
              </button>
              <button type="button" className="mlv-btn mlv-dialog__btn" onClick={() => setNamePrompt(null)}>
                Annuler
              </button>
            </>
          }
        >
          <label className="mlv-field">
            <span>Nom de la playlist</span>
            <input
              type="text"
              autoFocus
              value={newPlaylistName}
              onChange={(event) => setNewPlaylistName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitNamePrompt();
              }}
            />
          </label>
        </Dialog>
      ) : null}
    </section>
  );
}
