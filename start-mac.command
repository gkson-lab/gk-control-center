#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  One-click launcher for gklabs Device Manager on macOS.
#  Double-click it in Finder (it opens in Terminal), or run ./start-mac.command.
#  On first run it offers to install what's missing: Apple's command line
#  tools, Node.js (through Homebrew if you have it) and Rust. Then it installs
#  the JS dependencies and starts the app. The first launch compiles the
#  backend and takes a few minutes; later launches open in seconds.
# ---------------------------------------------------------------------------
set -u
cd "$(dirname "$0")" || exit 1

fail() {
  echo
  echo "[!] $1"
  read -r -p "Press Enter to close..." _
  exit 1
}

ask() {
  read -r -p "$1 [Y/n] " answer
  case "${answer:-Y}" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"

# ---- Apple command line tools (compiler and linker) ----
if ! xcode-select -p >/dev/null 2>&1; then
  echo "Apple's command line tools aren't installed yet (they include the compiler)."
  xcode-select --install 2>/dev/null
  fail "A system window should have opened to install them. When it finishes, run this again."
fi

# ---- Node.js ----
if ! command -v node >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    ask "Node.js isn't installed. Install it with Homebrew now?" || fail "Can't start without Node.js."
    brew install node || fail "Installing Node.js failed."
  else
    open "https://nodejs.org" 2>/dev/null
    fail "Node.js isn't installed. Install the LTS version from nodejs.org (it just opened), then run this again."
  fi
fi
node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
[ "$node_major" -ge 20 ] 2>/dev/null || fail "Node.js $(node -v) is too old; version 20 or newer is needed. Get the LTS from https://nodejs.org"

# ---- Rust ----
if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust isn't installed yet (it compiles the app's backend)."
  ask "Install it now with rustup (https://rustup.rs)?" || fail "Can't start without Rust."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal || fail "Installing Rust failed."
  . "$HOME/.cargo/env"
fi

# ---- JS dependencies (reinstall if they came from another OS) ----
if [ ! -d node_modules ] || ! ls -d node_modules/@tauri-apps/cli-darwin-* >/dev/null 2>&1; then
  echo "Installing dependencies (first run only)..."
  rm -rf node_modules
  npm install || fail "npm install failed."
fi

echo "Starting gklabs Device Manager... (keep this window open while the app runs)"
npm run tauri dev || fail "The app exited with an error."
