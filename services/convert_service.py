"""
services/convert_service.py
----------------------------
Media conversion service for RapidTunes.

Uses ffmpeg (via subprocess) to convert between audio and video formats.
ffmpeg must be installed and available on the system PATH.
"""

import os
import shutil
import subprocess
from typing import Optional

from utils.helpers import (
    ensure_directory,
    build_output_path,
    print_info,
    print_success,
    print_error,
    sanitize_filename,
)
from utils.validators import (
    validate_local_file,
    SUPPORTED_AUDIO_FORMATS,
    SUPPORTED_VIDEO_FORMATS,
    AUDIO_QUALITIES,
)


# ---------------------------------------------------------------------------
# ffmpeg availability check
# ---------------------------------------------------------------------------

def ffmpeg_available() -> bool:
    """Return True when ffmpeg is found on the system PATH."""
    return shutil.which("ffmpeg") is not None


# ---------------------------------------------------------------------------
# Codec maps
# ---------------------------------------------------------------------------

# Maps output format -> ffmpeg audio codec
_AUDIO_CODEC: dict[str, str] = {
    "mp3": "libmp3lame",
    "wav": "pcm_s16le",
    "flac": "flac",
    "aac": "aac",
    "m4a": "aac",
    "ogg": "libvorbis",
}

# Maps output format -> ffmpeg video codec (for re-encoding; usually copy is faster)
_VIDEO_CODEC: dict[str, str] = {
    "mp4": "libx264",
    "mkv": "libx264",
    "webm": "libvpx-vp9",
    "avi": "libxvid",
    "mov": "libx264",
}


# ---------------------------------------------------------------------------
# ConvertService
# ---------------------------------------------------------------------------

class ConvertService:
    """
    Service for converting local media files to different formats.

    All public methods return a ``(success: bool, message: str)`` tuple.
    """

    def __init__(self, output_dir: Optional[str] = None) -> None:
        """
        Parameters
        ----------
        output_dir:
            Directory where converted files are saved.  When None the
            converted file is placed next to the source file.
        """
        self.output_dir = output_dir

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def convert(
        self,
        input_path: str,
        output_format: str,
        quality: Optional[str] = None,
        extract_audio: bool = False,
    ) -> tuple[bool, str]:
        """
        Convert *input_path* to *output_format*.

        Parameters
        ----------
        input_path:
            Absolute or relative path to the source file.
        output_format:
            Target format string, e.g. ``"mp3"`` or ``"mp4"``.
        quality:
            Quality hint.  For audio: bitrate in kbps (e.g. ``"320"``).
            For video: resolution (e.g. ``"1080p"``).
        extract_audio:
            When True, strip all video streams and keep only audio.

        Returns
        -------
        (True, output_path) on success, (False, error_message) on failure.
        """
        if not ffmpeg_available():
            return (
                False,
                "ffmpeg is not installed or not on PATH.  "
                "Install ffmpeg and ensure it is accessible.",
            )

        ok, msg = validate_local_file(input_path)
        if not ok:
            return False, msg

        output_format = output_format.strip().lower()

        all_formats = SUPPORTED_AUDIO_FORMATS | SUPPORTED_VIDEO_FORMATS
        if output_format not in all_formats:
            return False, f"Unsupported output format: '{output_format}'"

        # Determine where to save the output
        input_path = os.path.abspath(input_path)
        out_dir = self.output_dir or os.path.dirname(input_path)
        out_dir = ensure_directory(out_dir)

        stem = os.path.splitext(os.path.basename(input_path))[0]
        output_path = build_output_path(out_dir, sanitize_filename(stem), output_format)

        # Build ffmpeg command
        cmd = self._build_ffmpeg_cmd(
            input_path=input_path,
            output_path=output_path,
            output_format=output_format,
            quality=quality,
            extract_audio=extract_audio,
        )

        print_info(f"Converting '{os.path.basename(input_path)}' → '{output_format}' …")

        success, error = _run_ffmpeg(cmd)
        if success:
            return True, output_path
        return False, error

    def extract_audio(
        self,
        input_path: str,
        audio_format: str = "mp3",
        quality: Optional[str] = "192",
    ) -> tuple[bool, str]:
        """
        Convenience wrapper: extract the audio track from *input_path*.

        Equivalent to calling :meth:`convert` with ``extract_audio=True``.
        """
        return self.convert(
            input_path=input_path,
            output_format=audio_format,
            quality=quality,
            extract_audio=True,
        )

    def batch_convert(
        self,
        input_paths: list[str],
        output_format: str,
        quality: Optional[str] = None,
        extract_audio: bool = False,
    ) -> list[tuple[str, bool, str]]:
        """
        Convert multiple files.

        Returns a list of ``(input_path, success, message)`` tuples.
        """
        results: list[tuple[str, bool, str]] = []
        total = len(input_paths)
        for index, path in enumerate(input_paths, start=1):
            print_info(f"[{index}/{total}] {path}")
            success, message = self.convert(
                input_path=path,
                output_format=output_format,
                quality=quality,
                extract_audio=extract_audio,
            )
            results.append((path, success, message))
            if success:
                print_success(f"Saved to: {message}")
            else:
                print_error(message)
        return results

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_ffmpeg_cmd(
        self,
        input_path: str,
        output_path: str,
        output_format: str,
        quality: Optional[str],
        extract_audio: bool,
    ) -> list[str]:
        """Assemble the ffmpeg command list."""
        cmd = ["ffmpeg", "-y", "-i", input_path]

        is_audio_output = output_format in SUPPORTED_AUDIO_FORMATS

        if extract_audio or is_audio_output:
            # Strip video stream
            cmd += ["-vn"]
            codec = _AUDIO_CODEC.get(output_format, "copy")
            cmd += ["-acodec", codec]
            # Apply bitrate when converting to a lossy audio format
            if quality and quality in AUDIO_QUALITIES:
                if output_format in {"mp3", "aac", "m4a", "ogg"}:
                    cmd += ["-ab", f"{quality}k"]
        else:
            # Video conversion: copy audio, re-encode video if needed
            vcodec = _VIDEO_CODEC.get(output_format, "copy")
            cmd += ["-vcodec", vcodec, "-acodec", "copy"]

            if quality and quality.endswith("p") and quality[:-1].isdigit():
                height = quality[:-1]
                # Scale to target height while keeping aspect ratio
                cmd += ["-vf", f"scale=-2:{height}"]

        cmd.append(output_path)
        return cmd


# ---------------------------------------------------------------------------
# Subprocess runner
# ---------------------------------------------------------------------------

def _run_ffmpeg(cmd: list[str]) -> tuple[bool, str]:
    """
    Execute *cmd* and return ``(True, '')`` on success or
    ``(False, stderr_output)`` on failure.
    """
    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        if result.returncode == 0:
            return True, ""
        return False, result.stderr.strip()
    except FileNotFoundError:
        return False, "ffmpeg executable not found.  Please install ffmpeg."
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)
