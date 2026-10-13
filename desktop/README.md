# ChipForge desktop

The ChipForge web app in a native window ([Tauri 2](https://tauri.app)), for Linux,
Windows and macOS. Everything works offline. Exports open the system Save dialog. There
is no account page, because sync needs a ChipForge server; use the web app for that.

## Download

GitHub Actions builds installers (AppImage, .deb, .rpm, .msi, .exe and .dmg) when the
desktop app changes, for `v*` tags, and on demand: **Actions → Desktop → Run workflow**,
then download them from the run's artifacts. The builds aren't code-signed yet, so
Windows SmartScreen and macOS Gatekeeper will warn the first time (on macOS,
right-click the app → Open).

## Releasing

1. Set the version in `desktop/src-tauri/tauri.conf.json` (and `desktop/src-tauri/Cargo.toml`,
   `web/package.json` to match), commit and push.
2. Tag the commit and push the tag:
   ```sh
   git tag -a v0.1.0 -m "ChipForge 0.1.0"
   git push origin v0.1.0
   ```
   A suffix such as `v0.1.0-rc.1` makes a pre-release, handy for trying the process.
3. The Desktop workflow checks the tag matches the version, builds the installers and
   drafts a release with them attached and notes generated from the commits. Review it
   under **Releases**, then press **Publish release**.

To throw away a trial run, delete the draft on the Releases page, then the tag:
`git push origin :v0.1.0-rc.1 && git tag -d v0.1.0-rc.1`.

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
  `src-tauri/tauri.conf.json`).

Icons come from `src-tauri/icons/app-icon.png`; regenerate the set with
`pnpm --filter chipforge-desktop tauri icon src-tauri/icons/app-icon.png -o src-tauri/icons`
(and delete the mobile sizes it adds).
