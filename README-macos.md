# gklabs Device Manager for macOS

## Quick start

1. Download or clone this branch (`expansion-pack/macos`).
2. Double-click **`start-mac.command`** in Finder. It opens in Terminal.

If macOS says it can't be opened because it's from an unidentified developer, right-click it, choose **Open**, then **Open** again. You only need to do this once.

`start-mac.command`:

1. **Installs what's missing** (first run only): Apple's command line tools, Node.js (through Homebrew if you have it, otherwise it opens nodejs.org) and Rust.
2. **Downloads the app's dependencies** (first run only).
3. **Builds and opens the app.** The first build takes a few minutes; after that it opens in seconds.

Keep the Terminal window open while you use the app; closing it closes the app.

Works on Apple Silicon and Intel Macs running macOS 11 or newer.

## Where each reading comes from

| Reading | Source | Notes |
| --- | --- | --- |
| CPU load, per-core bars, frequency, memory, swap, drives, network speed | `sysinfo` | Works everywhere |
| Processes and threads | `top` | |
| Disk operations and MB/s | `top` (cumulative counters, turned into rates) | |
| Disk active time | none | macOS doesn't report it, so it shows N/A and the Overview's disk row shows throughput instead |
| Context switches/s, system calls/s | none | Not available to normal apps on macOS: N/A |
| CPU temperature | none | Needs administrator tools on macOS: N/A |
| Graphics | none | Apple and AMD graphics aren't read yet; the panel says no NVIDIA GPU was found |
| Wi-Fi, router, DNS | `route`, `ipconfig`, `scutil`, `system_profiler` | Recent macOS versions may show the network name as "redacted" unless Location Services is allowed |
| Public IP and location | ipapi.co, ipify | Needs an internet connection |

## How this was tested

The macOS data code was written on Windows. Its parsers have unit tests run against real macOS output formats, and `.github/workflows/macos.yml` compiles the app and runs those tests on GitHub's macOS machines on every push to this branch. It hasn't yet been run by hand on a Mac, so if a reading looks wrong, please open an issue with what you see.

## Troubleshooting

**Node.js is too old.** Version 20 or newer is needed; install the LTS from [nodejs.org](https://nodejs.org).

**The build fails with "xcrun: error".** The command line tools are missing or broken. Run `xcode-select --install` and try again.

**The folder is several GB.** That's build cache (`src-tauri/target` and `node_modules`), not the app. Delete both; the next start rebuilds them.
