"""
main.py
-------
Entry point for RapidTunes — Media Downloader and Converter.

Run this file directly::

    python main.py <command> [options]

Or install the package and use the ``rapidtunes`` command.
"""

import sys
import os

# ---------------------------------------------------------------------------
# Ensure the project root is on sys.path so all internal imports resolve
# when the script is executed from any working directory.
# ---------------------------------------------------------------------------
_PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from src.cli import main  # noqa: E402 — import after path setup

if __name__ == "__main__":
    sys.exit(main())
