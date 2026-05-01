"""
tests/test_converter.py
-----------------------
Tests for the Converter facade (src/converter.py).

ffmpeg calls are mocked so these tests run without ffmpeg installed.
"""

import os
import sys
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.converter import Converter


# ---------------------------------------------------------------------------
# Helper: create a dummy media file
# ---------------------------------------------------------------------------

def _make_file(tmp_path, name="video.mp4") -> str:
    f = tmp_path / name
    f.write_bytes(b"\x00" * 32)
    return str(f)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestConverterValidation:
    def test_unsupported_format_rejected(self, tmp_path):
        src = _make_file(tmp_path)
        conv = Converter(output_dir=str(tmp_path))
        with patch("src.converter.ffmpeg_available", return_value=True):
            success, msg = conv.convert(src, "xyz")
        assert success is False
        assert "unsupported" in msg.lower()

    def test_missing_file_rejected(self, tmp_path):
        conv = Converter(output_dir=str(tmp_path))
        with patch("src.converter.ffmpeg_available", return_value=True):
            success, msg = conv.convert(str(tmp_path / "missing.mp4"), "mp3")
        assert success is False
        assert "not found" in msg.lower()

    def test_ffmpeg_not_available_returns_error(self, tmp_path):
        src = _make_file(tmp_path)
        conv = Converter(output_dir=str(tmp_path))
        with patch("src.converter.ffmpeg_available", return_value=False):
            success, msg = conv.convert(src, "mp3")
        assert success is False
        assert "ffmpeg" in msg.lower()


class TestConverterConvert:
    def test_successful_conversion(self, tmp_path):
        src = _make_file(tmp_path)
        conv = Converter(output_dir=str(tmp_path))
        with patch("src.converter.ffmpeg_available", return_value=True), \
             patch.object(conv._service, "convert", return_value=(True, "/out/video.mp3")):
            success, msg = conv.convert(src, "mp3", quality="320")
        assert success is True

    def test_failed_conversion(self, tmp_path):
        src = _make_file(tmp_path)
        conv = Converter(output_dir=str(tmp_path))
        with patch("src.converter.ffmpeg_available", return_value=True), \
             patch.object(conv._service, "convert", return_value=(False, "codec error")):
            success, msg = conv.convert(src, "mp3")
        assert success is False

    def test_unknown_quality_does_not_block(self, tmp_path):
        src = _make_file(tmp_path)
        conv = Converter(output_dir=str(tmp_path))
        with patch("src.converter.ffmpeg_available", return_value=True), \
             patch.object(conv._service, "convert", return_value=(True, "/out/video.mp3")):
            # "999" is not a recognised quality; convert should still proceed
            success, msg = conv.convert(src, "mp3", quality="999")
        assert success is True


class TestConverterExtractAudio:
    def test_video_format_as_audio_rejected(self, tmp_path):
        src = _make_file(tmp_path)
        conv = Converter(output_dir=str(tmp_path))
        with patch("src.converter.ffmpeg_available", return_value=True):
            success, msg = conv.extract_audio(src, audio_format="mp4")
        assert success is False
        assert "video format" in msg.lower()

    def test_extract_audio_success(self, tmp_path):
        src = _make_file(tmp_path)
        conv = Converter(output_dir=str(tmp_path))
        with patch("src.converter.ffmpeg_available", return_value=True), \
             patch.object(conv._service, "extract_audio", return_value=(True, "/out/video.mp3")):
            success, msg = conv.extract_audio(src, audio_format="mp3")
        assert success is True


class TestConverterBatch:
    def test_ffmpeg_not_available_fails_all(self, tmp_path):
        files = [_make_file(tmp_path, f"v{i}.mp4") for i in range(3)]
        conv = Converter(output_dir=str(tmp_path))
        with patch("src.converter.ffmpeg_available", return_value=False):
            results = conv.batch_convert(files, "mp3")
        assert all(not ok for _, ok, _ in results)

    def test_unsupported_format_fails_all(self, tmp_path):
        files = [_make_file(tmp_path, f"v{i}.mp4") for i in range(2)]
        conv = Converter(output_dir=str(tmp_path))
        with patch("src.converter.ffmpeg_available", return_value=True):
            results = conv.batch_convert(files, "xyz")
        assert all(not ok for _, ok, _ in results)

    def test_batch_success(self, tmp_path):
        files = [_make_file(tmp_path, f"v{i}.mp4") for i in range(2)]
        conv = Converter(output_dir=str(tmp_path))
        with patch("src.converter.ffmpeg_available", return_value=True), \
             patch.object(conv._service, "batch_convert", return_value=[
                 (files[0], True, "/out/v0.mp3"),
                 (files[1], True, "/out/v1.mp3"),
             ]):
            results = conv.batch_convert(files, "mp3")
        assert all(ok for _, ok, _ in results)
