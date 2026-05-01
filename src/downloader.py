"""
src/downloader.py
-----------------
High-level downloader interface for RapidTunes.

This module provides the :class:`Downloader` facade that ties together the
:class:`~services.download_service.DownloadService` with user-facing helpers
such as progress display and result reporting.
"""

from typing import Callable, Optional

from services.download_service import DownloadService
from utils.helpers import (
    default_output_dir,
    ensure_directory,
    print_info,
    print_success,
    print_error,
    read_urls_from_file,
)
from utils.validators import validate_url, validate_urls_file


class Downloader:
    """
    Facade over :class:`DownloadService` that adds validation and reporting.

    Usage example::

        dl = Downloader(output_dir="/tmp/music")
        success, msg = dl.download("https://www.youtube.com/watch?v=...", fmt="mp3")
    """

    def __init__(
        self,
        output_dir: Optional[str] = None,
        on_progress: Optional[Callable] = None,
    ) -> None:
        out = output_dir or default_output_dir()
        self._service = DownloadService(
            output_dir=ensure_directory(out),
            on_progress=on_progress,
        )

    # ------------------------------------------------------------------
    # Single URL
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
            Source URL.
        fmt:
            Output format (``"mp3"``, ``"mp4"``, ``"wav"``, etc.).
        quality:
            Quality preset (``"1080p"``, ``"320"``, ``"best"`` …).
        audio_only:
            Extract audio only even when *fmt* is a video format.

        Returns
        -------
        (True, message) on success, (False, error) on failure.
        """
        if not validate_url(url):
            return False, f"Invalid URL: '{url}'"

        return self._service.download(
            url=url,
            fmt=fmt,
            quality=quality,
            audio_only=audio_only,
        )

    # ------------------------------------------------------------------
    # Batch from list
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

        Returns a list of ``(url, success, message)`` tuples.
        """
        valid_urls = [u for u in urls if validate_url(u)]
        invalid_count = len(urls) - len(valid_urls)
        if invalid_count:
            print_error(f"Skipping {invalid_count} invalid URL(s).")

        if not valid_urls:
            return []

        return self._service.download_batch(
            urls=valid_urls,
            fmt=fmt,
            quality=quality,
            audio_only=audio_only,
        )

    # ------------------------------------------------------------------
    # Batch from file
    # ------------------------------------------------------------------

    def download_from_file(
        self,
        filepath: str,
        fmt: str = "mp4",
        quality: str = "best",
        audio_only: bool = False,
    ) -> list[tuple[str, bool, str]]:
        """
        Read URLs from a text file and download them all.

        Each non-blank, non-comment line in the file is treated as a URL.
        Returns a list of ``(url, success, message)`` tuples.
        """
        ok, msg = validate_urls_file(filepath)
        if not ok:
            print_error(msg)
            return []

        urls = read_urls_from_file(filepath)
        if not urls:
            print_error(f"No URLs found in '{filepath}'.")
            return []

        print_info(f"Found {len(urls)} URL(s) in '{filepath}'.")
        return self.download_batch(urls, fmt=fmt, quality=quality, audio_only=audio_only)

    # ------------------------------------------------------------------
    # Playlist
    # ------------------------------------------------------------------

    def download_playlist(
        self,
        url: str,
        fmt: str = "mp4",
        quality: str = "best",
        audio_only: bool = False,
    ) -> tuple[bool, str]:
        """Download all entries from a playlist URL."""
        if not validate_url(url):
            return False, f"Invalid URL: '{url}'"

        print_info(f"Downloading playlist: {url}")
        return self._service.download_playlist(
            url=url,
            fmt=fmt,
            quality=quality,
            audio_only=audio_only,
        )
