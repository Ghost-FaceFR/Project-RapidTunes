// DownloadForm.jsx - URL input form with format/quality selectors and download trigger
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ProgressBar from "./ProgressBar";
import "../styles/DownloadForm.css";

// Available formats
const FORMATS = ["MP3", "MP4", "WAV", "FLAC", "AAC"];

// Quality options mapped by format type
const QUALITY_OPTIONS = {
  MP3: ["128kbps", "320kbps"],
  AAC: ["128kbps", "320kbps"],
  WAV: ["Lossless"],
  FLAC: ["Lossless"],
  MP4: ["720p", "1080p"],
};

function DownloadForm({ outputDir, onDownloadComplete }) {
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState("MP3");
  const [quality, setQuality] = useState("320kbps");
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState(""); // "success" | "error" | ""

  // Update quality when format changes
  const handleFormatChange = (e) => {
    const newFormat = e.target.value;
    setFormat(newFormat);
    setQuality(QUALITY_OPTIONS[newFormat][0]);
  };

  // Handle download button click
  const handleDownload = async () => {
    if (!url.trim()) {
      setStatusMessage("Please enter a valid URL.");
      setStatusType("error");
      return;
    }

    // Determine output directory (use default if not set)
    let dir = outputDir;
    if (!dir) {
      try {
        dir = await invoke("get_default_download_dir");
      } catch {
        dir = ".";
      }
    }

    setIsDownloading(true);
    setStatusMessage("Starting download…");
    setStatusType("");
    setCurrentFile(url);

    // Simulate progress animation while waiting for yt-dlp
    // (yt-dlp does not emit events here; a real implementation would use shell streaming)
    let fakeProgress = 0;
    const timer = setInterval(() => {
      fakeProgress += Math.random() * 8;
      if (fakeProgress > 90) fakeProgress = 90;
      setProgress(Math.round(fakeProgress));
    }, 400);

    try {
      const result = await invoke("download_media", {
        url: url.trim(),
        format: format.toLowerCase(),
        quality: quality,
        outputDir: dir,
      });

      clearInterval(timer);
      setProgress(100);
      setStatusMessage("Download complete!");
      setStatusType("success");
      setCurrentFile("");

      // Notify parent of the new download
      const fileName = url.split("/").pop() || url;
      onDownloadComplete(fileName, dir);

      // Reset after a short delay
      setTimeout(() => {
        setProgress(0);
        setIsDownloading(false);
        setUrl("");
        setStatusMessage("");
        setStatusType("");
      }, 2000);
    } catch (err) {
      clearInterval(timer);
      setProgress(0);
      setIsDownloading(false);
      setStatusMessage(`Error: ${err}`);
      setStatusType("error");
    }
  };

  return (
    <div className="download-form">
      <h2 className="form-title">Download Media</h2>

      {/* URL input */}
      <div className="form-group">
        <label htmlFor="url-input" className="form-label">
          URL (YouTube, etc.)
        </label>
        <input
          id="url-input"
          type="text"
          className="form-input"
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isDownloading}
        />
      </div>

      {/* Format and quality selectors */}
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="format-select" className="form-label">
            Format
          </label>
          <select
            id="format-select"
            className="form-select"
            value={format}
            onChange={handleFormatChange}
            disabled={isDownloading}
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="quality-select" className="form-label">
            Quality
          </label>
          <select
            id="quality-select"
            className="form-select"
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            disabled={isDownloading}
          >
            {QUALITY_OPTIONS[format].map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Download button */}
      <button
        className={`download-btn ${isDownloading ? "downloading" : ""}`}
        onClick={handleDownload}
        disabled={isDownloading}
      >
        {isDownloading ? "Downloading…" : "Download"}
      </button>

      {/* Progress bar (shown while downloading) */}
      {isDownloading && (
        <ProgressBar progress={progress} fileName={currentFile} />
      )}

      {/* Status message */}
      {statusMessage && (
        <p className={`status-message ${statusType}`}>{statusMessage}</p>
      )}
    </div>
  );
}

export default DownloadForm;
