# gklabs Device Manager for Linux

## Quick start

From a clone of this repo, or from the Linux zip:

```bash
./start.sh
```

That's the whole setup. `start.sh`:

1. **Installs what's missing** (first run only): Tauri's system libraries (WebKitGTK and build tools), Node.js and Rust. It shows the exact command and asks first; you type your password once.
2. **Downloads the app's dependencies** (first run only).
3. **Builds and opens the app.** The first build takes a few minutes; after that it opens in seconds.

Keep the terminal open while you use the app; closing it closes the app.

> Got the zip and there's no `unzip` command? `sudo apt install unzip` (or your distro's equivalent), or extract it with your file manager.

## Supported systems

`start.sh` installs the prerequisites on:

| Distro family | Package manager |
| --- | --- |
| Ubuntu, Debian, Linux Mint, Pop!_OS | `apt` |
| Fedora, RHEL, Rocky, Alma | `dnf` |
| Arch, Manjaro, EndeavourOS | `pacman` |
| openSUSE | `zypper` |

On anything else, install WebKitGTK 4.1 (see the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux)), Node.js 20 or newer and Rust yourself, then run `./start.sh`.

Tested on Ubuntu 26.04 under WSL 2 on Windows 11.

## Where each reading comes from

| Reading | Source | Notes |
| --- | --- | --- |
| CPU load, per-core bars, frequency, memory, swap, drives, network speed | `sysinfo` | Works everywhere |
| Disk operations, MB/s, active time | `/proc/diskstats` | Physical disks only, so partitions aren't counted twice |
| Processes, threads, context switches/s | `/proc` | |
| System calls/s | none | Linux has no system-wide counter, so this shows N/A |
| CPU temperature | Kernel hardware sensors (`coretemp`, `k10temp`, ...) | No extra software needed |
| Graphics | `nvidia-smi` | Needs the proprietary NVIDIA driver; the panel says so otherwise |
| Wi-Fi, router, DNS | `ip`, `iw`, `nmcli`, `resolvectl` | Wi-Fi details need `iw` (`sudo apt install iw`) |
| Public IP and location | ipapi.co, ipify | Needs an internet connection |

## Troubleshooting

**The window is blank or white.** A known WebKitGTK problem with some graphics drivers. The app applies the fix automatically on NVIDIA cards; on other hardware, start it with:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 ./start.sh
```

**"CPU temp N/A".** Your system isn't exposing a CPU sensor. On most PCs, `sudo apt install lm-sensors && sudo sensors-detect` fixes it. Inside WSL or a virtual machine there are no sensors to read, so N/A is expected.

**`libEGL warning: ... Permission denied` in the terminal.** Harmless: WebKit can't use the GPU for drawing and falls back to the CPU.

**`npm install failed`.** Clear the downloaded dependencies and try again with `./clean.sh` then `./start.sh`.

**"Node.js is too old".** Version 20 or newer is needed. Older distros ship an outdated Node; install the LTS from [nodejs.org](https://nodejs.org).

## Running under WSL

It works, and the window appears on the Windows desktop. Put the project in your Linux home folder (for example `~/gkcc`), not under `/mnt/c/...`, where builds are much slower and clash with a Windows `node_modules`. Inside WSL, CPU temperature shows N/A and the Wi-Fi details are empty, because Windows owns that hardware.

## Freeing up disk space

The folder grows to a few GB after the first build. That's build cache, not the app. `./clean.sh` deletes it; the next `./start.sh` rebuilds it.

## Uninstalling

Delete the project folder, plus `~/.local/share/com.gkcc.app/` (the app's odometer file and web cache, a few MB at most). Node.js, Rust and the system libraries stay installed; remove them with your package manager (and `rustup self uninstall` for Rust) if you no longer need them.
