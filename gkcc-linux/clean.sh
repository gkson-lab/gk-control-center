#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  Reclaim disk space (the clean.cmd equivalent). The multi-GB folder size is
#  build cache, NOT the app:
#    src-tauri/target  -> Rust compiled dependencies (by far the biggest)
#    node_modules      -> JS dev dependencies
#    dist              -> built frontend
#  All three regenerate automatically on the next build, so they are safe to
#  delete.
# ---------------------------------------------------------------------------
cd "$(dirname "$0")" || exit 1

echo "Cleaning Rust build cache (src-tauri/target)..."
cargo clean --manifest-path src-tauri/Cargo.toml 2>/dev/null || rm -rf src-tauri/target

echo "Removing node_modules..."
rm -rf node_modules

echo "Removing dist..."
rm -rf dist

echo
echo "Done. To run again:  bash start.sh"
