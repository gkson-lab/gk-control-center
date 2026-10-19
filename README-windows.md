# gklabs Device Manager for Windows

## Quick start

1. Install the prerequisites below (once).
2. Double-click **`start.bat`**.

The first launch downloads dependencies and compiles the backend, which takes a few minutes. After that it opens in seconds. Keep the console window open while you use the app; closing it closes the app.

## Prerequisites

| Needed | Where to get it |
| --- | --- |
| Node.js LTS (includes npm) | https://nodejs.org |
| Rust (gives `cargo`) | https://rustup.rs |
| Microsoft C++ Build Tools, "Desktop development with C++" workload | Visual Studio Build Tools installer |
| WebView2 Runtime | Already on Windows 10 and 11 |

Optional, for every reading to light up:

- **NVIDIA driver** (ships `nvidia-smi`) for the graphics card readings.
- **LibreHardwareMonitor** for CPU temperature (see below).
- **An internet connection** for the globe's coastlines and your public IP details.

## Where each reading comes from

| Reading | Source |
| --- | --- |
| CPU load, per-core load and clock, memory, swap, drives, network throughput | `sysinfo` |
| GPU load, temperature, VRAM, power, clocks, fan | `nvidia-smi` |
| Disk operations and MB/s, active time, processes, threads, context switches, system calls | PowerShell `Get-CimInstance` performance counters |
| CPU temperature | LibreHardwareMonitor's WMI sensors |
| Wi-Fi, router and DNS | PowerShell `Get-NetIPConfiguration` and `netsh wlan` |
| Public IP and location | ipapi.co and ipify, fetched by the window |

One PowerShell process per second gathers the GPU and counter readings and returns them as JSON, so no extra native libraries are linked. Each source fails on its own: no NVIDIA driver means the graphics panel says so, and no LibreHardwareMonitor means CPU temperature shows N/A.

## CPU temperature needs LibreHardwareMonitor

Windows has no standard way to read the CPU's temperature, so it takes a helper with its own driver. gklabs Device Manager reads [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) (free, open source):

1. Install and run LibreHardwareMonitor.
2. Turn on **Options > WMI**, which publishes its sensors to `root\LibreHardwareMonitor`.
3. Run it as administrator, ideally set to start with Windows.

## Troubleshooting

**"Node.js / npm was not found" or "Rust / cargo was not found".** Install the missing one from the table above, then open a new console so it's on PATH.

**The build fails with linker errors.** The C++ Build Tools workload is missing; install "Desktop development with C++".

**"Lost contact with the collector" banner.** The backend stopped sending readings. Close the console window and run `start.bat` again.

**The folder is several GB.** That's build cache (`src-tauri\target` and `node_modules`), not the app. Run `clean.cmd` to delete it; the next `start.bat` rebuilds it.

## Manual commands

```bash
npm install
npm run tauri dev     # run
npm run tauri build   # installer under src-tauri\target\release\bundle
```
