#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  One-click launcher for gklabs Device Manager on Linux (the start.bat equivalent).
#  Run it with:  bash start.sh   (or chmod +x start.sh once, then ./start.sh)
#  On first run it offers to install everything that's missing — Tauri's
#  system libraries, Node.js and Rust — then installs the JS dependencies and
#  starts the app. The first launch compiles the Rust backend and can take a
#  few minutes; later launches are much faster.
# ---------------------------------------------------------------------------
set -u
cd "$(dirname "$0")" || exit 1

fail() {
  echo
  echo "[!] $1"
  [ -t 0 ] && read -r -p "Press Enter to close..." _
  exit 1
}

ask() {
  read -r -p "$1 [Y/n] " answer
  case "${answer:-Y}" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

# A real Linux command. Under WSL, Windows programs (C:\Program Files\nodejs\npm
# and friends) leak onto PATH as /mnt/c/... and must not count.
have() {
  local p
  p=$(command -v "$1" 2>/dev/null) || return 1
  case "$p" in /mnt/*) return 1 ;; esac
}

# Rust installed through rustup lives here but isn't always on PATH yet.
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"

# ---- System packages: Tauri's libraries (WebKitGTK etc.) and Node.js ----
need_libs=0; need_node=0
pkg-config --exists webkit2gtk-4.1 2>/dev/null || need_libs=1
have node && have npm || need_node=1

if [ $need_libs = 1 ] || [ $need_node = 1 ]; then
  if have apt-get; then
    libs="libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev pkg-config"
    pre="sudo apt-get update && sudo apt-get install -y"
  elif have dnf; then
    libs="webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel libxdo-devel pkgconf-pkg-config gcc gcc-c++ make"
    pre="sudo dnf install -y"
  elif have pacman; then
    libs="webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg xdotool"
    pre="sudo pacman -S --needed --noconfirm"
  elif have zypper; then
    libs="webkit2gtk3-devel libopenssl-devel curl wget file libappindicator3-1 librsvg-devel gcc gcc-c++ make"
    pre="sudo zypper install -y"
  else
    fail "Couldn't find a supported package manager. Install WebKitGTK 4.1 (see https://v2.tauri.app/start/prerequisites/#linux) and Node.js LTS, then run this again."
  fi
  pkgs=""
  [ $need_libs = 1 ] && pkgs="$libs"
  [ $need_node = 1 ] && pkgs="$pkgs nodejs npm"
  install_cmd="$pre $pkgs"
  echo "Some things gklabs Device Manager needs aren't installed yet:"
  [ $need_libs = 1 ] && echo "  - Tauri system libraries (WebKitGTK and build tools)"
  [ $need_node = 1 ] && echo "  - Node.js and npm"
  echo "Command: $install_cmd"
  ask "Install them now? (you'll be asked for your password)" || fail "Can't start without them."
  bash -c "$install_cmd" || fail "Installing packages failed."
fi

have node && have npm || fail "Node.js / npm still isn't available. Install Node.js LTS from https://nodejs.org and run this again."
node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
[ "$node_major" -ge 20 ] 2>/dev/null || fail "Node.js $(node -v) is too old; version 20 or newer is needed. Get the LTS from https://nodejs.org"

# ---- Rust (via rustup, no root needed) ----
if ! have cargo; then
  echo "Rust isn't installed yet (it compiles the app's backend)."
  ask "Install it now with rustup (https://rustup.rs)?" || fail "Can't start without Rust."
  have curl || fail "curl is needed to install Rust."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal || fail "Installing Rust failed."
  . "$HOME/.cargo/env"
fi

# ---- JS dependencies ----
# Also reinstall if node_modules was copied over from Windows (its native
# binaries won't run here).
if [ ! -d node_modules ] || ! ls -d node_modules/@tauri-apps/cli-linux-* >/dev/null 2>&1; then
  echo "Installing dependencies (first run only)..."
  rm -rf node_modules
  npm install || fail "npm install failed."
fi

echo "Starting gklabs Device Manager... (keep this terminal open while the app runs)"
npm run tauri dev || fail "The app exited with an error."
