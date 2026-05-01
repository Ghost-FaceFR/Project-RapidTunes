"""
tests/test_cli.py
-----------------
Tests for the CLI argument parser and handlers (no real downloads/conversions).

All network calls and ffmpeg invocations are mocked so these tests run
offline in any CI environment.
"""

import os
import sys
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.cli import build_parser, main


# ---------------------------------------------------------------------------
# Parser tests
# ---------------------------------------------------------------------------

class TestParser:
    def setup_method(self):
        self.parser = build_parser()

    def test_download_command_defaults(self):
        args = self.parser.parse_args(["download", "https://example.com"])
        assert args.command == "download"
        assert args.url == "https://example.com"
        assert args.fmt == "mp4"
        assert args.quality == "best"
        assert args.audio_only is False
        assert args.playlist is False

    def test_download_with_options(self):
        args = self.parser.parse_args([
            "download", "https://example.com",
            "--format", "mp3",
            "--quality", "320",
            "--audio-only",
        ])
        assert args.fmt == "mp3"
        assert args.quality == "320"
        assert args.audio_only is True

    def test_batch_command_with_urls(self):
        args = self.parser.parse_args([
            "batch", "https://a.com", "https://b.com",
        ])
        assert args.command == "batch"
        assert args.urls == ["https://a.com", "https://b.com"]

    def test_batch_command_with_file(self):
        args = self.parser.parse_args(["batch", "--file", "urls.txt"])
        assert args.urls_file == "urls.txt"

    def test_convert_command(self):
        args = self.parser.parse_args(["convert", "video.mp4", "--format", "mp3"])
        assert args.command == "convert"
        assert args.input == "video.mp4"
        assert args.fmt == "mp3"

    def test_extract_command_defaults(self):
        args = self.parser.parse_args(["extract", "movie.mp4"])
        assert args.command == "extract"
        assert args.input == "movie.mp4"
        assert args.fmt == "mp3"
        assert args.quality == "192"

    def test_global_output_dir(self):
        args = self.parser.parse_args([
            "--output-dir", "/tmp/music",
            "download", "https://example.com",
        ])
        assert args.output_dir == "/tmp/music"

    def test_no_command_returns_zero(self):
        exit_code = main([])
        assert exit_code == 0


# ---------------------------------------------------------------------------
# Handler tests (mocked I/O)
# ---------------------------------------------------------------------------

class TestHandleDownload:
    def test_invalid_url_returns_1(self):
        exit_code = main(["download", "not-a-valid-url"])
        assert exit_code == 1

    @patch("src.cli.Downloader")
    def test_valid_download_success(self, MockDownloader):
        instance = MockDownloader.return_value
        instance.download.return_value = (True, "Downloaded OK")
        exit_code = main(["download", "https://example.com"])
        assert exit_code == 0
        instance.download.assert_called_once()

    @patch("src.cli.Downloader")
    def test_valid_download_failure(self, MockDownloader):
        instance = MockDownloader.return_value
        instance.download.return_value = (False, "Network error")
        exit_code = main(["download", "https://example.com"])
        assert exit_code == 1

    @patch("src.cli.Downloader")
    def test_playlist_calls_download_playlist(self, MockDownloader):
        instance = MockDownloader.return_value
        instance.download_playlist.return_value = (True, "Playlist downloaded")
        exit_code = main(["download", "--playlist", "https://example.com/playlist"])
        assert exit_code == 0
        instance.download_playlist.assert_called_once()


class TestHandleBatch:
    def test_no_urls_no_file_returns_1(self):
        exit_code = main(["batch"])
        assert exit_code == 1

    @patch("src.cli.Downloader")
    def test_batch_inline_urls(self, MockDownloader):
        instance = MockDownloader.return_value
        instance.download_batch.return_value = [
            ("https://a.com", True, "OK"),
            ("https://b.com", True, "OK"),
        ]
        exit_code = main(["batch", "https://a.com", "https://b.com"])
        assert exit_code == 0
        instance.download_batch.assert_called_once()

    @patch("src.cli.Downloader")
    def test_batch_with_file(self, MockDownloader, tmp_path):
        f = tmp_path / "urls.txt"
        f.write_text("https://a.com\nhttps://b.com\n")
        instance = MockDownloader.return_value
        instance.download_from_file.return_value = [
            ("https://a.com", True, "OK"),
        ]
        exit_code = main(["batch", "--file", str(f)])
        assert exit_code == 0
        instance.download_from_file.assert_called_once()

    @patch("src.cli.Downloader")
    def test_batch_with_failures_returns_1(self, MockDownloader):
        instance = MockDownloader.return_value
        instance.download_batch.return_value = [
            ("https://a.com", False, "Error"),
        ]
        exit_code = main(["batch", "https://a.com"])
        assert exit_code == 1


class TestHandleConvert:
    @patch("src.cli.Converter")
    def test_convert_success(self, MockConverter, tmp_path):
        f = tmp_path / "video.mp4"
        f.touch()
        instance = MockConverter.return_value
        instance.convert.return_value = (True, str(tmp_path / "video.mp3"))
        exit_code = main(["convert", str(f), "--format", "mp3"])
        assert exit_code == 0

    @patch("src.cli.Converter")
    def test_convert_failure(self, MockConverter, tmp_path):
        f = tmp_path / "video.mp4"
        f.touch()
        instance = MockConverter.return_value
        instance.convert.return_value = (False, "ffmpeg error")
        exit_code = main(["convert", str(f), "--format", "mp3"])
        assert exit_code == 1


class TestHandleExtract:
    @patch("src.cli.Converter")
    def test_extract_success(self, MockConverter, tmp_path):
        f = tmp_path / "movie.mp4"
        f.touch()
        instance = MockConverter.return_value
        instance.extract_audio.return_value = (True, str(tmp_path / "movie.mp3"))
        exit_code = main(["extract", str(f)])
        assert exit_code == 0

    @patch("src.cli.Converter")
    def test_extract_failure(self, MockConverter, tmp_path):
        f = tmp_path / "movie.mp4"
        f.touch()
        instance = MockConverter.return_value
        instance.extract_audio.return_value = (False, "No audio stream")
        exit_code = main(["extract", str(f)])
        assert exit_code == 1
