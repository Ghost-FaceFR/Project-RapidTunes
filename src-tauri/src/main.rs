// Évite l'ouverture d'une console avec l'exécutable release sous Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  rapidtunes::run();
}
