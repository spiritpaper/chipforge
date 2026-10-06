# ChipForge — Product & Build Plan

Turn any song into chiptune, compose chip music, and generate game sound effects —
all in one browser app, exported straight into your game.

Users:

- **Indie game devs** who need SFX and a soundtrack fast, without music training.
- **Chiptune hobbyists** who want a modern, friendly tracker.
- **Curious listeners** who want to hear their favorite song "as an NES game".

Each phase ends with something shippable. Phases are sequential; steps inside a phase
are ordered by dependency.

---

## Phase 0 — Foundations (~1 week)

Goal: a sound comes out of the browser from our own synth core, and the repo is set
up so every later phase plugs into it.

| # | Step | Done when |
|---|------|-----------|
| 0.1 | Monorepo layout: `core/` (Rust synth), `web/` (Svelte + Vite), `api/` (FastAPI), `docs/` | `pnpm dev`, `cargo test`, `uv run pytest` all work from a fresh clone |
| 0.2 | `chipcore` crate: NES-style channels — 2 pulse (4 duty cycles), triangle (32-step), noise (15-bit LFSR, long/short mode) | Unit tests verify pitch, duty, determinism |
| 0.3 | Plain C-ABI WASM exports (`chip_new`, `chip_render`, `chip_note_on`…) — no JS glue so it runs inside an `AudioWorklet` | `cargo build --target wasm32-unknown-unknown` produces a <50 KB `.wasm` |
| 0.4 | `AudioWorklet` host: main thread fetches the `.wasm`, worklet instantiates it, renders 128-frame blocks | No glitches at 48 kHz with 4 channels |
| 0.5 | App shell with the design system (tokens, fonts, layout rails) | Matches `docs/DESIGN.md` |
| 0.6 | Demo screen: transport, 4 channel strips with live oscilloscopes, mute/solo, hard-coded song | Press Space → music, scopes move |
| 0.7 | Tests: Rust unit + golden-property tests; Vitest for web; pytest for api | All green in CI |
| 0.8 | GitHub Actions CI: fmt, clippy, test, wasm build, web build | Green on push |

---

## Phase 1 — SFX Lab: the first release (2–3 weeks) — built

Goal: a game dev opens the app and has a usable "coin pickup" sound in under 10 seconds.

1. **SFX parameter model** (`core/src/sfx.rs`): one struct describing a sound — wave type,
   envelope (attack/sustain/punch/decay), start pitch, pitch slide + delta-slide,
   vibrato, arpeggio jump, duty sweep, retrigger, low/high-pass filter, bit-crush.
   Pure function `render_sfx(params, sample_rate) -> Vec<f32>` so it's testable and
   identical in the browser and future engine plugins.
2. **Presets with seeded randomness**: Coin, Jump, Laser, Explosion, Power-up, Hit,
   Blip, Select, Hurt, Door. Each preset is a *distribution* of parameters; pressing it
   rolls a new variation. Seed is stored so any sound is reproducible.
3. **Mutate**: small random nudge of the current sound ("give me something close to this").
4. **History rail**: every generated sound is kept in a vertical list with a mini
   waveform; click to recall, star to keep. Unlimited undo by design — nothing is lost.
5. **Fine-tune panel**: sliders grouped by plain-language names ("Pitch", "Shape over
   time", "Wobble", "Grit") with live preview on release (and optional preview-on-drag).
6. **Waveform + spectrum view** of the current sound.
7. **Export**: WAV (16-bit, 44.1/48 kHz); batch-export kept sounds as a zip with a
   `sfx.json` manifest (name, duration, seed, params). OGG moved to Phase 2, where long
   music files need it; WAV is what engines prefer for short SFX anyway.
8. **Share link**: params encoded in the URL hash (base64url of compact bytes) — no
   server needed.
9. **Persistence**: IndexedDB for library + history; works offline (PWA service worker).
10. **Ship**: deploy web app as static site (Cloudflare Pages / Netlify). *Not done yet: needs a hosting account.*

UX targets: first sound ≤ 1 click; every control reachable by keyboard
(`1–0` presets, `R` random, `M` mutate, `Space` replay, `S` keep, `E` export WAV,
`L` copy link, `F` fine-tune, `↑/↓` history).

As built, also: the first slider change forks a copy so the original stays in history;
silent sounds explain why ("Pitch starts below Stop below…"); a "Pitch" spectrogram
under the waveform makes slides and jumps visible.

---

## Phase 2 — Composer (4–6 weeks) — built

Goal: write a full looping game track in a tracker *or* a piano roll, on the same data.

1. **Song data model** (shared Rust + TS types, versioned JSON):
   `Song { bpm, speed, chip, instruments[], patterns[], order[], loop_point }`.
   `Pattern` = rows × channels; cell = note, instrument, volume, effect.
2. **Sequencer in `chipcore`**: tick-accurate playback of the song, effects
   (arpeggio `0xy`, slide up/down, portamento, vibrato, volume slide, note cut,
   pattern jump/break). Runs in the worklet; UI only sends edits.
3. **Instrument editor**: per-instrument macros — volume, duty, pitch, arpeggio —
   drawn as bar graphs with the mouse, with loop/release markers.
4. **Tracker view**: virtualized canvas grid, channel-colored columns, keyboard note
   entry (two-octave "piano on QWERTY" layout), edit step, selection copy/paste/
   transpose, follow-playhead.
5. **Piano-roll view**: same pattern data drawn as notes; draw/erase/resize, snap grid.
   Toggle between views with `Tab` — beginners start in piano roll.
6. **Arrangement strip**: pattern order as blocks; drag to reorder, duplicate, set loop.
7. **Undo/redo**: command-pattern history over song edits; autosave to IndexedDB.
8. **Live input**: Web MIDI keyboard support; record into the pattern.
9. **Import/export**: MIDI import (auto-assigns tracks to channels), MIDI export,
   WAV/OGG render (offline, faster than real time in a Worker), loop-aware OGG.
10. **Starter templates**: "Overworld", "Dungeon", "Boss", "Victory jingle" — a blank
    page is the hardest part for newcomers.

As built, also:
- The song engine follows FamiTracker semantics (rows × speed ticks, effects 0 1 2 3
  4 A B D F S V, macros with loop and release) so tracker users feel at home.
- Instruments edit in plain words: Volume, Tone, Bend, Chord.
- Export renders in a Web Worker; WAV gets a `smpl` loop chunk and OGG gets
  LOOPSTART/LOOPLENGTH tags, which most engines read. Songs also export as MIDI and
  as `.chipsong.json` files for backup.
- MIDI import maps the three busiest parts to lead, harmony and bass, channel 10 to
  drums, and stores repeated sections once.
- Sound check (the Phase 0 demo) was retired; its song is a template now.
- Not done: Speed changes per pattern use the F effect rather than a UI control;
  real-time MIDI recording writes to the row playing now (no swing/quantize options).

---

## Phase 3 — Converter (4–6 weeks) — built in the browser

Goal: upload a song, get back an editable chiptune version that sounds recognizably
like the original.

The plan below assumed a Python service with stem separation. To avoid gigabytes of
models, Phase 3 shipped **entirely in the browser** instead; the server path stays
here as Phase 3b for later.

Built:
1. **Lo-fi Filter**: sample-and-hold, bit depth, square fuzz, brightness, mix; four
   presets; live A/B; WAV/OGG export rendered with the same DSP class as the preview.
2. **Chip version**: Basic Pitch (0.9 MB of weights) on TensorFlow.js in a worker,
   on the GPU through WebGL; tempo and beat from an onset envelope below 4 kHz; drums
   from band-jump classification; clean-up of overtones, bass octave errors and notes
   the model splits at drum hits (using each note's measured attack); an arranger
   for lead, chords-as-arpeggios, bass and drums; tempo half/double, detail, chord
   and drum options; A/B in place; **Open in Compose**.
3. **Accuracy check**: an end-to-end test transcribes a generated song with known
   contents; the result is exact (melody 16/16, bass 8/8, kicks and snares 8/8).

Limits of the browser approach (no stems): dense mixes with many instruments in the
same range give busier, less certain parts. The Detail setting and Compose are the
remedies.

### Phase 3b — server conversion (later, optional)

2. **Worker service**: Python worker with a Redis queue; GPU optional.
   API: `POST /jobs` (upload) → `GET /jobs/{id}` (progress events via SSE) →
   `GET /jobs/{id}/result`.
3. **Stem separation**: Demucs (htdemucs) → vocals / bass / drums / other, then the
   same transcription and arranger per stem, which should help dense mixes most.
8. **Limits & caching**: content-hash cache, length limit, uploads deleted after 24 h,
   clear personal-use notice.

---

## Phase 4 — Game-dev integration (3–4 weeks)

1. **Export packs**: zip with OGG/WAV, loop points (`LOOPSTART/LOOPLENGTH` tags), and a
   manifest; naming conventions configurable.
2. **Native core build**: `chipcore` as a C library (static/dynamic) for desktop/mobile.
3. **Godot plugin** (GDExtension): `ChipSongPlayer` node plays `.chipsong` files live;
   tiny files, dynamic mute/tempo for adaptive music.
4. **Unity plugin** (native plugin + C# wrapper) with the same API.
5. **Retro formats**: NSF export (real NES playback), VGM, FamiTracker text import/export.
6. **Docs site** with copy-pasteable snippets for each engine.

---

## Phase 5 — Platform & polish (ongoing)

1. Accounts (email magic link + OAuth), cloud sync of projects and SFX libraries.
2. Public gallery of original songs/SFX packs; "Remix" forks a project.
3. More chip profiles: Game Boy (wave channel), C64 SID (filter), SN76489, YM2612 FM.
4. Tauri desktop app with offline conversion (bundled models).
5. AI helpers: text → song sketch ("boss theme, C minor, 160 BPM"), text → SFX.
6. Accessibility audit, localization, onboarding tour.
7. Monetization: Pro tier (long/HD conversions, extra chips, engine plugins,
   commercial license).

---

## Cross-cutting decisions

- **One synth core** (Rust) everywhere: browser (WASM), engine plugins (native),
  server rendering. Sound is identical across all of them.
- **Audio thread owns sound**: the UI never computes samples; it sends messages.
- **Everything editable**: every generated thing (SFX, conversion) opens as an
  editable object, never a dead-end file.
- **Local-first**: projects live in IndexedDB; the server is only needed for ML
  conversion and sharing.
