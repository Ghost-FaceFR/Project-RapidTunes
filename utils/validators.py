"""
utils/validators.py
-------------------
Input validation helpers for RapidTunes.

Validates URLs, format choices, quality options, and file paths so errors are
caught early and surfaced with clear messages.
"""

import os
import re
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# Supported media formats and quality presets
# ---------------------------------------------------------------------------

SUPPORTED_AUDIO_FORMATS = {"mp3", "wav", "flac", "aac", "m4a", "ogg"}
SUPPORTED_VIDEO_FORMATS = {"mp4", "mkv", "webm", "avi", "mov"}
SUPPORTED_FORMATS = SUPPORTED_AUDIO_FORMATS | SUPPORTED_VIDEO_FORMATS

AUDIO_QUALITIES = {"128", "192", "256", "320"}  # kbps
VIDEO_QUALITIES = {"360p", "480p", "720p", "1080p", "1440p", "2160p", "best", "worst"}
SUPPORTED_QUALITIES = AUDIO_QUALITIES | VIDEO_QUALITIES


def validate_url(url: str) -> bool:
    """
    Return True when *url* looks like a valid HTTP/HTTPS URL.

    Performs a lightweight structural check (scheme + netloc) and rejects
    obviously malformed strings without making a network request.
    """
    if not url or not isinstance(url, str):
        return False
    url = url.strip()
    try:
        parsed = urlparse(url)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except ValueError:
        return False


def validate_format(fmt: str) -> bool:
    """Return True when *fmt* is a recognised output format."""
    return isinstance(fmt, str) and fmt.strip().lower() in SUPPORTED_FORMATS


def validate_quality(quality: str) -> bool:
    """Return True when *quality* is a recognised quality preset."""
    return isinstance(quality, str) and quality.strip().lower() in SUPPORTED_QUALITIES


def validate_output_dir(path: str) -> tuple[bool, str]:
    """
    Check that *path* can be used as an output directory.

    Returns a ``(ok, message)`` tuple where *ok* is a bool and *message*
    describes the problem when *ok* is False.
    """
    if not path or not isinstance(path, str):
        return False, "Output path must be a non-empty string."

    path = path.strip()

    if os.path.isfile(path):
        return False, f"'{path}' is an existing file, not a directory."

    if not os.path.exists(path):
        # We will attempt to create it later; just verify the parent exists.
        parent = os.path.dirname(os.path.abspath(path))
        if not os.path.isdir(parent):
            return False, f"Parent directory '{parent}' does not exist."

    return True, ""


def validate_urls_file(filepath: str) -> tuple[bool, str]:
    """
    Validate a text file whose lines contain URLs for batch downloading.

    Returns ``(ok, message)``.
    """
    if not os.path.isfile(filepath):
        return False, f"File not found: '{filepath}'"

    _, ext = os.path.splitext(filepath)
    if ext.lower() not in (".txt", ""):
        return False, f"Expected a .txt file, got '{ext}'."

    return True, ""


def validate_local_file(filepath: str) -> tuple[bool, str]:
    """
    Validate that *filepath* points to an existing readable media file.

    Returns ``(ok, message)``.
    """
    if not filepath or not isinstance(filepath, str):
        return False, "File path must be a non-empty string."

    filepath = filepath.strip()

    if not os.path.isfile(filepath):
        return False, f"File not found: '{filepath}'"

    if not os.access(filepath, os.R_OK):
        return False, f"File is not readable: '{filepath}'"

    return True, ""
