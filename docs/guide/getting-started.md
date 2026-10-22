# Getting started

ChipForge makes retro game audio: sound effects, chiptune songs, and 8-bit versions of
music you already have. It plays everything on emulated sound chips (the NES's 2A03
and the Game Boy's DMG), so the results sound like the real hardware.

## Open it

**In your browser:** [spiritpaper.site/chipforge/app](https://spiritpaper.site/chipforge/app/).
Nothing to install. Chrome, Edge, Firefox and Safari all work; Chrome and Edge are
fastest at turning songs into chiptune. After the first visit it works offline.

**As a desktop app:** download it from the
[Releases page](https://github.com/spiritpaper/chipforge/releases/latest).

| System | File |
|---|---|
| Windows | `ChipForge_…_x64-setup.exe` (or the `.msi`) |
| macOS (Apple Silicon) | `ChipForge_…_aarch64.dmg` |
| Linux | `.AppImage` (any distribution), `.deb` (Debian, Ubuntu), `.rpm` (Fedora) |

The desktop app is the same as the web app, with native Save dialogs and no browser
around it.

### "Windows protected your PC"

The installers aren't code-signed yet, so Windows SmartScreen warns about an unknown
publisher. Click **More info**, then **Run anyway**. On macOS, right-click the app,
choose **Open**, then **Open** again. Signed installers are on the way; until then the
web app needs no install at all. See the [Code signing policy](../CODE_SIGNING.md).

## Where your work is saved

On your device: in the browser's storage (or the desktop app's), saved as you go. Nothing
is uploaded. Clearing your browser's site data deletes it, so keep backups of songs you
care about: **Compose → Export → Song file** saves a song, and **SFX Lab → Download
kept as .zip** saves your sounds.

If you use a ChipForge server with an account, your songs and sounds also sync between
your devices. See [Self-hosting](../../deploy/README.md).

## The three modes

| Mode | What it's for | Guide |
|---|---|---|
| **SFX Lab** | Sound effects: coins, jumps, lasers, explosions… | [Sound effects](sound-effects.md) |
| **Compose** | Writing chiptune songs in a tracker or piano roll | [Composing](compose.md) |
| **Convert** | Turning an MP3 or WAV into 8-bit | [Converting music](convert.md) |

Then [export](export.md) what you made for your [game](game-engines.md) or
[video](video-creators.md).

## Your first five minutes

1. Open **SFX Lab** and press **1** to **0** on your keyboard: each key makes a new sound
   of one kind (Coin, Jump, Laser…). Press **M** for a close variation of the one you
   like, **S** to keep it, **E** to download it as a WAV.
2. Open **Compose**, press **Space** to hear the starter song, then open **Songs** and
   pick a template under **Start a new song** (Overworld, Dungeon, Boss, Victory).
3. Open **Convert**, drop in a song with a clear melody, and choose **Chip version**.
