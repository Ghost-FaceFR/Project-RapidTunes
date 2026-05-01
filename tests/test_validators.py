"""
tests/test_validators.py
------------------------
Unit tests for utils/validators.py.
"""

import os
import sys
import tempfile

import pytest

# Ensure the project root is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.validators import (
    validate_url,
    validate_format,
    validate_quality,
    validate_output_dir,
    validate_urls_file,
    validate_local_file,
    SUPPORTED_AUDIO_FORMATS,
    SUPPORTED_VIDEO_FORMATS,
    SUPPORTED_FORMATS,
    AUDIO_QUALITIES,
    VIDEO_QUALITIES,
)


class TestValidateUrl:
    def test_valid_http(self):
        assert validate_url("http://example.com") is True

    def test_valid_https(self):
        assert validate_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ") is True

    def test_invalid_no_scheme(self):
        assert validate_url("www.example.com") is False

    def test_invalid_ftp(self):
        assert validate_url("ftp://example.com/file.mp3") is False

    def test_empty_string(self):
        assert validate_url("") is False

    def test_none(self):
        assert validate_url(None) is False  # type: ignore[arg-type]

    def test_whitespace_only(self):
        assert validate_url("   ") is False

    def test_url_with_port(self):
        assert validate_url("https://example.com:8080/path") is True

    def test_url_with_path_and_query(self):
        assert validate_url("https://example.com/path?key=value&other=123") is True


class TestValidateFormat:
    @pytest.mark.parametrize("fmt", list(SUPPORTED_AUDIO_FORMATS | SUPPORTED_VIDEO_FORMATS))
    def test_supported_formats(self, fmt):
        assert validate_format(fmt) is True

    def test_uppercase_format(self):
        assert validate_format("MP3") is True

    def test_mixed_case(self):
        assert validate_format("Mp4") is True

    def test_unsupported_format(self):
        assert validate_format("xyz") is False

    def test_empty_string(self):
        assert validate_format("") is False

    def test_none(self):
        assert validate_format(None) is False  # type: ignore[arg-type]


class TestValidateQuality:
    @pytest.mark.parametrize("q", ["128", "192", "256", "320"])
    def test_audio_quality(self, q):
        assert validate_quality(q) is True

    @pytest.mark.parametrize("q", ["360p", "480p", "720p", "1080p", "best", "worst"])
    def test_video_quality(self, q):
        assert validate_quality(q) is True

    def test_unsupported_quality(self):
        assert validate_quality("4k") is False

    def test_empty_string(self):
        assert validate_quality("") is False

    def test_none(self):
        assert validate_quality(None) is False  # type: ignore[arg-type]


class TestValidateOutputDir:
    def test_existing_directory(self, tmp_path):
        ok, msg = validate_output_dir(str(tmp_path))
        assert ok is True
        assert msg == ""

    def test_nonexistent_dir_with_existing_parent(self, tmp_path):
        new_dir = str(tmp_path / "new_folder")
        ok, msg = validate_output_dir(new_dir)
        assert ok is True

    def test_path_is_file(self, tmp_path):
        f = tmp_path / "file.txt"
        f.write_text("hello")
        ok, msg = validate_output_dir(str(f))
        assert ok is False
        assert "file" in msg.lower()

    def test_empty_string(self):
        ok, msg = validate_output_dir("")
        assert ok is False

    def test_none(self):
        ok, msg = validate_output_dir(None)  # type: ignore[arg-type]
        assert ok is False


class TestValidateUrlsFile:
    def test_valid_txt_file(self, tmp_path):
        f = tmp_path / "urls.txt"
        f.write_text("https://example.com\nhttps://another.com\n")
        ok, msg = validate_urls_file(str(f))
        assert ok is True

    def test_nonexistent_file(self, tmp_path):
        ok, msg = validate_urls_file(str(tmp_path / "missing.txt"))
        assert ok is False
        assert "not found" in msg.lower()

    def test_wrong_extension(self, tmp_path):
        f = tmp_path / "urls.csv"
        f.write_text("https://example.com\n")
        ok, msg = validate_urls_file(str(f))
        assert ok is False


class TestValidateLocalFile:
    def test_existing_readable_file(self, tmp_path):
        f = tmp_path / "media.mp4"
        f.write_bytes(b"\x00" * 16)
        ok, msg = validate_local_file(str(f))
        assert ok is True
        assert msg == ""

    def test_nonexistent_file(self, tmp_path):
        ok, msg = validate_local_file(str(tmp_path / "missing.mp4"))
        assert ok is False
        assert "not found" in msg.lower()

    def test_empty_string(self):
        ok, msg = validate_local_file("")
        assert ok is False

    def test_none(self):
        ok, msg = validate_local_file(None)  # type: ignore[arg-type]
        assert ok is False
