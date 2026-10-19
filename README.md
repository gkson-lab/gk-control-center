# GK Control Center — Linux

## please note, the linux and mac versions have been branched with main. the other linux and mac branches are deprecated.

A sleek, real-time system monitor: live CPU / memory / GPU gauges, per-core
processor bars, NVIDIA GPU telemetry, disk IOPS and throughput, network speed,
scheduler counters, a runtime odometer, and a spinning globe that shows where
your connection is.

Built with Tauri 2 + React. This package is the Linux edition.

## Quick start

```bash
unzip gkcc-linux.zip
cd gkcc-linux
./start.sh
```

That's it. `start.sh` takes care of everything:

1. **Installs what's missing** (first run only): the system libraries Tauri
   needs (WebKitGTK and build tools), Node.js, and Rust. It shows you the exact
   command and asks before installing; you'll type your password once.
2. **Downloads the app's dependencies** (first run only).
3. **Builds and opens the app.** The first build takes a few minutes; after
   that it opens in seconds.

Keep the terminal open while you use the app; closing it closes the app.

> No `unzip` command? Install it with `sudo apt install unzip` (or your
> distro's equivalent), or extract the zip with your file manager.

## Supported systems

`start.sh` knows how to install the prerequisites on:

| Distro family | Package manager |
| --- | --- |
| Ubuntu, Debian, Linux Mint, Pop!_OS | `apt` |
| Fedora, RHEL, Rocky, Alma | `dnf` |
| Arch, Manjaro, EndeavourOS | `pacman` |
| openSUSE | `zypper` |

On anything else, install WebKitGTK 4.1 (see the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux)),
Node.js 20+ and Rust yourself, then run `./start.sh`.

Tested on Ubuntu 26.04 (under WSL 2 on Windows 11).

## What you'll see, and where it comes from

| Reading | Source | Notes |
| --- | --- | --- |
| CPU load, per-core bars, frequency, memory, swap, storage, network speed | `sysinfo` | Works everywhere |
| Disk IOPS, MB/s, active time | `/proc/diskstats` | Physical disks only, so partitions aren't double-counted |
| Processes, threads, context switches/s | `/proc` | |
| Syscalls/s | — | Linux has no system-wide counter, so this shows **N/A** |
| CPU temperature | Kernel hardware sensors (`coretemp`, `k10temp`, …) | No extra software needed |
| GPU card | `nvidia-smi` | Needs the proprietary NVIDIA driver; shows "No GPU" otherwise |
| Wi-Fi, router, DNS (Location panel) | `ip`, `iw`, `nmcli`, `resolvectl` | Wi-Fi details need `iw` (`sudo apt install iw`) |
| Public IP, ISP, globe location | ipapi.co, ipify | Needs an internet connection |

## Troubleshooting

**The window is blank or white.**
This is a known WebKitGTK problem with some graphics drivers. The app turns on
the fix automatically for NVIDIA cards; on other hardware, start it with:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 ./start.sh
```

**"CPU temp N/A".**
Your system isn't exposing a CPU sensor. On most PCs `sudo apt install
lm-sensors && sudo sensors-detect` fixes it. Inside WSL or a virtual machine
there are no sensors to read, so N/A is expected there.

**`libEGL warning: ... Permission denied` in the terminal.**
Harmless. WebKit can't use the GPU for drawing and falls back to the CPU; the
app works normally.

**`npm install failed`.**
Delete the downloaded dependencies and try again:

```bash
./clean.sh
./start.sh
```

**"Node.js is too old".**
Version 20 or newer is needed. Older distros ship an outdated Node; install the
LTS release from [nodejs.org](https://nodejs.org) and run `./start.sh` again.

## Running under WSL (Windows Subsystem for Linux)

It works: the window appears on your Windows desktop like any other app.
Unzip it inside your Linux home folder (for example `~/gkcc-linux`), not under
`/mnt/c/...`, where builds are much slower. Inside WSL the CPU temperature
shows N/A and the Wi-Fi details are empty, because Windows owns that hardware.

## Freeing up disk space

The folder grows to a few GB after the first build. That's build cache, not
the app. Run `./clean.sh` to delete it; the next `./start.sh` rebuilds it.

## Uninstalling

Delete the `gkcc-linux` folder, plus `~/.local/share/com.gkcc.app/` (the
app's odometer file and web cache, a few MB at most). Node.js, Rust and
the system libraries stay installed; remove them with your package manager
(and `rustup self uninstall` for Rust) if you no longer need them.

## Files

```
gkcc-linux/
├── start.sh          one-step setup + launch
├── clean.sh          delete build caches
├── src/              the interface (React + TypeScript)
└── src-tauri/        the backend (Rust)
    └── src/linux.rs  the Linux data sources
```

---

made with ♥ by gkson
