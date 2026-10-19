# gklabs Device Manager

A desktop system monitor that shows what your PC is doing right now and what it did a minute ago: processor load with a 60-second trail, every core on its own scale, NVIDIA GPU telemetry, memory, drives, disk activity, network throughput, scheduler counters, a session odometer, and a globe that marks where your connection comes from.

Built with Tauri 2, React and Rust by gkson.

![Overview, light theme](docs/screenshots/overview-light.jpg)

| Hardware, dark theme | Network (personal details blacked out) |
| --- | --- |
| ![Hardware view in the dark theme](docs/screenshots/hardware-dark.jpg) | ![Network view with IP, location and coordinates blacked out](docs/screenshots/network-light.jpg) |

The screenshots come from the browser preview, which runs on simulated readings and says so in the banner at the top.

## Pick your version

| System | Guide | Start it with |
| --- | --- | --- |
| Windows 10 / 11 | [README-windows.md](README-windows.md) | double-click `start.bat` |
| Linux (Ubuntu, Fedora, Arch, openSUSE, WSL) | [README-linux.md](README-linux.md) | `./start.sh` |
| macOS 11 or newer | [README-macos.md](README-macos.md) | `start-mac.command` on the `expansion-pack/macos` branch |

Each guide covers prerequisites, what each reading is based on, and troubleshooting for that system.

## What's inside

- **Overview:** the processor readout and its trail, then memory, graphics, disk and network in one list. Click any row to open its details.
- **Hardware:** every logical core on its own scale (hover, or use the arrow keys, for exact load and clock), GPU detail, memory and swap, each drive's fill, disk throughput and scheduler counters.
- **Network:** the globe, your public IP details, Wi-Fi link, router, DNS and live throughput.
- **Themes:** System, Light or Dark, remembered between launches.
- **Pause:** freeze every reading to read or screenshot it (P, or the status button).
- **Keyboard:** 1 to 3 switch views, T cycles the theme, F opens the facts drawer, ? lists every shortcut.

There are hidden achievements. No hints here.

## Expansion pack: Distribution

This branch turns the app into something you install instead of build:

- **Installers:** `npm run tauri build` produces a Windows installer (`.exe`, per-user, no admin needed) and `.msi`, a Linux `.deb`, `.rpm` and AppImage, and a macOS `.dmg` when built on a Mac.
- **Updates:** the **Updates** button in the footer checks GitHub releases, shows what's new, and installs the update and restarts in one click. Updates are signed, and the app refuses any download that doesn't match the public key in `tauri.conf.json`.
- **Automatic builds:** `.github/workflows/release.yml` builds all three systems when you push a version tag (`git tag v1.2.0 && git push origin v1.2.0`) and attaches the installers plus `latest.json` (what the updater reads) to a draft release. `.github/workflows/ci.yml` type-checks, builds and runs the backend tests on every push.

### One-time setup for releases

The updater key pair was generated on the build PC. The **private key never goes in the repo**: it lives at `%USERPROFILE%\.tauri\gklabs-device-manager.key`. Add it to GitHub once, under **Settings > Secrets and variables > Actions**:

| Secret | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | the contents of that key file |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | leave empty (the key has no password) |

Keep a backup of the key file: without it, installed copies can't verify future updates.

## How it works

A Rust thread collects readings twice a second and pushes them to the window as an event; the interface only listens. Per-platform data sources live in `src-tauri/src/lib.rs` (Windows) and `src-tauri/src/linux.rs` (Linux). The interface is in `src/`, and the design decisions behind it, with a reason for each, are in [DESIGN.md](DESIGN.md).

## Development

```bash
npm install
npm run tauri dev     # desktop app with live data
npm run dev           # browser preview with simulated readings
npm run tauri build   # release build
```
