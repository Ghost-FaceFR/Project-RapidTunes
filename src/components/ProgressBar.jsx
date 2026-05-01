// ProgressBar.jsx - Visual download progress bar component
import "../styles/ProgressBar.css";

/**
 * ProgressBar displays the current download progress.
 *
 * Props:
 * - progress (number): 0–100
 * - fileName (string): name/label of the file being downloaded
 */
function ProgressBar({ progress, fileName }) {
  return (
    <div className="progress-container">
      {/* File label */}
      {fileName && (
        <p className="progress-filename" title={fileName}>
          {fileName.length > 60 ? fileName.slice(0, 57) + "…" : fileName}
        </p>
      )}

      {/* Progress track */}
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${Math.min(progress, 100)}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Percentage label */}
      <span className="progress-percent">{Math.min(progress, 100)}%</span>
    </div>
  );
}

export default ProgressBar;
