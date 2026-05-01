// converter.rs - Media conversion logic using ffmpeg

use std::path::Path;
use std::process::Command;

/// Converts a media file to a different format using ffmpeg.
///
/// # Arguments
/// * `input_path` - The path to the input media file
/// * `output_format` - The desired output format (mp3, mp4, wav, flac, aac)
/// * `quality` - The desired quality (128kbps, 320kbps, 720p, 1080p)
///
/// # Returns
/// * `Ok(String)` - Success message with the output file path
/// * `Err(String)` - Error message if the conversion fails
#[tauri::command]
pub fn convert_media(
    input_path: String,
    output_format: String,
    quality: String,
) -> Result<String, String> {
    let input = Path::new(&input_path);

    // Validate that input file exists
    if !input.exists() {
        return Err(format!("Input file not found: {}", input_path));
    }

    // Build the output file path by replacing the extension
    let output_path = input
        .with_extension(&output_format)
        .to_string_lossy()
        .to_string();

    // Avoid overwriting the input file if extension is the same
    if output_path == input_path {
        return Err("Output format is the same as input format.".to_string());
    }

    let mut args: Vec<String> = Vec::new();

    // Overwrite output without prompting
    args.push("-y".to_string());
    // Input file
    args.push("-i".to_string());
    args.push(input_path.clone());

    // Apply quality settings based on output format
    match output_format.to_lowercase().as_str() {
        "mp3" => {
            let bitrate = match quality.as_str() {
                "320kbps" => "320k",
                "128kbps" => "128k",
                _ => "192k",
            };
            args.push("-codec:a".to_string());
            args.push("libmp3lame".to_string());
            args.push("-b:a".to_string());
            args.push(bitrate.to_string());
        }
        "aac" => {
            let bitrate = match quality.as_str() {
                "320kbps" => "320k",
                "128kbps" => "128k",
                _ => "192k",
            };
            args.push("-codec:a".to_string());
            args.push("aac".to_string());
            args.push("-b:a".to_string());
            args.push(bitrate.to_string());
        }
        "wav" => {
            // WAV is lossless, no bitrate needed
            args.push("-codec:a".to_string());
            args.push("pcm_s16le".to_string());
        }
        "flac" => {
            // FLAC is lossless
            args.push("-codec:a".to_string());
            args.push("flac".to_string());
        }
        "mp4" => {
            // Video conversion with optional resolution scaling
            match quality.as_str() {
                "1080p" => {
                    args.push("-vf".to_string());
                    args.push("scale=-2:1080".to_string());
                }
                "720p" => {
                    args.push("-vf".to_string());
                    args.push("scale=-2:720".to_string());
                }
                _ => {}
            }
            args.push("-codec:v".to_string());
            args.push("libx264".to_string());
            args.push("-codec:a".to_string());
            args.push("aac".to_string());
        }
        _ => {
            return Err(format!("Unsupported output format: {}", output_format));
        }
    }

    // Output file path
    args.push(output_path.clone());

    // Run ffmpeg
    let output = Command::new("ffmpeg")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}. Make sure ffmpeg is installed.", e))?;

    if output.status.success() {
        Ok(format!(
            "Conversion completed successfully. Output: {}",
            output_path
        ))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("ffmpeg error: {}", stderr))
    }
}
