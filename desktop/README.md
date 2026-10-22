# ChipForge desktop

The ChipForge web app in a native window ([Tauri 2](https://tauri.app)), for Linux,
Windows and macOS. Everything works offline. Exports open the system Save dialog. There
is no account page, because sync needs a ChipForge server; use the web app for that.

## Download

Installers (AppImage, .deb, .rpm, .msi, .exe and .dmg) are on the
[Releases page](https://github.com/spiritpaper/chipforge/releases). GitHub Actions also
builds them when the desktop app changes and on demand (**Actions → Desktop → Run
workflow**), as artifacts of the run. The builds aren't code-signed yet, so Windows
SmartScreen and macOS Gatekeeper will warn the first time (on macOS, right-click the
app → Open).

## Releasing

Releases are automatic. To ship a new version:

1. Set the version in `desktop/src-tauri/tauri.conf.json` (and in
   `desktop/src-tauri/Cargo.toml` and `web/package.json` to match).
2. Commit and push to `main`.

When `main` has a version with no release yet, the Desktop workflow builds the
installers and publishes them as release `v<version>`, with notes generated from the
commits, and creates the tag. Pushes that keep the same version don't make a release.

To try the process without a real release, push a tag with a suffix; it becomes a
pre-release:

```sh
git tag -a v0.2.0-rc.1 -m "ChipForge 0.2.0 rc 1"   # the app version must be 0.2.0
git push origin v0.2.0-rc.1
```

To remove it, delete the release on the Releases page, then the tag:
`git push origin :v0.2.0-rc.1 && git tag -d v0.2.0-rc.1`.

## Build it yourself

You need Rust, Node 24 with pnpm, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/)
for your system (on Debian/Ubuntu: `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev
libayatana-appindicator3-dev`).

```sh
pnpm install
pnpm --filter chipforge-desktop build   # web app, then installers in src-tauri/target/release/bundle
```

To develop, run the web dev server (`pnpm dev`) and in another terminal
`pnpm --filter chipforge-desktop dev`, which opens it in the desktop window.

## How it differs from the web app

- `web/src/lib/desktop.ts` detects the desktop app. Downloads go to the `save_file`
  command in `src-tauri/src/main.rs`, which shows a Save dialog and writes the file.
- No service worker and no Account page.
- The window only loads the app's own files (see the content security policy in
  `src-tauri/tauri.conf.json`). The one exception is **Split into parts** in Convert,
  which downloads the Demucs model from Hugging Face (`huggingface.co`, `*.hf.co`) the
  first time it's used.

Icons come from `src-tauri/icons/app-icon.png`; regenerate the set with
`pnpm --filter chipforge-desktop tauri icon src-tauri/icons/app-icon.png -o src-tauri/icons`
(and delete the mobile sizes it adds).
