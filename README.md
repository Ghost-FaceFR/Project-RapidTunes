# RapidTunes

**RapidTunes** is a desktop media downloader and converter built with [Tauri v2](https://tauri.app/), React (JSX), and pure CSS. It uses [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [ffmpeg](https://ffmpeg.org/) for downloading and converting media from YouTube and other platforms.

---

## Features

- 🎵 Download audio/video from YouTube and other supported sites
- 🔄 Convert media to **MP3**, **MP4**, **WAV**, **FLAC**, or **AAC**
- 🎚️ Choose quality: **128kbps**, **320kbps**, **720p**, **1080p**
- 📋 Batch download support (queue multiple URLs)
- 📁 Choose your own destination folder
- 📊 Visual download progress bar
- 📂 Open containing folder from the file list
- 🌙 Dark theme with smooth animations

---

## Prerequisites

Before running RapidTunes, ensure the following tools are installed and available in your system `PATH`:

| Tool | Purpose | Install |
|------|---------|---------|
| [Rust](https://rustup.rs/) | Tauri backend | `curl https://sh.rustup.rs -sSf \| sh` |
| [Node.js](https://nodejs.org/) (≥ 18) | Frontend build | [nodejs.org](https://nodejs.org/) |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Media downloading | `pip install yt-dlp` or see releases |
| [ffmpeg](https://ffmpeg.org/) | Media conversion | `apt install ffmpeg` / `brew install ffmpeg` |

---

## Installation & Development

```bash
# 1. Clone the repository
git clone https://github.com/Ghost-FaceFR/Project-RapidTunes.git
cd Project-RapidTunes

# 2. Install Node.js dependencies
npm install

# 3. Start in development mode (Tauri + Vite hot-reload)
npm run tauri dev
```

---

## Production Build

```bash
npm run tauri build
```

The packaged application will be found in `src-tauri/target/release/bundle/`.

---

## Project Structure

```
Project-RapidTunes/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs           # Entry point Tauri
│   │   ├── lib.rs            # Tauri commands registration
│   │   ├── downloader.rs     # Download logic (yt-dlp)
│   │   └── converter.rs      # Conversion logic (ffmpeg)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── components/
│   │   ├── DownloadForm.jsx  # URL input + format/quality selectors
│   │   ├── ProgressBar.jsx   # Progress bar component
│   │   ├── FileList.jsx      # List of completed downloads
│   │   └── Settings.jsx      # Folder settings panel
│   ├── App.jsx               # Root component with tab navigation
│   ├── main.jsx              # React entry point
│   └── styles/               # Pure CSS for each component
├── index.html
├── vite.config.js
├── package.json
└── README.md
```

---

## Tech Stack

- **[Tauri v2](https://tauri.app/)** — Rust-powered desktop framework
- **[React 18](https://react.dev/)** (JSX via Vite) — UI library
- **Pure CSS** — No frameworks (no Tailwind, no Bootstrap, no MUI)
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** — Video/audio downloader
- **[ffmpeg](https://ffmpeg.org/)** — Media conversion

---

## License

MIT
