// downloader.rs - Media download logic using yt-dlp

use std::process::Command;

/// Downloads media from a URL using yt-dlp.
///
/// # Arguments
/// * `url` - The URL to download from (YouTube, etc.)
/// * `format` - The desired output format (mp3, mp4, wav, flac, aac)
/// * `quality` - The desired quality (128kbps, 320kbps, 720p, 1080p)
/// * `output_dir` - The directory where the file will be saved
///
/// # Returns
/// * `Ok(String)` - Success message with the output path
/// * `Err(String)` - Error message if the download fails
#[tauri::command]
pub fn download_media(
    url: String,
    format: String,
    quality: String,
    output_dir: String,
) -> Result<String, String> {
    // Build yt-dlp arguments based on format and quality
    let mut args: Vec<String> = Vec::new();

    // Set output template: save to the chosen directory with title as filename
    let output_template = format!("{}/%(title)s.%(ext)s", output_dir);
    args.push("-o".to_string());
    args.push(output_template);

    // Determine format-specific arguments
    match format.to_lowercase().as_str() {
        "mp3" => {
            // Extract audio and convert to mp3
            args.push("-x".to_string());
            args.push("--audio-format".to_string());
            args.push("mp3".to_string());
            // Set audio quality: 0 = best, 9 = worst; or kbps for mp3
            let audio_quality = match quality.as_str() {
                "320kbps" => "0",
                "128kbps" => "5",
                _ => "2",
            };
            args.push("--audio-quality".to_string());
            args.push(audio_quality.to_string());
        }
        "wav" => {
            args.push("-x".to_string());
            args.push("--audio-format".to_string());
            args.push("wav".to_string());
        }
        "flac" => {
            args.push("-x".to_string());
            args.push("--audio-format".to_string());
            args.push("flac".to_string());
        }
        "aac" => {
            args.push("-x".to_string());
            args.push("--audio-format".to_string());
            args.push("aac".to_string());
        }
        "mp4" => {
            // Download video in the specified quality
            let format_spec = match quality.as_str() {
                "1080p" => "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
                "720p" => "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best",
                _ => "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            };
            args.push("-f".to_string());
            args.push(format_spec.to_string());
            // Merge into mp4
            args.push("--merge-output-format".to_string());
            args.push("mp4".to_string());
        }
        _ => {
            return Err(format!("Unsupported format: {}", format));
        }
    }

    // Add the URL as the last argument
    args.push(url.clone());

    // Run yt-dlp
    let output = Command::new("yt-dlp")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run yt-dlp: {}. Make sure yt-dlp is installed.", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(format!(
            "Download completed successfully.\n{}",
            stdout
        ))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("yt-dlp error: {}", stderr))
    }
}
