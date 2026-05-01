"""
tests/test_downloader.py
------------------------
Tests for the Downloader facade (src/downloader.py).

Network calls are mocked so these tests run offline.
"""

import os
import sys
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.downloader import Downloader


class TestDownloaderValidation:
    def test_invalid_url_rejected(self, tmp_path):
        dl = Downloader(output_dir=str(tmp_path))
        success, msg = dl.download("not-a-url")
        assert success is False
        assert "invalid" in msg.lower()

    def test_empty_url_rejected(self, tmp_path):
        dl = Downloader(output_dir=str(tmp_path))
        success, msg = dl.download("")
        assert success is False

    def test_batch_filters_invalid_urls(self, tmp_path):
        dl = Downloader(output_dir=str(tmp_path))
        with patch.object(dl._service, "download_batch", return_value=[]) as mock_batch:
            dl.download_batch(["not-valid", "https://valid.com"])
            # Only the valid URL should reach the service
            call_args = mock_batch.call_args
            urls_arg = call_args[1]["urls"] if call_args[1] else call_args[0][0]
            assert "not-valid" not in urls_arg
            assert "https://valid.com" in urls_arg

    def test_all_invalid_urls_returns_empty(self, tmp_path):
        dl = Downloader(output_dir=str(tmp_path))
        results = dl.download_batch(["bad1", "bad2"])
        assert results == []


class TestDownloaderFromFile:
    def test_missing_file_returns_empty(self, tmp_path):
        dl = Downloader(output_dir=str(tmp_path))
        results = dl.download_from_file(str(tmp_path / "missing.txt"))
        assert results == []

    def test_empty_file_returns_empty(self, tmp_path):
        f = tmp_path / "urls.txt"
        f.write_text("")
        dl = Downloader(output_dir=str(tmp_path))
        results = dl.download_from_file(str(f))
        assert results == []

    def test_reads_urls_from_file(self, tmp_path):
        f = tmp_path / "urls.txt"
        f.write_text("https://a.com\nhttps://b.com\n")
        dl = Downloader(output_dir=str(tmp_path))
        with patch.object(dl._service, "download_batch", return_value=[
            ("https://a.com", True, "OK"),
            ("https://b.com", True, "OK"),
        ]) as mock_batch:
            results = dl.download_from_file(str(f))
            assert len(results) == 2


class TestDownloaderPlaylist:
    def test_invalid_playlist_url_rejected(self, tmp_path):
        dl = Downloader(output_dir=str(tmp_path))
        success, msg = dl.download_playlist("not-a-url")
        assert success is False

    def test_valid_playlist_url_delegated(self, tmp_path):
        dl = Downloader(output_dir=str(tmp_path))
        with patch.object(dl._service, "download_playlist", return_value=(True, "Done")):
            success, msg = dl.download_playlist("https://example.com/playlist")
            assert success is True
