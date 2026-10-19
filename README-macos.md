# gklabs Device Manager for macOS

The macOS version lives on its own branch, **`expansion-pack/macos`**, until it has been run on a real Mac. It's complete: macOS data sources, a double-click launcher and a full guide. Its code is compiled and tested on GitHub's macOS machines on every push.

## Get it

```bash
git clone -b expansion-pack/macos https://github.com/gkson-lab/gk-control-center.git
cd gk-control-center
./start-mac.command
```

Or download that branch as a zip from GitHub (switch the branch menu to `expansion-pack/macos`, then **Code > Download ZIP**), unzip it, and double-click **`start-mac.command`** in Finder.

On first run it installs what's missing (Apple's command line tools, Node.js and Rust), then builds and opens the app. The full guide, including which readings macOS can and can't provide, is in `README-macos.md` on that branch.

Works on Apple Silicon and Intel Macs running macOS 11 or newer.
