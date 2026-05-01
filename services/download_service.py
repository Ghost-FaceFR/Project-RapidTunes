"""
services/download_service.py
-----------------------------
Core download logic for RapidTunes.

Wraps yt-dlp to download videos and audio from any supported URL.
Supports quality selection, audio-only extraction, custom output directories,
and progress reporting via a rich-powered progress hook.
"""

import os
from typing import Callable, Optional

import yt_dlp

from utils.helpers import (
    ensure_directory,
    print_info,
    print_success,
    print_error,
    print_warning,
    sanitize_filename,
)
from utils.validators import validate_url, AUDIO_QUALITIES, SUPPORTED_AUDIO_FORMATS


# ---------------------------------------------------------------------------
# Progress hook
# ---------------------------------------------------------------------------

def _build_progress_hook(on_progress: Optional[Callable] = None):
    """
    Return a yt-dlp progress hook function.

    When *on_progress* is provided it is called with a dict containing
    ``status``, ``filename``, ``downloaded_bytes``, and ``total_bytes``.
    Otherwise a simple console indicator is used.
    """
    def _hook(d: dict) -> None:
        status = d.get("status", "")
        if status == "downloading":
            downloaded = d.get("downloaded_bytes", 0)
            total = d.get("total_bytes") or d.get("total_bytes_estimate", 0)
            filename = os.path.basename(d.get("filename", ""))
            if on_progress:
                on_progress({
                    "status": "downloading",
                    "filename": filename,
                    "downloaded_bytes": downloaded,
                    "total_bytes": total,
                })
            else:
                if total:
                    pct = downloaded / total * 100
                    print(
                        f"\r  Downloading {filename}: {pct:.1f}%",
                        end="",
                        flush=True,
                    )
        elif status == "finished":
            print()  # newline after progress
            filename = os.path.basename(d.get("filename", ""))
            if on_progress:
                on_progress({"status": "finished", "filename": filename})
            else:
                print_success(f"Downloaded: {filename}")
        elif status == "error":
            print()
            if on_progress:
                on_progress({"status": "error"})

    return _hook


# ---------------------------------------------------------------------------
# Format string helpers
# ---------------------------------------------------------------------------

def _build_format_string(
    media_type: str,
    quality: str,
    fmt: str,
) -> str:
    """
    Build the yt-dlp ``format`` selector string.

    Parameters
    ----------
    media_type:
        ``"audio"`` or ``"video"``.
    quality:
        Quality preset (e.g. ``"320"``, ``"1080p"``).
    fmt:
        Target container (e.g. ``"mp3"``, ``"mp4"``).
    """
    if media_type == "audio":
        # Audio-only: prefer the best audio and let postprocessing re-encode
        return "bestaudio/best"

    # Video: try to match the requested resolution
    height = quality.rstrip("p") if quality.endswith("p") else None
    if height and height.isdigit():
        # Prefer video+audio bundle at requested height; fall back gracefully
        return (
            f"bestvideo[height<={height}]+bestaudio/best[height<={height}]/best"
        )
    if quality == "best":
        return "bestvideo+bestaudio/best"
    if quality == "worst":
        return "worstvideo+worstaudio/worst"

    return "bestvideo+bestaudio/best"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class DownloadService:
    """
    High-level service for downloading media from URLs.

    All public methods return a ``(success: bool, message: str)`` tuple.
    """

    def __init__(
        self,
        output_dir: str = ".",
        on_progress: Optional[Callable] = None,
    ) -> None:
        self.output_dir = ensure_directory(output_dir)
        self.on_progress = on_progress

    # ------------------------------------------------------------------
    # Single-URL download
    # ------------------------------------------------------------------

    def download(
        self,
        url: str,
        fmt: str = "mp4",
        quality: str = "best",
        audio_only: bool = False,
    ) -> tuple[bool, str]:
        """
        Download the media at *url*.

        Parameters
        ----------
        url:
            The URL to download from.
        fmt:
            Output container format (e.g. ``"mp4"``, ``"mp3"``).
        quality:
            Quality preset (e.g. ``"1080p"``, ``"320"``).
        audio_only:
            When True the download is treated as audio regardless of *fmt*.

        Returns
        -------
        (True, output_path) on success, (False, error_message) on failure.
        """
        if not validate_url(url):
            return False, f"Invalid URL: '{url}'"

        fmt = fmt.strip().lower()
        quality = quality.strip().lower()

        # Determine whether we are fetching audio or video
        is_audio = audio_only or fmt in SUPPORTED_AUDIO_FORMATS

        media_type = "audio" if is_audio else "video"
        format_str = _build_format_string(media_type, quality, fmt)

        ydl_opts = self._build_ydl_opts(fmt, format_str, is_audio, quality=quality)

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                title = info.get("title", "media") if info else "media"
                return True, f"'{title}' downloaded to '{self.output_dir}'"
        except yt_dlp.utils.DownloadError as exc:
            return False, str(exc)
        except Exception as exc:  # noqa: BLE001
            return False, f"Unexpected error: {exc}"

    # ------------------------------------------------------------------
    # Batch download
    # ------------------------------------------------------------------

    def download_batch(
        self,
        urls: list[str],
        fmt: str = "mp4",
        quality: str = "best",
        audio_only: bool = False,
    ) -> list[tuple[str, bool, str]]:
        """
        Download each URL in *urls*.

        Returns a list of ``(url, success, message)`` tuples so callers can
        report per-item results.
        """
        results: list[tuple[str, bool, str]] = []
        total = len(urls)
        for index, url in enumerate(urls, start=1):
            print_info(f"[{index}/{total}] Downloading: {url}")
            success, message = self.download(url, fmt=fmt, quality=quality, audio_only=audio_only)
            results.append((url, success, message))
            if success:
                print_success(message)
            else:
                print_error(message)
        return results

    # ------------------------------------------------------------------
    # Playlist download
    # ------------------------------------------------------------------

    def download_playlist(
        self,
        url: str,
        fmt: str = "mp4",
        quality: str = "best",
        audio_only: bool = False,
    ) -> tuple[bool, str]:
        """
        Download all entries in the playlist at *url*.

        Internally this is handled by yt-dlp's built-in playlist support.
        Returns ``(True, summary)`` or ``(False, error_message)``.
        """
        if not validate_url(url):
            return False, f"Invalid URL: '{url}'"

        print_info(f"Starting playlist download from: {url}")
        return self.download(url, fmt=fmt, quality=quality, audio_only=audio_only)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_ydl_opts(
        self,
        fmt: str,
        format_str: str,
        is_audio: bool,
        quality: str = "best",
    ) -> dict:
        """Build the yt-dlp options dictionary."""
        # Output template: save to the configured directory
        outtmpl = os.path.join(self.output_dir, "%(title)s.%(ext)s")

        opts: dict = {
            "outtmpl": outtmpl,
            "format": format_str,
            "progress_hooks": [_build_progress_hook(self.on_progress)],
            # Don't print yt-dlp's own output; we handle display ourselves
            "quiet": True,
            "no_warnings": False,
        }

        if is_audio:
            # Request post-processing to re-encode into the desired audio format
            audio_fmt = fmt if fmt in {"mp3", "wav", "flac", "aac", "m4a", "ogg"} else "mp3"
            # Use the user-requested bitrate when it's a valid kbps value; default to 192
            preferred_quality = quality if quality in AUDIO_QUALITIES else "192"
            opts["postprocessors"] = [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": audio_fmt,
                    "preferredquality": preferred_quality,
                }
            ]

        return opts
