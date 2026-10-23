# Exporting

Open **Compose → Export**. Every format is made on your device.

| Format | For | Notes |
|---|---|---|
| **WAV / OGG audio** | Videos, game engines, anything | Choose **Loop for games** (stops where the song loops back, with loop points engines read), **Fade out for listening** (plays the loop once more and fades) or **Fit to length** (exactly as long as you type, like 2:30). 44.1 or 48 kHz. Tick **Stems** for a zip with each channel as its own file too. |
| **Game engine file** (`.chipsong`) | The ChipForge plugins for Godot, Unity and C/C++ | A few KB. The game plays it live, so music can react: mute layers, change tempo, switch sections. See [Game engines](game-engines.md). |
| **VGM** | VGM players (VGMPlay, foobar2000) and chiptune archives | The exact writes to a real NES or Game Boy sound chip. |
| **FamiTracker text** | FamiTracker or Dn-FamiTracker (**File → Import Text**) | Notes, instruments, volumes, tempo and most effects carry over, and the file opens in ChipForge again. Game Boy songs play on the NES chip there. |
| **MIDI** | Other music software (DAWs) | Notes and tempo only; Noise becomes General MIDI drums. |
| **Song file** (`.chipsong.json`) | Backups, moving songs between browsers | Open it again from **Songs**. |
| **Share link** | Sending a song to someone | Needs an account on a ChipForge server. |

Sound effects export from SFX Lab: **E** for one WAV, or **Download kept as .zip** for
all kept sounds plus `sfx.json` with their settings. See [Sound effects](sound-effects.md).

## WAV or OGG?

- **OGG** for game engines (Godot and Unity both import it) and anywhere file size
  matters: many times smaller than WAV.
- **WAV** for video editors and when you'll process the sound further.

## Fit to length and stems

**Fit to length** makes a track exactly as long as a video needs: type a time like
`2:30` (up to 20 minutes). The song plays, its loop repeats as often as it takes, and
it fades out over the last few seconds so it ends right on time.

**Stems** adds a file for each channel (pulse 1, pulse 2, triangle or wave, noise) next
to the full mix, all exactly the same length, in one zip. In a video editor, put the
stems on separate tracks and turn the melody down while someone talks; in a game, fade
layers in and out with your audio middleware.

## Seamless loops

Pick **Loop for games**. The file stops where the song loops back, and carries loop
points marking the part that repeats, so an intro plays once and the rest loops
forever. WAV files store them in a `smpl` chunk, OGG files as `LOOPSTART` and
`LOOPLENGTH` tags (in samples). Godot, Unity, FMOD and RPG Maker read them; turn looping
on for the sound in your engine.

If your song loops back to the very start (the Loop mark on the first part), any player
that loops the whole file loops it seamlessly.
