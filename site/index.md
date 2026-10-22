# ChipForge

Retro game audio, made in your browser. Make **8-bit sound effects**, write **chiptune
songs** on an emulated NES or Game Boy chip, or **turn any song into 8-bit**. Free, open
source, works offline, and nothing you make is ever uploaded.

[Open ChipForge](app/){: .btn .btn-primary }
[Download for Windows, macOS, Linux](https://github.com/spiritpaper/chipforge/releases/latest){: .btn }
[Getting started](docs/guide/getting-started.md){: .btn }

![Compose: a chiptune song in the tracker](images/compose-tracker.png){: .shot }

## For game developers

- **Sound effects in seconds.** Press a key for a coin, jump, laser or explosion, mutate
  until it's right, download the lot as a zip. [Sound effects](docs/guide/sound-effects.md)
- **Music that loops.** Start from a template, export OGG or WAV with loop points engines
  read. [Exporting](docs/guide/export.md)
- **Music that reacts.** Godot and Unity plugins play songs live from tiny files: switch
  sections on the bar line, mute layers, change tempo. [Game engines](docs/guide/game-engines.md)
- **Yours to ship.** Everything you make is royalty-free, commercial use included, no
  credit required. [FAQ](docs/guide/faq.md)

## For video creators

Retro background tracks, intros and sound effects for game channels, reviews and
streams, all yours to use in monetized videos. [For video creators](docs/guide/video-creators.md)

## Three tools in one

| | |
|---|---|
| ![SFX Lab](images/sfx-lab.png){: .shot } | **SFX Lab.** Ten presets plus random and mutate, plain-language fine-tuning, a history of kept sounds, WAV and zip export, share links. |
| ![Piano roll](images/compose-roll.png){: .shot } | **Compose.** A tracker and a piano roll on the same song, instruments you draw, templates, MIDI keyboard input, MIDI import and export, and four chip channels: <span class="ch-pulse1">Pulse 1</span>, <span class="ch-pulse2">Pulse 2</span>, <span class="ch-tri">Triangle</span>, <span class="ch-noise">Noise</span>. |
| ![Convert](images/convert.png){: .shot } | **Convert.** Drop in an MP3 or WAV. The Lo-fi filter crunches the recording instantly; Chip version listens for the notes, beat and drums and rebuilds the song on the chip, ready to edit. |

## Open source

ChipForge's code is on [GitHub](https://github.com/spiritpaper/chipforge): the chip
emulation, the engine plugins and the C library are MIT, the app and server AGPL-3.0
([Licensing](LICENSING.md)). Bugs, ideas and contributions are welcome:
[Contributing](CONTRIBUTING.md). Releases follow the
[Code signing policy](docs/CODE_SIGNING.md).
