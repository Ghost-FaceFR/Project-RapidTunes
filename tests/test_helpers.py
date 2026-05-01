"""
tests/test_helpers.py
---------------------
Unit tests for utils/helpers.py.
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.helpers import (
    ensure_directory,
    sanitize_filename,
    build_output_path,
    format_filesize,
    read_urls_from_file,
    default_output_dir,
)


class TestEnsureDirectory:
    def test_creates_missing_dir(self, tmp_path):
        new_dir = str(tmp_path / "new" / "nested")
        result = ensure_directory(new_dir)
        assert os.path.isdir(result)

    def test_returns_existing_dir(self, tmp_path):
        result = ensure_directory(str(tmp_path))
        assert result == str(tmp_path)

    def test_returns_absolute_path(self, tmp_path):
        result = ensure_directory(str(tmp_path))
        assert os.path.isabs(result)


class TestSanitizeFilename:
    def test_removes_forbidden_chars(self):
        result = sanitize_filename('file<>:"/\\|?*.txt')
        assert "<" not in result
        assert ">" not in result
        assert ":" not in result

    def test_replaces_with_custom_char(self):
        result = sanitize_filename("bad:name", replacement="-")
        assert "-" in result

    def test_clean_name_unchanged(self):
        assert sanitize_filename("My Song 2024") == "My Song 2024"

    def test_strips_edge_dots(self):
        result = sanitize_filename("...filename...")
        assert not result.startswith(".")
        assert not result.endswith(".")

    def test_collapses_consecutive_replacements(self):
        result = sanitize_filename("a::b", replacement="_")
        assert "__" not in result


class TestBuildOutputPath:
    def test_basic_path(self, tmp_path):
        path = build_output_path(str(tmp_path), "song", "mp3")
        assert path.endswith(".mp3")
        assert "song" in path

    def test_increments_on_conflict(self, tmp_path):
        # Create the base file first
        base = tmp_path / "song.mp3"
        base.touch()
        path = build_output_path(str(tmp_path), "song", "mp3")
        assert "(1)" in path

    def test_increments_multiple_conflicts(self, tmp_path):
        for i in range(3):
            suffix = f" ({i})" if i else ""
            (tmp_path / f"song{suffix}.mp3").touch()
        path = build_output_path(str(tmp_path), "song", "mp3")
        assert os.path.basename(path) == "song (3).mp3"


class TestFormatFilesize:
    def test_bytes(self):
        assert format_filesize(512) == "512.0 B"

    def test_kilobytes(self):
        result = format_filesize(2048)
        assert "KB" in result

    def test_megabytes(self):
        result = format_filesize(5 * 1024 * 1024)
        assert "MB" in result

    def test_gigabytes(self):
        result = format_filesize(2 * 1024 ** 3)
        assert "GB" in result

    def test_zero(self):
        assert format_filesize(0) == "0 B"

    def test_negative(self):
        assert format_filesize(-100) == "0 B"


class TestReadUrlsFromFile:
    def test_reads_valid_urls(self, tmp_path):
        f = tmp_path / "urls.txt"
        f.write_text("https://a.com\nhttps://b.com\n")
        urls = read_urls_from_file(str(f))
        assert urls == ["https://a.com", "https://b.com"]

    def test_skips_blank_lines(self, tmp_path):
        f = tmp_path / "urls.txt"
        f.write_text("\nhttps://a.com\n\n")
        urls = read_urls_from_file(str(f))
        assert urls == ["https://a.com"]

    def test_skips_comments(self, tmp_path):
        f = tmp_path / "urls.txt"
        f.write_text("# This is a comment\nhttps://a.com\n")
        urls = read_urls_from_file(str(f))
        assert urls == ["https://a.com"]

    def test_empty_file(self, tmp_path):
        f = tmp_path / "urls.txt"
        f.write_text("")
        urls = read_urls_from_file(str(f))
        assert urls == []


class TestDefaultOutputDir:
    def test_returns_string(self):
        result = default_output_dir()
        assert isinstance(result, str)
        assert len(result) > 0
