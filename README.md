# ChipForge

Turn your music into 8-bit chiptune, compose chip music, and make retro sound effects
for your games.

- [Product & build plan](docs/PLAN.md)
- [Design system](docs/DESIGN.md)

**Status:** Phase 1 is done. **SFX Lab** makes game sound effects: ten seeded presets plus
random, mutate, fine-tune sliders, a history with kept sounds, WAV and zip export,
share links, and offline use. **Sound check** (from Phase 0) plays a demo song on the
emulated NES chip with live per-channel scopes.

## Layout

| Path | What |
|------|------|
| `core/` | `chipcore`: the Rust sound chip (2 pulse, triangle, noise, APU mixer, sequencer). Builds natively and to WASM. |
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

cd core && cargo run --release --example render_demo -- demo.wav   # render the demo offline
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

Sound check:

| Key | Action |
|-----|--------|
| Space | Play / stop |
| 1–4 | Mute a channel |
| Shift+1–4 | Solo a channel |
