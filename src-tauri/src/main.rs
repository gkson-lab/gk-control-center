#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// All application logic lives in the library crate (gkcc_lib). This keeps the
// binary entry point trivial and mirrors the standard Tauri 2 layout, which
// also makes a future mobile target possible.
fn main() {
    gkcc_lib::run();
}
