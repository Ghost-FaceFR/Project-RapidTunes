use clap::{Args, Parser, Subcommand};
use std::fs;
use std::process::ExitCode;

use rapidtunes::models::{DownloadRequest, MediaMode};
use rapidtunes::services::media_service::{parse_batch_json, process_batch, process_download_request};

#[derive(Parser)]
#[command(name = "rapidtunes-cli")]
#[command(about = "CLI de téléchargement et conversion média", long_about = None)]
struct Cli {
  #[command(subcommand)]
  command: Commands
}

#[derive(Subcommand)]
enum Commands {
  Download(DownloadArgs),
  Batch(BatchArgs)
}

#[derive(Args)]
struct DownloadArgs {
  #[arg(long)]
  url: String,

  #[arg(long, default_value = "mp3")]
  format: String,

  #[arg(long, default_value = "128kbps")]
  quality: String,

  #[arg(long, default_value = "audio")]
  mode: String,

  #[arg(long)]
  output_dir: Option<String>,

  #[arg(long, default_value_t = false)]
  playlist: bool,

  #[arg(long)]
  speed_limit_kibps: Option<u64>
}

#[derive(Args)]
struct BatchArgs {
  #[arg(long, help = "Chemin du JSON batch")]
  file: String
}

#[tokio::main]
async fn main() -> ExitCode {
  match run().await {
    Ok(()) => ExitCode::SUCCESS,
    Err(err) => {
      eprintln!("❌ {err}");
      ExitCode::from(1)
    }
  }
}

async fn run() -> Result<(), String> {
  let cli = Cli::parse();

  match cli.command {
    Commands::Download(args) => {
      let request = build_request(args)?;
      let result = process_download_request(request)
        .await
        .map_err(|err| err.to_string())?;

      println!("✅ {}", result.message);
      if let Some(path) = result.output_path {
        println!("📁 {path}");
      }
    }
    Commands::Batch(args) => {
      let content = fs::read_to_string(&args.file).map_err(|err| err.to_string())?;
      let jobs = parse_batch_json(&content).map_err(|err| err.to_string())?;

      let results = process_batch(jobs).await.map_err(|err| err.to_string())?;

      for (index, result) in results.iter().enumerate() {
        let icon = if result.success { "✅" } else { "❌" };
        println!("{icon} Job #{} - {}", index + 1, result.message);
      }
    }
  }

  Ok(())
}

fn build_request(args: DownloadArgs) -> Result<DownloadRequest, String> {
  let mode = MediaMode::from_input(&args.mode)
    .ok_or_else(|| "Mode invalide (audio, video, extract_audio).".to_string())?;

  Ok(DownloadRequest {
    url: args.url,
    format: args.format,
    quality: args.quality,
    mode,
    output_dir: args.output_dir,
    is_playlist: args.playlist,
    speed_limit_kibps: args.speed_limit_kibps
  })
}
