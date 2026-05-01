# Project-RapidTunes 🎵

**RapidTunes** is a command-line media downloader and converter built in Python.
Download videos and audio from any URL supported by [yt-dlp](https://github.com/yt-dlp/yt-dlp),
and convert between popular audio/video formats using [ffmpeg](https://ffmpeg.org/).

---

## Features

| Feature | Details |
|---|---|
| **Download** | Videos and audio from YouTube, SoundCloud, and 1000+ sites |
| **Formats** | MP3, MP4, WAV, FLAC, AAC, M4A, OGG, MKV, WebM, AVI, MOV |
| **Quality** | 128 / 192 / 256 / 320 kbps for audio · 360p / 480p / 720p / 1080p for video |
| **Audio extraction** | Strip audio from any video file |
| **Batch downloads** | From a list of URLs on the command line or a `.txt` file |
| **Playlist support** | Download full playlists in one command |
| **Progress display** | Real-time download progress via rich console output |
| **Custom output dir** | Save anywhere with `--output-dir` |

---

## Project Structure

```
Project-RapidTunes/
├── main.py                  # Entry point
├── requirements.txt
├── src/
│   ├── cli.py               # CLI argument parser & command handlers
│   ├── downloader.py        # High-level downloader facade
│   └── converter.py         # High-level converter facade
├── services/
│   ├── download_service.py  # Core download logic (yt-dlp)
│   └── convert_service.py   # Core conversion logic (ffmpeg)
├── utils/
│   ├── validators.py        # URL, format, quality & path validation
│   └── helpers.py           # Shared utilities (file I/O, display, paths)
└── tests/
    ├── test_validators.py
    ├── test_helpers.py
    ├── test_cli.py
    ├── test_downloader.py
    └── test_converter.py
```

---

## Requirements

- Python 3.10+
- [ffmpeg](https://ffmpeg.org/download.html) installed and on your `PATH` (required for conversion and audio extraction)

---

## Installation

```bash
# Clone the repository
git clone https://github.com/Ghost-FaceFR/Project-RapidTunes.git
cd Project-RapidTunes

# Install Python dependencies
pip install -r requirements.txt

# Verify ffmpeg is installed (needed for conversion)
ffmpeg -version
```

---

## Usage

```
python main.py <command> [options]
```

### Download a single URL

```bash
# Download as MP4 (default)
python main.py download "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Download audio only as MP3 at 320 kbps
python main.py download -f mp3 -q 320 -a "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Download at 1080p to a custom directory
python main.py -o ~/Videos download -q 1080p "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

### Download a playlist

```bash
python main.py download --playlist -f mp3 "https://www.youtube.com/playlist?list=PLxxxxxx"
```

### Batch download

```bash
# Inline URLs
python main.py batch "https://url1.com" "https://url2.com" -f mp3

# From a text file (one URL per line, # = comment)
python main.py batch --file urls.txt -f mp4 -q 1080p
```

### Convert a local file

```bash
# Convert video to MP3
python main.py convert video.mp4 -f mp3 -q 320

# Convert multiple files at once
python main.py convert video.mp4 -f mp3 --batch clip1.mp4 clip2.mp4

# Save to a custom directory
python main.py -o ~/Music convert video.mp4 -f flac
```

### Extract audio from a video

```bash
python main.py extract movie.mp4 -f wav -q 320
```

### All options

```
python main.py --help
python main.py download --help
python main.py batch --help
python main.py convert --help
python main.py extract --help
```

---

## Supported Formats

| Type | Formats |
|------|---------|
| Audio | `mp3`, `wav`, `flac`, `aac`, `m4a`, `ogg` |
| Video | `mp4`, `mkv`, `webm`, `avi`, `mov` |

## Supported Quality Presets

| Type | Values |
|------|--------|
| Audio bitrate | `128`, `192`, `256`, `320` (kbps) |
| Video resolution | `360p`, `480p`, `720p`, `1080p`, `1440p`, `2160p`, `best`, `worst` |

---

## Running Tests

```bash
pip install pytest
python -m pytest tests/ -v
```

---

## License

MIT
