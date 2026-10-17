@echo off
REM ---------------------------------------------------------------------------
REM  Reclaim disk space. The multi-GB folder size is build cache, NOT the app:
REM    src-tauri\target  -> Rust compiled dependencies (by far the biggest)
REM    node_modules      -> JS dev dependencies
REM    dist              -> built frontend
REM  All three regenerate automatically on the next build, so they are safe to
REM  delete. The shipped installer in src-tauri\target\release\bundle is only a
REM  few MB. Run this whenever you want the working folder small again.
REM ---------------------------------------------------------------------------

echo Cleaning Rust build cache (src-tauri\target)...
cargo clean --manifest-path src-tauri\Cargo.toml

echo Removing node_modules...
if exist node_modules rmdir /s /q node_modules

echo Removing dist...
if exist dist rmdir /s /q dist

echo.
echo Done. To run again:  npm install  then  npm run tauri dev
