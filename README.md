# GK Control Center

#(IF YOU WANT THE LINUX VERSION, PLEASE HEAD TO THE LINUX BRANCH)
 
 WARNING, THIS PROGRAM IS WINDOWS ONLY AND IS NOT COMPATIBLE WITH AMD GPUs.
 The accessiblity for other OS's and GPU types will be expanded in the future, sorry for the inconvenience. 0_0

A sleek, real-time system monitor built with **Tauri 2 + React + TypeScript**, styled in a warm-monochrome design language.

It shows live hardware gauges, **per-core processor bars**, full **NVIDIA GPU**
telemetry, **disk IOPS / throughput**, network throughput, scheduler counters,
and a persistent runtime **odometer** that accumulates total seconds of use
across sessions.

## Architecture

The backend owns the cadence. A background thread in Rust refreshes everything
about twice a second and **emits** a `metrics` event to the webview; the React
frontend simply **listens**. There is no frontend polling and no IPC command on
the hot path.

```
Rust collector thread ──emit("metrics")──▶  React listen("metrics") ──▶ UI
```

- `src-tauri/src/lib.rs` — the self-contained collector thread + `run()`.
- `src-tauri/src/main.rs` — one-line entry: `gkcc_lib::run()`.
- `src/App.tsx` — layout, theme, and the `listen()` subscription.
- `src/components/Gauge.tsx` — radial gauge (SVG).
- `src/components/CoreBars.tsx` — live per-core vertical usage bars.
- `src/components/Odometer.tsx` — odometer with smooth 60fps interpolation.
- `src/components/Globe.tsx` — spinning wireframe globe; the pop-out sidebar plots your public-IP location.

## Data sources

To avoid a `windows-core` dependency conflict (two versions in the graph broke
the build), GPU and WMI data are gathered by shelling out rather than linking
native crates. A single PowerShell process per second runs `nvidia-smi` and the
CIM queries and returns one JSON blob, parsed with `serde_json` on a background
thread; the 500ms emit loop reads the latest snapshot.

| Metric | Source |
| --- | --- |
| CPU load (global + per-core), per-core frequency, memory, swap, disks, network throughput | `sysinfo` 0.30 |
| GPU usage, temp, VRAM, power, clocks, fan | `nvidia-smi` (shell-out) |
| Disk IOPS / bytes-per-sec / active-time, process & thread counts, context switches/s, syscalls/s | PowerShell `Get-CimInstance` on `root\cimv2` perf classes |
| **CPU package/die temperature** | PowerShell CIM on `root\LibreHardwareMonitor` (see below) |
| Your IP geolocation (globe) | `https://ipapi.co/json/` fetched from the webview |

Each source degrades gracefully: no NVIDIA driver → GPU card shows "No GPU";
LibreHardwareMonitor not running → CPU temp shows **N/A**.

### CPU temperature requires LibreHardwareMonitor

Windows does not expose CPU temperature through any standard OS API, so accurate
readings need a helper that ships its own signed kernel driver. This app reads
from **[LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor)**
(free, open source) via its WMI namespace.

To enable CPU temp:

1. Install / run LibreHardwareMonitor.
2. In its menu enable **Options → Remote Web Server is optional**, but you must enable **Options → WMI** (publishes sensors to `root\LibreHardwareMonitor`).
3. Run it **as administrator** (driver access) — ideally set it to start with Windows, elevated.

GPU temperature comes from `nvidia-smi` and needs no helper.

## The odometer resets each launch

The displayed total is `monotonic_elapsed` since the program opened. On every
launch the app clears its cache directory and removes the stored `odometer.txt`,
so runtime always starts from zero. Within a session the value is exact
(monotonic clock, immune to polling jitter).

## Disk usage

The working folder can balloon to several GB — this is **build cache, not the
app**: `src-tauri/target` (Rust compiled dependencies) and `node_modules`.
Both regenerate on the next build and are safe to delete; the shipped installer
under `src-tauri/target/release/bundle` is only a few MB. Run `clean.cmd` to
reclaim space, then `npm install` + `npm run tauri dev` to rebuild. The release
profile in `Cargo.toml` is tuned for a small binary (`opt-level="z"`, LTO,
strip).

## Prerequisites

Install these once on the machine (Windows):

1. **Node.js LTS** (includes npm) — https://nodejs.org
2. **Rust** (via rustup, gives `cargo`) — https://rustup.rs
3. **Microsoft C++ Build Tools** — the "Desktop development with C++" workload
   from the Visual Studio Build Tools installer (Tauri compiles native code with MSVC).
4. **WebView2 Runtime** — preinstalled on Windows 10/11; otherwise grab the
   Evergreen runtime from Microsoft.

Optional, for full functionality at runtime (not needed to build):

- **NVIDIA driver** (ships `nvidia-smi`) — required for the GPU card.
- **[LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor)**,
  running with WMI enabled and as admin — required for CPU temperature (see above).
- **Internet connection** — for the globe's coastlines and your IP/ISP lookup.

### Project dependencies (installed automatically)

These come down with `npm install` / `cargo build` — you don't add them by hand:

- npm: `react`, `react-dom`, `@tauri-apps/api`, `@tauri-apps/cli`, `@tailwindcss/vite`,
  `tailwindcss`, `vite`, `@vitejs/plugin-react`, `typescript`, and the `@types/*`.
- Cargo: `tauri`, `tauri-build`, `serde`, `serde_json`, `sysinfo`.

## Development

```bash
npm install            # pulls all JS dependencies
npm run tauri dev      # builds Rust (pulls crates) + runs the desktop app
npm run tauri build    # release bundle
```

## Tech

React 18, Vite, Tailwind CSS v4, Tauri 2, `sysinfo` 0.30, `serde_json`, plus
`nvidia-smi` + PowerShell shell-outs for GPU and sensors. The globe's coastlines
are fetched as 110m TopoJSON from a CDN at runtime and decoded in-app (no extra
npm dependency); offline it falls back to just the graticule. Type: Poppins
(display) + Inter (UI) + a monospace stack.

> The Location sidebar combines public IP/ISP/geo (ipapi.co + ipify, online)
> with local Wi-Fi/router/DNS detail from the `get_network_info` backend command
> (PowerShell + `netsh`).
