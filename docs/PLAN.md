# ChipForge — Product & Build Plan

Turn any song into chiptune, compose chip music, and generate game sound effects —
all in one browser app, exported straight into your game.

Users:

- **Indie game devs** who need SFX and a soundtrack fast, without music training.
- **Chiptune hobbyists** who want a modern, friendly tracker.
- **Video creators** (YouTubers, streamers) who need background tracks and sound
  effects they're free to use.
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

## Phase 4 — Game-dev integration (3–4 weeks) — built

Built:
1. **Engine file**: Compose exports `.chipsong`, the core's compact binary song format
   (First Light is 1.4 KB). Audio exports (WAV `smpl`, OGG `LOOPSTART`) came in Phase 2.
2. **Native library** (`native/`): a C API with a hand-written header, as cdylib and
   staticlib, plus adaptive controls added to the core: switch section at the end of
   the current pattern, per-channel mute, tempo scale, play once with a finished
   signal, master volume. A C program compiled with `-Werror` plays a song through it.
3. **Godot plugin** (`engines/godot/`, Rust GDExtension, Godot 4.3+): `ChipSongPlayer`
   node and `.chipsong` resources; 12 headless checks pass in Godot 4.7.2.
4. **Unity package** (`engines/unity/`): the C# wrapper is compiled and tested with
   .NET against the native library (14 checks, including cross-thread control). The
   MonoBehaviour and importer need Unity and haven't run there yet.
5. **Retro formats**: VGM export (checked with libvgm, an independent NES APU
   emulator: correct pitch and loop point) and FamiTracker text export (format-tested;
   not opened in FamiTracker itself, a Windows program).
6. **Docs**: each engine has a README with copy-paste snippets (instead of a docs site).

Not done:
- **NSF export** needs a 6502 sound driver and bank switching; deferred.
- **FamiTracker import**, and prebuilt plugin binaries for Windows and macOS (CI builds
  and tests on Linux only).

---

## Phase 5 — Open source, sync and more chips — built

Built:
1. **Open source**: core, native library and engine plugins under MIT (easy to ship
   in games); the app, server and everything else under AGPL-3.0, so hosted copies
   share their changes. Contributing guide, code of conduct, security policy, issue
   templates, third-party notices. The bundle leaves out the LGPL MP3 encoder.
2. **Accounts and sync**: email magic-link sign-in (no passwords), sessions in
   HttpOnly cookies, versioned sync of songs and the SFX library with conflicts kept
   as copies, read-only share links. Self-hosting with Docker Compose (Caddy + API),
   smoke-tested in CI.
3. **Plans**: Free / Supporter / Pro from an editable JSON file, enforced by the
   server (402 with a plain message; songs over the limit stay on the device).
   Prepaid months or years by card through ZarinPal or in crypto through BTCPay
   Server (confirmed by signed webhooks), plus an admin command to grant plans.
   Off by default, so self-hosted servers have no limits. Both gateways are tested
   against stand-ins for their APIs only; make real test payments before launch.
4. **Game Boy chip**: two pulses, the 4-bit wave channel with eight waveforms, and
   noise with its 7-bit mode. Any song switches between NES and Game Boy; VGM export
   writes Game Boy registers (checked with libvgm). Engines play both.
5. **Desktop app** (Tauri 2): offline, native Save dialogs. CI builds installers for
   Linux, Windows and macOS; it hasn't been run on this machine, which lacks
   WebKitGTK, and the installers aren't code-signed.

Not done:
- **OAuth sign-in**, the **public gallery** with remixing, and the **Library** mode.
- **More chips**: C64 SID, SN76489, YM2612 FM.
- **Server conversion on a GPU** (the Pro plan lists it as coming; needs Phase 3b).
- **AI helpers** (text to song or SFX), an accessibility audit, localization and an
  onboarding tour.
- Offline chip conversion in the desktop app works as in the browser (Basic Pitch is
  bundled); there's no larger desktop-only model.

---

## Phase 6 — Growth: from first sound to community

The goal is getting people from opening the app to a usable sound in about a minute,
then giving them reasons to bring others in. Ordered by value for effort; the first
three are next.

### 6a — Before traction (cheap, high value)
1. **Royalty-free, said plainly**: "Everything you make is yours: royalty-free, use
   it anywhere, no credit required" on the home page and next to every export (also
   in the exported files' metadata and a LICENSE.txt in packs).
2. **SFX variations and packs**: a **Variations** button that makes 10 takes on the
   current sound to pick from, starter presets (Coin, Jump, Hit, Power-up, Laser,
   Explosion, Menu), and exporting a whole pack as a zip with sensible file names in
   WAV and OGG.
3. **Engine stores**: list the Godot plugin in the Godot Asset Library and the Unity
   wrapper in the Asset Store; every listing is free discovery.
4. **Song templates**: Overworld, Boss fight, Menu loop, Victory jingle, Game over.
5. **Exports for each audience**:
   - Game devs: seamless loops (loop point kept, no click at the seam) and packs.
   - Video creators: fit a track to a length ("make it 3:20"), MP3, and stems so a
     voice-over can sit on top.
6. **More engines**: export for Phaser/JS, GameMaker and Defold.
7. **Game jams**: sponsor Ludum Dare, GMTK and itch.io jams with free Pro during the
   jam and a "Made with ChipForge" badge.

### 6b — Community, once people show up
1. **Public gallery with remixing**: share links made browsable; "Remix this" copies
   a song into your own projects, crediting the original.
2. **Discord** and short "make this sound in 30 seconds" videos (Shorts, TikTok).

### 6c — If it takes off
1. **Adaptive music**: songs in layers that the Godot and Unity plugins fade in and
   out by an intensity value (exploring → combat). A clear differentiator.
2. **More chips as Pro features**: C64 SID, Sega Genesis (YM2612 FM), a PICO-8 style.
3. **AI helpers**: describe a sound in words to get its settings ("a laser that
   fades down"); hum a tune to get a melody, building on the converter.
4. **Working together**: live co-editing of a song, and a Team plan for studios.
5. **Sound-pack marketplace**: creators sell packs and keep most of the revenue.
   Only once the community exists.
6. **Plans**: Free stays genuinely useful (the open-source core earns trust). Pro adds
   more chips, stems, adaptive music, cloud storage and bigger packs; Team and
   education pricing.

### What to measure
- **Activation**: share of new users who export something within 5 minutes.
- **Weekly exporters**: people who export at least once a week.
- **Share-link visits**: visitors arriving through shared songs and sounds.
- **Template use**: which SFX presets and song templates are used, to pick what to
  build next.

Measure without tracking people: count events on the server (or with a
privacy-friendly, cookieless tool), never send song contents.

---

## Cross-cutting decisions

- **One synth core** (Rust) everywhere: browser (WASM), engine plugins (native),
  server rendering. Sound is identical across all of them.
- **Audio thread owns sound**: the UI never computes samples; it sends messages.
- **Everything editable**: every generated thing (SFX, conversion) opens as an
  editable object, never a dead-end file.
- **Local-first**: projects live in IndexedDB; the server is only needed for ML
  conversion and sharing.
