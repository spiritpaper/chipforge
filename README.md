# ChipForge

Turn your music into 8-bit chiptune, compose chip music, and make retro sound effects
for your games.

- [Product & build plan](docs/PLAN.md)
- [Design system](docs/DESIGN.md)

**Status:** Phase 2 is done.

- **SFX Lab** makes game sound effects: ten seeded presets plus random, mutate,
  fine-tune sliders, a history with kept sounds, WAV and zip export, share links.
- **Compose** writes chiptune songs on the emulated NES chip: a tracker and a piano
  roll on the same patterns, instruments with drawable volume/tone/bend/chord
  macros, a song-order strip, undo, autosave, starter templates, MIDI keyboard
  input, MIDI import/export, and WAV/OGG export with loop points for game engines.

Everything runs in the browser and works offline after the first visit.

## Layout

| Path | What |
|------|------|
| `core/` | `chipcore`: the Rust sound chip (2 pulse, triangle, noise, APU mixer), tracker sequencer (`tracker.rs`, which also documents the song binary format) and SFX synth. Builds natively and to WASM. |
| `web/` | Svelte 5 + Vite app. `src/audio/` hosts the chip in an AudioWorklet. |
| `api/` | FastAPI service. It's a stub for now; conversion jobs arrive in Phase 3. |
| `docs/` | Plan and design system. |

## Requirements

Rust (stable) with `rustup target add wasm32-unknown-unknown`, Node 24 with pnpm, and
[uv](https://docs.astral.sh/uv/) for the API.

## Commands

```sh
pnpm install
pnpm dev              # builds the WASM core, then starts the app at http://localhost:5173
pnpm test             # Rust, web and API tests

cd core && cargo run --release --example render_song -- song.cfs song.wav   # render an encoded song offline
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
