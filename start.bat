@echo off
REM ---------------------------------------------------------------------------
REM  One-click launcher for gklabs Device Manager.
REM  Double-click this file. It checks the prerequisites, installs the JS
REM  dependencies on first run (or after clean.cmd), then starts the app.
REM  The first launch compiles the Rust backend and can take a few minutes;
REM  later launches are much faster.
REM ---------------------------------------------------------------------------
setlocal
title gklabs Device Manager
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js / npm was not found. Install Node.js LTS from https://nodejs.org
  goto :fail
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo [!] Rust / cargo was not found. Install Rust from https://rustup.rs
  goto :fail
)

if not exist node_modules (
  echo Installing dependencies ^(first run only^)...
  call npm install
  if errorlevel 1 (
    echo [!] npm install failed.
    goto :fail
  )
)

echo Starting gklabs Device Manager... ^(keep this window open while the app runs^)
call npm run tauri dev
if errorlevel 1 goto :fail
exit /b 0

:fail
echo.
pause
exit /b 1
