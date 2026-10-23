# Third-party notices

ChipForge includes or downloads the following third-party works. Their licenses apply
to them, not ChipForge's.

## Shipped in the web app

| Work | License | Notes |
|---|---|---|
| [Basic Pitch](https://github.com/spotify/basic-pitch-ts) by Spotify, including its model weights | Apache-2.0 | Note transcription in Convert → Chip version. Copyright Spotify AB. |
| [TensorFlow.js](https://github.com/tensorflow/tfjs) | Apache-2.0 | Runs Basic Pitch. Copyright Google LLC. |
| [wasm-media-encoders](https://github.com/arseneyr/wasm-media-encoders) (Ogg Vorbis encoder only) | MIT; libogg and libvorbis are BSD-3-Clause (Xiph.Org Foundation) | OGG export. The package's MP3 encoder is deliberately not bundled. |
| [Chakra Petch](https://fonts.google.com/specimen/Chakra+Petch), [JetBrains Mono](https://www.jetbrains.com/lp/mono/), [Silkscreen](https://fonts.google.com/specimen/Silkscreen) via Fontsource | SIL Open Font License 1.1 | Interface and data typefaces. |
| [Svelte](https://svelte.dev) | MIT | UI framework. |
| [fflate](https://github.com/101arrowz/fflate) | MIT | Zip export. |
| [jsfxr](https://github.com/chr15m/jsfxr) by Chris McCormick and contributors, a port of [sfxr](https://www.drpetter.se/project_sfxr.html) by Tomas Pettersson | jsfxr: the Unlicense (public domain); sfxr: MIT, Copyright (c) 2007 Tomas Pettersson | The classic synth in `core/src/sfxr.rs` is a port of jsfxr's, presets and mutation included. `tools/jsfxr-parity/` downloads jsfxr to check it. |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | MIT | Runs the Demucs network for Convert → Split into parts. Copyright Microsoft Corporation. Loaded only when a song is split. |
| [Demucs](https://github.com/adefossez/demucs) code (the network's structure in `web/src/convert/separate/htdemucs.onnx`, and the spectrogram and segment code ported to `web/src/convert/separate/demucs.ts`) | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. `tools/demucs-onnx/` makes the graph from the original code. |
| [idb-keyval](https://github.com/jakearchibald/idb-keyval) | Apache-2.0 | Browser storage. |
| [@tonejs/midi](https://github.com/Tonejs/Midi), seedrandom, long and other small dependencies of the above | MIT, Apache-2.0, BSD, ISC | Pulled in by TensorFlow.js and Basic Pitch. `pnpm --filter web licenses list --prod` lists every package and license. |

## Downloaded when you ask for it (not shipped)

| Work | License | Notes |
|---|---|---|
| [HTDemucs model weights](https://huggingface.co/adefossez/HTDemucs) by Alexandre Défossez | None stated | Downloaded straight from the author's Hugging Face page (a fixed revision, checked by SHA-256) the first time you use **Split into parts**, then cached in your browser. ChipForge doesn't include or host them. The model page listed the MIT license until 31 August 2026, when the author removed it; earlier, the weights were described as for research use. Until the author says otherwise, treat them as having no license. |

## Built into the engine plugins

| Work | License | Notes |
|---|---|---|
| [godot-rust (gdext)](https://github.com/godot-rust/gdext) | MPL-2.0 | Compiled into the Godot plugin. MPL-2.0 is file-level copyleft: its source is available at the link above and on crates.io; ChipForge's own files stay MIT. |
| glam, libc, proc-macro2, quote and other Rust crates used by godot-rust | MIT / Apache-2.0 | `cargo metadata` lists them. |

`chipcore` and the `chipforge` C library have no third-party dependencies.

## Used only for development and testing (not distributed)

Godot, the .NET SDK, libvgm (`vgm2wav`), ffmpeg, Chromium and Puppeteer are used to
test ChipForge and are not part of it, as are PyTorch and the rest of
`tools/demucs-onnx/`'s Python environment.
