// Settings.jsx - Application settings: output directory selection
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "../styles/Settings.css";

/**
 * Settings panel for configuring global app preferences.
 *
 * Props:
 * - outputDir (string): current output directory path
 * - setOutputDir (function): setter to update output directory in parent state
 */
function Settings({ outputDir, setOutputDir }) {
  const [dirInput, setDirInput] = useState(outputDir);
  const [saved, setSaved] = useState(false);

  // Load default download directory on first render if none is set
  useEffect(() => {
    if (!outputDir) {
      invoke("get_default_download_dir")
        .then((dir) => {
          setDirInput(dir);
          setOutputDir(dir);
        })
        .catch(console.error);
    }
  }, []);

  // Open a native folder picker dialog (Tauri dialog plugin)
  const handleBrowse = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: dirInput || undefined,
        title: "Select Download Folder",
      });
      if (selected && typeof selected === "string") {
        setDirInput(selected);
      }
    } catch (err) {
      console.error("Dialog error:", err);
    }
  };

  // Save the currently typed/selected directory
  const handleSave = () => {
    setOutputDir(dirInput);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="settings-panel">
      <h2 className="settings-title">Settings</h2>

      <div className="settings-section">
        <h3 className="settings-section-title">Download Location</h3>
        <p className="settings-description">
          Choose the folder where downloaded files will be saved.
        </p>

        <div className="settings-dir-row">
          <input
            type="text"
            className="settings-dir-input"
            value={dirInput}
            onChange={(e) => setDirInput(e.target.value)}
            placeholder="e.g. /home/user/Downloads"
          />
          <button className="browse-btn" onClick={handleBrowse}>
            Browse…
          </button>
        </div>

        <button className="save-btn" onClick={handleSave}>
          {saved ? "Saved ✓" : "Save Settings"}
        </button>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">About</h3>
        <p className="settings-description">
          <strong>RapidTunes</strong> v0.1.0
        </p>
        <p className="settings-description">
          Requires <code>yt-dlp</code> and <code>ffmpeg</code> to be installed
          and available in your system PATH.
        </p>
      </div>
    </div>
  );
}

export default Settings;
