// FileList.jsx - Displays the list of downloaded files with folder open option
import { invoke } from "@tauri-apps/api/core";
import "../styles/FileList.css";

/**
 * FileList shows all completed downloads and lets the user open their directory.
 *
 * Props:
 * - files (Array<{ name, dir, date }>): list of downloaded file records
 */
function FileList({ files }) {
  // Open the folder containing the file in the system file explorer
  const handleOpenFolder = async (dir) => {
    try {
      await invoke("open_folder", { path: dir });
    } catch (err) {
      console.error("Could not open folder:", err);
    }
  };

  if (files.length === 0) {
    return (
      <div className="file-list empty">
        <p className="file-list-empty">No downloads yet. Start a download above!</p>
      </div>
    );
  }

  return (
    <div className="file-list">
      <h3 className="file-list-title">Recent Downloads</h3>
      <ul className="file-list-items">
        {files.map((file, index) => (
          <li key={index} className="file-list-item">
            <div className="file-info">
              <span className="file-icon">🎵</span>
              <div className="file-details">
                <span className="file-name">{file.name}</span>
                <span className="file-meta">
                  {file.date} — {file.dir}
                </span>
              </div>
            </div>
            <button
              className="open-folder-btn"
              onClick={() => handleOpenFolder(file.dir)}
              title="Open containing folder"
            >
              📂 Open Folder
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default FileList;
