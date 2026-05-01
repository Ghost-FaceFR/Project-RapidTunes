"""
utils/helpers.py
----------------
General-purpose helper utilities for RapidTunes.

Provides directory management, filename sanitisation, file-size formatting,
and URL parsing shortcuts used across the application.
"""

import os
import re
import sys
from pathlib import Path

from rich.console import Console

console = Console()
_err_console = Console(stderr=True)


# ---------------------------------------------------------------------------
# Directory helpers
# ---------------------------------------------------------------------------

def ensure_directory(path: str) -> str:
    """
    Create *path* (and any missing parents) if it does not already exist.

    Returns the absolute path string.  Raises ``OSError`` on failure.
    """
    abs_path = os.path.abspath(path)
    os.makedirs(abs_path, exist_ok=True)
    return abs_path


def default_output_dir() -> str:
    """
    Return the platform-appropriate default download directory.

    Uses ``~/Downloads`` when it exists, otherwise the current working
    directory.
    """
    downloads = Path.home() / "Downloads"
    if downloads.is_dir():
        return str(downloads)
    return os.getcwd()


# ---------------------------------------------------------------------------
# Filename helpers
# ---------------------------------------------------------------------------

def sanitize_filename(name: str, replacement: str = "_") -> str:
    """
    Replace filesystem-unsafe characters in *name* with *replacement*.

    Trims leading/trailing whitespace and dots so the result can be safely
    used as a filename on all major platforms.
    """
    # Characters forbidden on Windows and/or Linux/macOS
    unsafe = r'[<>:"/\\|?*\x00-\x1f]'
    sanitized = re.sub(unsafe, replacement, name)
    # Collapse consecutive replacements and strip edge whitespace/dots
    sanitized = re.sub(rf"{re.escape(replacement)}+", replacement, sanitized)
    return sanitized.strip(" .")


def build_output_path(directory: str, filename: str, extension: str) -> str:
    """
    Combine *directory*, *filename* and *extension* into a full file path.

    If the file already exists a numeric suffix ``(1)``, ``(2)`` … is
    appended to avoid silent overwrites.
    """
    ext = extension.lstrip(".")
    base = os.path.join(directory, f"{filename}.{ext}")

    if not os.path.exists(base):
        return base

    counter = 1
    max_attempts = 10_000
    while counter <= max_attempts:
        candidate = os.path.join(directory, f"{filename} ({counter}).{ext}")
        if not os.path.exists(candidate):
            return candidate
        counter += 1

    raise OSError(
        f"Could not find an available filename for '{filename}.{ext}' "
        f"after {max_attempts} attempts."
    )


# ---------------------------------------------------------------------------
# Display helpers
# ---------------------------------------------------------------------------

def format_filesize(size_bytes: int) -> str:
    """
    Return a human-readable file size string (e.g. ``'3.4 MB'``).

    Accepts negative and zero sizes gracefully.
    """
    if size_bytes <= 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    index = 0
    value = float(size_bytes)
    while value >= 1024 and index < len(units) - 1:
        value /= 1024
        index += 1
    return f"{value:.1f} {units[index]}"


def print_success(message: str) -> None:
    """Print a green success message to stdout."""
    console.print(f"[bold green]✔[/bold green] {message}")


def print_error(message: str) -> None:
    """Print a red error message to stderr."""
    _err_console.print(f"[bold red]✖[/bold red] {message}")


def print_info(message: str) -> None:
    """Print a cyan informational message to stdout."""
    console.print(f"[bold cyan]ℹ[/bold cyan] {message}")


def print_warning(message: str) -> None:
    """Print a yellow warning message to stdout."""
    console.print(f"[bold yellow]⚠[/bold yellow] {message}")


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

def read_urls_from_file(filepath: str) -> list[str]:
    """
    Read a text file and return a list of non-empty, stripped URL strings.

    Lines starting with ``#`` are treated as comments and ignored.
    """
    urls: list[str] = []
    with open(filepath, "r", encoding="utf-8") as fh:
        for line in fh:
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                urls.append(stripped)
    return urls
