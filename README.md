# ChipForge

Turn your music into 8-bit chiptune, compose chip music, and make retro sound effects
for your games.

- [Product & build plan](docs/PLAN.md)
- [Design system](docs/DESIGN.md)

**Status:** Phase 4 is done.

- **SFX Lab** makes game sound effects: ten seeded presets plus random, mutate,
  fine-tune sliders, a history with kept sounds, WAV and zip export, share links.
- **Compose** writes chiptune songs on an emulated NES or Game Boy chip (switch any
  time; the Game Boy's wave channel has eight waveforms): a tracker and a piano
  roll on the same patterns, instruments with drawable volume/tone/bend/chord
  macros, a song-order strip, undo, autosave, starter templates, MIDI keyboard
  input, MIDI import/export, and WAV/OGG export with loop points for game engines.
- **Convert** turns any recording into 8-bit: the **Lo-fi Filter** crunches it live,
  and **Chip version** transcribes its notes, beat and drums (Basic Pitch on your GPU
  via WebGL) and rebuilds it as an editable chip song. Nothing is uploaded.

- **Desktop app** for Linux, Windows and macOS: the same app offline in a native
  window, with native Save dialogs ([desktop/](desktop/README.md)).
- **Game engines** play songs live from tiny `.chipsong` files, with adaptive music
  (switch section on the bar line, mute layers, change tempo, play-once jingles):
  a [Godot 4 plugin](engines/godot/README.md), a [Unity package](engines/unity/README.md)
  and a [C library](native/include/chipforge.h) for everything else. Songs also export
  as VGM (NES or Game Boy register logs for VGM players) and FamiTracker text.

The web app runs in the browser and works offline after the first visit.

## Layout

| Path | What |
|------|------|
| `core/` | `chipcore`: the Rust sound chip (2 pulse, triangle, noise, APU mixer), tracker sequencer (`tracker.rs`, which also documents the `.chipsong` binary format), SFX synth and VGM export. Builds natively and to WASM. |
| `native/` | `chipforge`: the player as a C library (`include/chipforge.h`) for engines and native apps. |
| `engines/godot/` | Godot 4 GDExtension (Rust): `ChipSongPlayer` node, `.chipsong` resources, demo project. |
| `engines/unity/` | Unity package: C# wrapper, `ChipSongPlayer` component, `.chipsong` importer. |
| `web/` | Svelte 5 + Vite app. `src/audio/` hosts the chip in an AudioWorklet. |
| `api/` | FastAPI service stub, kept for optional server-side conversion (Phase 3b). |
| `docs/` | Plan and design system. |

## Requirements

Rust (stable) with `rustup target add wasm32-unknown-unknown`, Node 24 with pnpm, and
[uv](https://docs.astral.sh/uv/) for the API. Optional, for the engine and export
checks: a C compiler, Godot 4.3+, the .NET SDK, and libvgm's `vgm2wav`
(`VGM2WAV=/path/to/vgm2wav`).

## Commands

```sh
pnpm install
pnpm dev              # builds the WASM core, then starts the app at http://localhost:5173
pnpm test             # Rust workspace, web and API tests
pnpm build && pnpm --filter web e2e   # end-to-end checks in headless Chrome

cargo run --release -p chipcore --example render_song -- song.chipsong song.wav   # render offline
cargo run --release -p chipcore --example export_vgm -- song.chipsong song.vgm    # NES VGM
native/tests/c/run.sh                 # the C header against the shared library
engines/godot/test.sh                 # Godot plugin, headless (GODOT=/path/to/godot)
engines/unity/test.sh                 # Unity C# wrapper (needs the .NET SDK)
cd api && uv run uvicorn app.main:app --reload                     # run the API
```

## Keyboard

SFX Lab:

| Key | Action |
|-----|--------|
| Space | Play the current sound |
| 1–9, 0 | New sound from a preset (Coin … Door) |
| R | New random sound |
| M | Mutate: a close variation |
| S | Keep / stop keeping |
| E | Download WAV |
| L | Copy share link |
| F | Show or hide fine-tune |
| ↑ / ↓ | Move through history |

Compose (tracker focused):

| Key | Action |
|-----|--------|
| Z–M, Q–P (and the number row for sharps) | Enter notes: two octaves of piano |
| 1 / = | Note off / release |
| 0–9, A–F | Instrument, volume and effect values |
| [ ] | Octave down / up |
| , . | Previous / next instrument |
| Arrows, Tab, PageUp/Down, Home/End | Move (Shift+arrows selects) |
| Ctrl+C / X / V, Ctrl+A | Copy, cut, paste, select channel/pattern |
| Ctrl+↑/↓ (Shift for octaves) | Transpose |
| Insert / Backspace / Delete | Insert row / delete row / clear |
| Enter | Play from the cursor |

Anywhere in Compose: Space plays or stops, Ctrl+Z / Ctrl+Shift+Z undo and redo,
and ` switches between tracker and piano roll.

## Contributing

Issues and pull requests are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md). Report security problems privately as described
in [SECURITY.md](SECURITY.md).

## License

The sound engine, C library and engine plugins (`core/`, `native/`, `engines/`) are
MIT, so you can ship them in any game. The app and server are AGPL-3.0. Music and
sounds you make with ChipForge are yours. Details: [LICENSING.md](LICENSING.md);
bundled third-party work: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
