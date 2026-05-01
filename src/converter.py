"""
src/converter.py
----------------
High-level converter interface for RapidTunes.

Provides the :class:`Converter` facade over
:class:`~services.convert_service.ConvertService` with user-facing
validation and summary reporting.
"""

from typing import Optional

from services.convert_service import ConvertService, ffmpeg_available
from utils.helpers import (
    default_output_dir,
    ensure_directory,
    print_info,
    print_success,
    print_error,
    print_warning,
)
from utils.validators import (
    validate_local_file,
    validate_format,
    validate_quality,
    SUPPORTED_AUDIO_FORMATS,
    SUPPORTED_VIDEO_FORMATS,
)


class Converter:
    """
    Facade over :class:`ConvertService` with validation and pretty reporting.

    Usage example::

        conv = Converter(output_dir="/tmp/converted")
        success, msg = conv.convert("video.mp4", "mp3", quality="320")
    """

    def __init__(self, output_dir: Optional[str] = None) -> None:
        out = output_dir or default_output_dir()
        self._service = ConvertService(output_dir=ensure_directory(out))

    # ------------------------------------------------------------------
    # Single file conversion
    # ------------------------------------------------------------------

    def convert(
        self,
        input_path: str,
        output_format: str,
        quality: Optional[str] = None,
    ) -> tuple[bool, str]:
        """
        Convert *input_path* to *output_format*.

        Returns
        -------
        (True, output_path) on success, (False, error_message) on failure.
        """
        if not ffmpeg_available():
            return (
                False,
                "ffmpeg is not installed.  Please install ffmpeg to use the converter.",
            )

        ok, msg = validate_local_file(input_path)
        if not ok:
            return False, msg

        if not validate_format(output_format):
            return (
                False,
                f"Unsupported format '{output_format}'.  "
                f"Supported: {', '.join(sorted(SUPPORTED_AUDIO_FORMATS | SUPPORTED_VIDEO_FORMATS))}",
            )

        if quality and not validate_quality(quality):
            print_warning(
                f"Unrecognised quality '{quality}'; proceeding without quality constraint."
            )
            quality = None

        return self._service.convert(
            input_path=input_path,
            output_format=output_format,
            quality=quality,
        )

    # ------------------------------------------------------------------
    # Audio extraction
    # ------------------------------------------------------------------

    def extract_audio(
        self,
        input_path: str,
        audio_format: str = "mp3",
        quality: Optional[str] = "192",
    ) -> tuple[bool, str]:
        """
        Extract audio from *input_path* and save it as *audio_format*.

        Returns
        -------
        (True, output_path) on success, (False, error_message) on failure.
        """
        if not ffmpeg_available():
            return (
                False,
                "ffmpeg is not installed.  Please install ffmpeg to use the converter.",
            )

        ok, msg = validate_local_file(input_path)
        if not ok:
            return False, msg

        if not validate_format(audio_format):
            return False, f"Unsupported audio format: '{audio_format}'"

        if audio_format not in SUPPORTED_AUDIO_FORMATS:
            return (
                False,
                f"'{audio_format}' is a video format.  "
                f"Choose one of: {', '.join(sorted(SUPPORTED_AUDIO_FORMATS))}",
            )

        return self._service.extract_audio(
            input_path=input_path,
            audio_format=audio_format,
            quality=quality,
        )

    # ------------------------------------------------------------------
    # Batch conversion
    # ------------------------------------------------------------------

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
        if not ffmpeg_available():
            print_error("ffmpeg is not installed.  Cannot convert files.")
            return [(p, False, "ffmpeg not available") for p in input_paths]

        if not validate_format(output_format):
            print_error(f"Unsupported format: '{output_format}'")
            return [(p, False, f"Unsupported format: {output_format}") for p in input_paths]

        return self._service.batch_convert(
            input_paths=input_paths,
            output_format=output_format,
            quality=quality,
            extract_audio=extract_audio,
        )
