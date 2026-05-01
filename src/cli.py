"""
src/cli.py
----------
Command-line interface for RapidTunes.

Entry point: ``python main.py <command> [options]``

Sub-commands
------------
download    Download a single URL or a batch from a file.
convert     Convert a local media file to a different format.
extract     Extract audio from a local video file.
batch       Download multiple URLs given on the command line.
"""

import argparse
import sys

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich import box

from src.downloader import Downloader
from src.converter import Converter
from utils.helpers import print_success, print_error, print_info, print_warning
from utils.validators import (
    SUPPORTED_FORMATS,
    SUPPORTED_AUDIO_FORMATS,
    SUPPORTED_VIDEO_FORMATS,
    AUDIO_QUALITIES,
    VIDEO_QUALITIES,
)

console = Console()

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------

_BANNER = (
    "[bold cyan]RapidTunes[/bold cyan] [dim]— Media Downloader & Converter[/dim]"
)


def _print_banner() -> None:
    console.print(Panel(_BANNER, expand=False, border_style="cyan"))


# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    """Return the top-level argument parser."""
    parser = argparse.ArgumentParser(
        prog="rapidtunes",
        description="RapidTunes — Download and convert media from the command line.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=_build_epilog(),
    )
    parser.add_argument(
        "--output-dir", "-o",
        metavar="DIR",
        default=None,
        help="Directory where files will be saved (default: ~/Downloads or cwd).",
    )

    sub = parser.add_subparsers(dest="command", title="sub-commands")

    _add_download_parser(sub)
    _add_batch_parser(sub)
    _add_convert_parser(sub)
    _add_extract_parser(sub)

    return parser


# ---------------------------------------------------------------------------
# Sub-command: download
# ---------------------------------------------------------------------------

def _add_download_parser(sub: argparse._SubParsersAction) -> None:  # type: ignore[name-defined]
    p = sub.add_parser(
        "download",
        help="Download media from a URL.",
        description="Download a single video or audio file from a URL.",
    )
    p.add_argument("url", help="URL to download from.")
    p.add_argument(
        "--format", "-f",
        dest="fmt",
        default="mp4",
        metavar="FORMAT",
        help=f"Output format (default: mp4).  Supported: {', '.join(sorted(SUPPORTED_FORMATS))}",
    )
    p.add_argument(
        "--quality", "-q",
        default="best",
        metavar="QUALITY",
        help=(
            "Quality preset.  Video: 360p, 480p, 720p, 1080p, best, worst.  "
            "Audio: 128, 192, 256, 320 (kbps).  Default: best."
        ),
    )
    p.add_argument(
        "--audio-only", "-a",
        action="store_true",
        help="Extract audio only (even if the format is a video format).",
    )
    p.add_argument(
        "--playlist", "-p",
        action="store_true",
        help="Treat the URL as a playlist and download all entries.",
    )


# ---------------------------------------------------------------------------
# Sub-command: batch
# ---------------------------------------------------------------------------

def _add_batch_parser(sub: argparse._SubParsersAction) -> None:  # type: ignore[name-defined]
    p = sub.add_parser(
        "batch",
        help="Download multiple URLs from a text file or inline list.",
        description=(
            "Download multiple URLs.  Provide a text file (one URL per line) "
            "with --file, or pass URLs directly as positional arguments."
        ),
    )
    p.add_argument(
        "urls",
        nargs="*",
        metavar="URL",
        help="One or more URLs to download.",
    )
    p.add_argument(
        "--file", "-i",
        dest="urls_file",
        metavar="FILE",
        help="Path to a .txt file containing one URL per line.",
    )
    p.add_argument(
        "--format", "-f",
        dest="fmt",
        default="mp4",
        metavar="FORMAT",
        help=f"Output format (default: mp4).  Supported: {', '.join(sorted(SUPPORTED_FORMATS))}",
    )
    p.add_argument(
        "--quality", "-q",
        default="best",
        metavar="QUALITY",
        help="Quality preset.  Default: best.",
    )
    p.add_argument(
        "--audio-only", "-a",
        action="store_true",
        help="Extract audio only.",
    )


# ---------------------------------------------------------------------------
# Sub-command: convert
# ---------------------------------------------------------------------------

def _add_convert_parser(sub: argparse._SubParsersAction) -> None:  # type: ignore[name-defined]
    p = sub.add_parser(
        "convert",
        help="Convert a local media file to a different format.",
        description="Convert a local audio or video file.",
    )
    p.add_argument("input", help="Path to the source media file.")
    p.add_argument(
        "--format", "-f",
        dest="fmt",
        required=True,
        metavar="FORMAT",
        help=f"Target format.  Supported: {', '.join(sorted(SUPPORTED_FORMATS))}",
    )
    p.add_argument(
        "--quality", "-q",
        default=None,
        metavar="QUALITY",
        help=(
            "Quality preset.  Audio bitrate in kbps (128, 192, 256, 320) "
            "or video resolution (720p, 1080p)."
        ),
    )
    p.add_argument(
        "--batch", "-b",
        nargs="+",
        metavar="FILE",
        dest="batch_files",
        help="Convert multiple files.  Provide additional file paths here.",
    )


# ---------------------------------------------------------------------------
# Sub-command: extract
# ---------------------------------------------------------------------------

def _add_extract_parser(sub: argparse._SubParsersAction) -> None:  # type: ignore[name-defined]
    p = sub.add_parser(
        "extract",
        help="Extract audio from a local video file.",
        description="Strip the audio track from a video file and save it as an audio file.",
    )
    p.add_argument("input", help="Path to the source video file.")
    p.add_argument(
        "--format", "-f",
        dest="fmt",
        default="mp3",
        metavar="FORMAT",
        help=f"Audio output format (default: mp3).  Supported: {', '.join(sorted(SUPPORTED_AUDIO_FORMATS))}",
    )
    p.add_argument(
        "--quality", "-q",
        default="192",
        metavar="QUALITY",
        help="Audio bitrate in kbps (128, 192, 256, 320).  Default: 192.",
    )


# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------

def handle_download(args: argparse.Namespace) -> int:
    """Handle the ``download`` sub-command."""
    dl = Downloader(output_dir=args.output_dir)

    if args.playlist:
        success, msg = dl.download_playlist(
            url=args.url,
            fmt=args.fmt,
            quality=args.quality,
            audio_only=args.audio_only,
        )
    else:
        success, msg = dl.download(
            url=args.url,
            fmt=args.fmt,
            quality=args.quality,
            audio_only=args.audio_only,
        )

    if success:
        print_success(msg)
        return 0
    print_error(msg)
    return 1


def handle_batch(args: argparse.Namespace) -> int:
    """Handle the ``batch`` sub-command."""
    dl = Downloader(output_dir=args.output_dir)

    if args.urls_file:
        results = dl.download_from_file(
            filepath=args.urls_file,
            fmt=args.fmt,
            quality=args.quality,
            audio_only=args.audio_only,
        )
    elif args.urls:
        results = dl.download_batch(
            urls=args.urls,
            fmt=args.fmt,
            quality=args.quality,
            audio_only=args.audio_only,
        )
    else:
        print_error("Provide at least one URL or use --file to specify a URLs file.")
        return 1

    _print_batch_summary(results)
    failed = sum(1 for _, ok, _ in results if not ok)
    return 0 if failed == 0 else 1


def handle_convert(args: argparse.Namespace) -> int:
    """Handle the ``convert`` sub-command."""
    conv = Converter(output_dir=args.output_dir)

    files_to_convert = [args.input]
    if args.batch_files:
        files_to_convert.extend(args.batch_files)

    if len(files_to_convert) == 1:
        success, msg = conv.convert(
            input_path=files_to_convert[0],
            output_format=args.fmt,
            quality=args.quality,
        )
        if success:
            print_success(f"Saved to: {msg}")
            return 0
        print_error(msg)
        return 1

    results = conv.batch_convert(
        input_paths=files_to_convert,
        output_format=args.fmt,
        quality=args.quality,
    )
    _print_batch_summary(results, label="Conversion")
    failed = sum(1 for _, ok, _ in results if not ok)
    return 0 if failed == 0 else 1


def handle_extract(args: argparse.Namespace) -> int:
    """Handle the ``extract`` sub-command."""
    conv = Converter(output_dir=args.output_dir)
    success, msg = conv.extract_audio(
        input_path=args.input,
        audio_format=args.fmt,
        quality=args.quality,
    )
    if success:
        print_success(f"Audio saved to: {msg}")
        return 0
    print_error(msg)
    return 1


# ---------------------------------------------------------------------------
# Summary table
# ---------------------------------------------------------------------------

def _print_batch_summary(
    results: list[tuple[str, bool, str]],
    label: str = "Download",
) -> None:
    """Render a rich table summarising batch operation results."""
    table = Table(
        title=f"{label} Summary",
        box=box.SIMPLE_HEAVY,
        show_lines=True,
    )
    table.add_column("File / URL", style="cyan", no_wrap=False)
    table.add_column("Status", justify="center")
    table.add_column("Message")

    for item, ok, msg in results:
        status = "[bold green]✔ OK[/bold green]" if ok else "[bold red]✖ FAIL[/bold red]"
        table.add_row(item, status, msg)

    console.print(table)
    passed = sum(1 for _, ok, _ in results if ok)
    console.print(
        f"\n[bold]Total:[/bold] {len(results)}  "
        f"[green]Passed: {passed}[/green]  "
        f"[red]Failed: {len(results) - passed}[/red]"
    )


# ---------------------------------------------------------------------------
# Epilog
# ---------------------------------------------------------------------------

def _build_epilog() -> str:
    return """
Examples:
  Download a video:
    rapidtunes download "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

  Download audio only in MP3 at 320 kbps:
    rapidtunes download -f mp3 -q 320 "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

  Download a playlist as MP3:
    rapidtunes download --playlist -f mp3 "https://www.youtube.com/playlist?list=..."

  Batch download from a file:
    rapidtunes batch --file urls.txt -f mp4 -q 1080p

  Convert a video to MP3:
    rapidtunes convert video.mp4 -f mp3 -q 320

  Extract audio from a video:
    rapidtunes extract movie.mp4 -f wav

  Save to a custom directory:
    rapidtunes -o /home/user/Music download -f mp3 "https://..."
"""


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    """
    Parse arguments and dispatch to the appropriate handler.

    Returns the process exit code (0 = success, non-zero = failure).
    """
    parser = build_parser()
    args = parser.parse_args(argv)

    _print_banner()

    if args.command is None:
        parser.print_help()
        return 0

    dispatch = {
        "download": handle_download,
        "batch": handle_batch,
        "convert": handle_convert,
        "extract": handle_extract,
    }

    handler = dispatch.get(args.command)
    if handler is None:
        print_error(f"Unknown command: '{args.command}'")
        parser.print_help()
        return 1

    try:
        return handler(args)
    except KeyboardInterrupt:
        console.print("\n[yellow]Interrupted by user.[/yellow]")
        return 130
