// App.jsx - Main application component with tab-based navigation
import { useState } from "react";
import DownloadForm from "./components/DownloadForm";
import FileList from "./components/FileList";
import Settings from "./components/Settings";
import "./styles/App.css";

function App() {
  // Active tab: "download" or "settings"
  const [activeTab, setActiveTab] = useState("download");

  // List of completed downloads shared across components
  const [downloadedFiles, setDownloadedFiles] = useState([]);

  // Global settings: output directory
  const [outputDir, setOutputDir] = useState("");

  // Called by DownloadForm when a download completes successfully
  const handleDownloadComplete = (fileName, dir) => {
    setDownloadedFiles((prev) => [
      { name: fileName, dir: dir, date: new Date().toLocaleString() },
      ...prev,
    ]);
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <span className="logo-icon">🎵</span>
          <span className="logo-text">RapidTunes</span>
        </div>
        <nav className="app-nav">
          <button
            className={`nav-btn ${activeTab === "download" ? "active" : ""}`}
            onClick={() => setActiveTab("download")}
          >
            Download
          </button>
          <button
            className={`nav-btn ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            Settings
          </button>
        </nav>
      </header>

      {/* Main content */}
      <main className="app-main">
        {activeTab === "download" && (
          <>
            <DownloadForm
              outputDir={outputDir}
              onDownloadComplete={handleDownloadComplete}
            />
            <FileList files={downloadedFiles} />
          </>
        )}
        {activeTab === "settings" && (
          <Settings outputDir={outputDir} setOutputDir={setOutputDir} />
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <span>RapidTunes v0.1.0 — Powered by yt-dlp &amp; ffmpeg</span>
      </footer>
    </div>
  );
}

export default App;
