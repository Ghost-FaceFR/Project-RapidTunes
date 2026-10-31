fn main() {
  println!("cargo:rerun-if-changed=payload/RapidTunes.exe");
  println!("cargo:rerun-if-changed=payload/rapidtunes-cli.exe");
  tauri_build::build();
}
