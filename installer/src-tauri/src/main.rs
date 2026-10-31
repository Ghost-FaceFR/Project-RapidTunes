#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::Write;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

const APP_EXE: &[u8] = include_bytes!("../payload/RapidTunes.exe");
const CLI_EXE: &[u8] = include_bytes!("../payload/rapidtunes-cli.exe");
const VERSION: &str = env!("CARGO_PKG_VERSION");

const UNINSTALL_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\RapidTunes";
const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const APP_FILE: &str = "RapidTunes.exe";
const CLI_FILE: &str = "rapidtunes-cli.exe";
const UNINSTALLER_FILE: &str = "Uninstall RapidTunes.exe";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const DETACHED_PROCESS: u32 = 0x0000_0008;

#[derive(Serialize)]
struct Context {
  mode: String,
  version: String,
  default_dir: String,
  existing_dir: Option<String>,
  existing_version: Option<String>,
  relaunch: bool,
}

#[derive(Deserialize)]
struct InstallOptions {
  dir: String,
  desktop_shortcut: bool,
  start_menu_shortcut: bool,
  autostart: bool,
}

#[derive(Deserialize)]
struct UninstallOptions {
  delete_data: bool,
}

#[derive(Serialize, Clone)]
struct Progress {
  id: String,
  state: String,
  percent: u32,
  detail: String,
}

fn hidden(mut command: Command) -> Command {
  command.creation_flags(CREATE_NO_WINDOW);
  command
}

fn emit(app: &AppHandle, id: &str, state: &str, percent: u32, detail: &str) {
  let _ = app.emit(
    "progress",
    Progress {
      id: id.to_string(),
      state: state.to_string(),
      percent,
      detail: detail.to_string(),
    },
  );
}

fn reg_value(key: &str, name: &str) -> Option<String> {
  let output = hidden(Command::new("reg")).args(["query", key, "/v", name]).output().ok()?;
  if !output.status.success() {
    return None;
  }
  let text = String::from_utf8_lossy(&output.stdout).to_string();
  for line in text.lines() {
    let trimmed = line.trim();
    if trimmed.starts_with(name) {
      let rest = trimmed[name.len()..].trim_start();
      if let Some(position) = rest.find("REG_") {
        let after = &rest[position..];
        let value = after.splitn(2, char::is_whitespace).nth(1)?.trim().trim_matches('"');
        return Some(value.to_string());
      }
    }
  }
  None
}

fn reg_set(key: &str, name: &str, kind: &str, value: &str) -> Result<(), String> {
  let status = hidden(Command::new("reg"))
    .args(["add", key, "/v", name, "/t", kind, "/d", value, "/f"])
    .status()
    .map_err(|err| format!("Registre inaccessible: {err}"))?;
  if status.success() {
    Ok(())
  } else {
    Err("Écriture dans le registre refusée.".to_string())
  }
}

fn reg_delete_key(key: &str) {
  let _ = hidden(Command::new("reg")).args(["delete", key, "/f"]).status();
}

fn reg_delete_value(key: &str, name: &str) {
  let _ = hidden(Command::new("reg")).args(["delete", key, "/v", name, "/f"]).status();
}

fn local_app_data() -> PathBuf {
  dirs::data_local_dir().unwrap_or_else(|| PathBuf::from(r"C:\Users\Public"))
}

fn default_install_dir() -> PathBuf {
  local_app_data().join("Programs").join("RapidTunes")
}

fn start_menu_shortcut_path() -> Option<PathBuf> {
  dirs::data_dir().map(|dir| {
    dir.join("Microsoft")
      .join("Windows")
      .join("Start Menu")
      .join("Programs")
      .join("RapidTunes.lnk")
  })
}

fn desktop_shortcut_path() -> Option<PathBuf> {
  dirs::desktop_dir().map(|dir| dir.join("RapidTunes.lnk"))
}

fn detect_mode() -> (String, bool) {
  let args: Vec<String> = std::env::args().skip(1).map(|arg| arg.to_lowercase()).collect();
  let relaunch = args.iter().any(|arg| arg == "/r" || arg == "--relaunch");
  let exe_name = std::env::current_exe()
    .ok()
    .and_then(|path| path.file_stem().map(|name| name.to_string_lossy().to_lowercase()))
    .unwrap_or_default();
  if args.iter().any(|arg| arg == "--uninstall" || arg == "/uninstall") || exe_name.contains("uninstall") {
    return ("uninstall".to_string(), relaunch);
  }
  if args
    .iter()
    .any(|arg| matches!(arg.as_str(), "/p" | "/s" | "/update" | "--update" | "--passive" | "--silent"))
  {
    return ("update".to_string(), relaunch);
  }
  ("install".to_string(), relaunch)
}

#[tauri::command]
fn get_context() -> Context {
  let (mode, relaunch) = detect_mode();
  let existing_dir = reg_value(UNINSTALL_KEY, "InstallLocation").filter(|dir| !dir.is_empty());
  let existing_version = reg_value(UNINSTALL_KEY, "DisplayVersion");
  let default_dir = existing_dir
    .clone()
    .unwrap_or_else(|| default_install_dir().to_string_lossy().to_string());
  Context {
    mode,
    version: VERSION.to_string(),
    default_dir,
    existing_dir,
    existing_version,
    relaunch,
  }
}

#[tauri::command]
async fn pick_directory(current: String) -> Option<String> {
  tauri::async_runtime::spawn_blocking(move || {
    let mut dialog = rfd::FileDialog::new().set_title("Choisir le dossier d'installation");
    if Path::new(&current).exists() {
      dialog = dialog.set_directory(&current);
    }
    dialog.pick_folder().map(|path| path.to_string_lossy().to_string())
  })
  .await
  .ok()
  .flatten()
}

fn stop_running_app() {
  for name in [APP_FILE, "rapidtunes.exe", CLI_FILE] {
    let _ = hidden(Command::new("taskkill")).args(["/F", "/IM", name]).status();
  }
  thread::sleep(Duration::from_millis(700));
}

fn write_file(app: &AppHandle, path: &Path, bytes: &[u8], base: u32, span: u32, detail: &str) -> Result<(), String> {
  let mut last_error = String::new();
  for attempt in 0..6 {
    match std::fs::File::create(path) {
      Ok(mut file) => {
        let total = bytes.len().max(1);
        let mut written = 0usize;
        for chunk in bytes.chunks(256 * 1024) {
          file.write_all(chunk).map_err(|err| format!("Écriture impossible: {err}"))?;
          written += chunk.len();
          let percent = base + (span as usize * written / total) as u32;
          emit(app, "files", "running", percent, detail);
        }
        return Ok(());
      }
      Err(err) => {
        last_error = err.to_string();
        if attempt == 0 {
          stop_running_app();
        }
        thread::sleep(Duration::from_millis(400));
      }
    }
  }
  Err(format!("Impossible d'écrire {}: {last_error}", path.display()))
}

fn escape_ps(value: &str) -> String {
  value.replace('\'', "''")
}

fn create_shortcut(link: &Path, target: &Path, working_dir: &Path) -> Result<(), String> {
  if let Some(parent) = link.parent() {
    let _ = std::fs::create_dir_all(parent);
  }
  let script = format!(
    "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{}');$s.TargetPath='{}';$s.WorkingDirectory='{}';$s.IconLocation='{},0';$s.Description='RapidTunes';$s.Save()",
    escape_ps(&link.to_string_lossy()),
    escape_ps(&target.to_string_lossy()),
    escape_ps(&working_dir.to_string_lossy()),
    escape_ps(&target.to_string_lossy())
  );
  let status = hidden(Command::new("powershell"))
    .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script])
    .status()
    .map_err(|err| format!("Création du raccourci impossible: {err}"))?;
  if status.success() {
    Ok(())
  } else {
    Err(format!("Raccourci refusé: {}", link.display()))
  }
}

fn directory_size(dir: &Path) -> u64 {
  let mut total = 0;
  if let Ok(entries) = std::fs::read_dir(dir) {
    for entry in entries.flatten() {
      if let Ok(meta) = entry.metadata() {
        total += meta.len();
      }
    }
  }
  total
}

fn perform_install(app: &AppHandle, options: &InstallOptions) -> Result<(), String> {
  let dir = PathBuf::from(options.dir.trim());
  if options.dir.trim().is_empty() {
    return Err("Le dossier d'installation est vide.".to_string());
  }

  emit(app, "stop", "running", 0, "Fermeture de RapidTunes");
  stop_running_app();
  emit(app, "stop", "done", 100, "");

  emit(app, "files", "running", 0, "Création du dossier");
  std::fs::create_dir_all(&dir).map_err(|err| format!("Dossier inaccessible: {err}"))?;
  write_file(app, &dir.join(APP_FILE), APP_EXE, 0, 55, "Copie de RapidTunes")?;
  write_file(app, &dir.join(CLI_FILE), CLI_EXE, 55, 20, "Copie des outils en ligne de commande")?;
  let current = std::env::current_exe().map_err(|err| err.to_string())?;
  let uninstaller = dir.join(UNINSTALLER_FILE);
  if current != uninstaller {
    emit(app, "files", "running", 80, "Création du désinstallateur");
    let mut copied = Ok(());
    for _ in 0..6 {
      copied = std::fs::copy(&current, &uninstaller).map(|_| ());
      if copied.is_ok() {
        break;
      }
      thread::sleep(Duration::from_millis(300));
    }
    copied.map_err(|err| format!("Désinstallateur impossible: {err}"))?;
  }
  // Ancien désinstallateur NSIS
  let _ = std::fs::remove_file(dir.join("uninstall.exe"));
  emit(app, "files", "done", 100, "");

  emit(app, "shortcuts", "running", 0, "Raccourcis");
  let target = dir.join(APP_FILE);
  match (options.start_menu_shortcut, start_menu_shortcut_path()) {
    (true, Some(link)) => create_shortcut(&link, &target, &dir)?,
    (false, Some(link)) => {
      let _ = std::fs::remove_file(link);
    }
    _ => {}
  }
  emit(app, "shortcuts", "running", 60, "Raccourcis");
  match (options.desktop_shortcut, desktop_shortcut_path()) {
    (true, Some(link)) => create_shortcut(&link, &target, &dir)?,
    (false, Some(link)) => {
      let _ = std::fs::remove_file(link);
    }
    _ => {}
  }
  emit(app, "shortcuts", "done", 100, "");

  emit(app, "registry", "running", 0, "Enregistrement dans Windows");
  let uninstall_command = format!("\"{}\" --uninstall", uninstaller.display());
  reg_set(UNINSTALL_KEY, "DisplayName", "REG_SZ", "RapidTunes")?;
  reg_set(UNINSTALL_KEY, "DisplayVersion", "REG_SZ", VERSION)?;
  reg_set(UNINSTALL_KEY, "Publisher", "REG_SZ", "Ghost Industry")?;
  reg_set(UNINSTALL_KEY, "InstallLocation", "REG_SZ", &dir.to_string_lossy())?;
  reg_set(UNINSTALL_KEY, "DisplayIcon", "REG_SZ", &target.to_string_lossy())?;
  reg_set(UNINSTALL_KEY, "UninstallString", "REG_SZ", &uninstall_command)?;
  reg_set(UNINSTALL_KEY, "QuietUninstallString", "REG_SZ", &uninstall_command)?;
  reg_set(UNINSTALL_KEY, "NoModify", "REG_DWORD", "1")?;
  reg_set(UNINSTALL_KEY, "NoRepair", "REG_DWORD", "1")?;
  reg_set(UNINSTALL_KEY, "EstimatedSize", "REG_DWORD", &(directory_size(&dir) / 1024).to_string())?;
  emit(app, "registry", "running", 70, "Enregistrement dans Windows");
  if options.autostart {
    reg_set(RUN_KEY, "RapidTunes", "REG_SZ", &format!("\"{}\"", target.display()))?;
  } else {
    reg_delete_value(RUN_KEY, "RapidTunes");
  }
  emit(app, "registry", "done", 100, "");

  emit(app, "finish", "running", 50, "Finalisation");
  thread::sleep(Duration::from_millis(350));
  emit(app, "finish", "done", 100, "");
  Ok(())
}

fn remove_dir_all_quiet(path: &Path) {
  if path.exists() {
    let _ = std::fs::remove_dir_all(path);
  }
}

fn perform_uninstall(app: &AppHandle, options: &UninstallOptions) -> Result<(), String> {
  let dir = reg_value(UNINSTALL_KEY, "InstallLocation")
    .filter(|value| !value.is_empty())
    .map(PathBuf::from)
    .unwrap_or_else(default_install_dir);

  emit(app, "stop", "running", 0, "Fermeture de RapidTunes");
  stop_running_app();
  emit(app, "stop", "done", 100, "");

  emit(app, "shortcuts", "running", 0, "Suppression des raccourcis");
  if let Some(link) = start_menu_shortcut_path() {
    let _ = std::fs::remove_file(link);
  }
  if let Some(link) = desktop_shortcut_path() {
    let _ = std::fs::remove_file(link);
  }
  emit(app, "shortcuts", "done", 100, "");

  emit(app, "registry", "running", 0, "Nettoyage de Windows");
  reg_delete_value(RUN_KEY, "RapidTunes");
  reg_delete_key(UNINSTALL_KEY);
  emit(app, "registry", "done", 100, "");

  emit(app, "files", "running", 0, "Suppression des fichiers");
  let current = std::env::current_exe().ok();
  for name in [APP_FILE, CLI_FILE, "uninstall.exe"] {
    let _ = std::fs::remove_file(dir.join(name));
  }
  emit(app, "files", "running", 60, "Suppression des fichiers");
  let uninstaller = dir.join(UNINSTALLER_FILE);
  let running_from_dir = current.as_ref().map(|path| path == &uninstaller).unwrap_or(false);
  if !running_from_dir {
    let _ = std::fs::remove_file(&uninstaller);
  }
  emit(app, "files", "done", 100, "");

  if options.delete_data {
    emit(app, "data", "running", 0, "Suppression de vos données");
    remove_dir_all_quiet(&local_app_data().join("com.rapidtunes.app"));
    emit(app, "data", "running", 50, "Suppression de vos données");
    let data_dir = local_app_data().join("RapidTunes");
    if data_dir != dir {
      remove_dir_all_quiet(&data_dir);
    }
    emit(app, "data", "done", 100, "");
  }

  // Le désinstallateur ne peut pas se supprimer lui-même: une commande différée termine le travail.
  let mut cleanup = String::from("ping 127.0.0.1 -n 3 >nul");
  if running_from_dir {
    cleanup.push_str(&format!(" & del /f /q \"{}\"", uninstaller.display()));
  }
  if options.delete_data {
    cleanup.push_str(&format!(" & rmdir /s /q \"{}\"", dir.display()));
  } else {
    cleanup.push_str(&format!(" & rmdir \"{}\"", dir.display()));
  }
  let _ = Command::new("cmd")
    .args(["/C", &cleanup])
    .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
    .spawn();

  emit(app, "finish", "running", 50, "Finalisation");
  thread::sleep(Duration::from_millis(350));
  emit(app, "finish", "done", 100, "");
  Ok(())
}

#[tauri::command]
fn run_install(app: AppHandle, options: InstallOptions) {
  thread::spawn(move || {
    let result = perform_install(&app, &options);
    match result {
      Ok(()) => {
        let _ = app.emit("finished", serde_json::json!({ "ok": true, "dir": options.dir }));
      }
      Err(message) => {
        let _ = app.emit("finished", serde_json::json!({ "ok": false, "error": message }));
      }
    }
  });
}

#[tauri::command]
fn run_uninstall(app: AppHandle, options: UninstallOptions) {
  thread::spawn(move || {
    let result = perform_uninstall(&app, &options);
    match result {
      Ok(()) => {
        let _ = app.emit("finished", serde_json::json!({ "ok": true }));
      }
      Err(message) => {
        let _ = app.emit("finished", serde_json::json!({ "ok": false, "error": message }));
      }
    }
  });
}

#[tauri::command]
fn launch_app(dir: String) -> Result<(), String> {
  let target = Path::new(&dir).join(APP_FILE);
  Command::new(&target)
    .current_dir(&dir)
    .creation_flags(DETACHED_PROCESS)
    .spawn()
    .map_err(|err| format!("Impossible de lancer RapidTunes: {err}"))?;
  Ok(())
}

#[tauri::command]
fn quit(app: AppHandle) {
  app.exit(0);
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      get_context,
      pick_directory,
      run_install,
      run_uninstall,
      launch_app,
      quit
    ])
    .run(tauri::generate_context!())
    .expect("Erreur au démarrage de l'installateur");
}
