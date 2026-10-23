# Sound effects (SFX Lab)

SFX Lab makes short game sounds. Every sound is a set of settings, so you can keep
changing it until it's right. There are two synths; pick one above the presets:

| Synth | Sounds like | Best for |
|---|---|---|
| **Chip (NES)** | What a NES could actually play: pulse, triangle and noise, 16 volume steps | Games that should sound like real 8-bit hardware |
| **Classic (sfxr)** | sfxr and jsfxr, exactly: square, saw, sine and noise, a resonant filter and a flanger | The classic indie game-jam sound, and sounds you made in sfxr before |

Each sound remembers its synth, so you can mix both in one history and one pack.

## Make a sound

Press a number key, or click a preset, for a new sound of that kind. Each press gives a
different take, so press again until one is close.

| Key | Chip preset | Classic preset |
|---|---|---|
| 1 | Coin | Coin |
| 2 | Jump | Jump |
| 3 | Laser | Laser |
| 4 | Explosion | Explosion |
| 5 | Power-up | Power-up |
| 6 | Hit | Hit |
| 7 | Blip | Blip |
| 8 | Select | Synth |
| 9 | Hurt | Tone (a plain 440 Hz beep) |
| 0 | Door | Click |

**R** makes a completely random sound, and **M** (mutate) makes a close variation of the
current one. **V** (Variations) adds 8 close takes at once, named after the sound
("Laser 3 take 1", "take 2"…): press **↑ / ↓** to hear them and **S** to keep the good
ones. It's the quickest way to get several versions of one sound, such as footsteps or
hits that shouldn't repeat exactly.

## Fine-tune it

Press **F** (or **Fine-tune**) to show every setting, in plain words:

- **Sound:** the wave (Pulse, Triangle or Noise), its tone color, volume, and for noise a
  metallic mode.
- **Pitch:** where it starts, how it slides (up or down, and how fast that changes), a
  point where it stops, and a jump (like a coin's second note).
- **Shape over time:** fade in, hold, punch, fade out.
- **Wobble:** vibrato depth and speed, and a repeat that restarts the pitch movement.
- **Grit:** crunch (a lower sample rate), brightness, and cutting the lows.

Classic sounds also have **Filters** (brightness with resonance, cutting lows, both
with sweeps) and a **Flanger**. Every value reads out in real units: Hz, milliseconds,
octaves per second.

Hover a setting for its technical name if you know synthesizers (classic sounds show
sfxr's own names, like `p_freq_ramp`).

**Locks:** the small lock beside a setting keeps it while you explore. Mutate,
Variations and new presets leave locked settings alone, so you can lock the pitch and
roll new coins in the same key.

## Keep, name and share

Every sound you make goes into the history on the right. Press **S** to keep one (kept
sounds stay when the history passes 200), rename it in the name field above the
sound, and use **↑ / ↓** to
go back through earlier ones.

**L** copies a share link: anyone who opens it gets the exact sound, no account needed.

## Bring in sounds from sfxr, jsfxr and rFXGen

**Import…** (above the presets) takes:

- a **jsfxr link** (`https://sfxr.me/#…`) or its share code, or jsfxr's JSON, pasted;
- **.sfs** files from the original sfxr, **.rfx** files from rFXGen and **.json** files from
  jsfxr, chosen or dropped anywhere on SFX Lab.

They open as classic sounds and play exactly as they did there: ChipForge's classic synth
is a port of jsfxr's, checked against it sample for sample. To go the other way, **Copy
for jsfxr** copies a link that opens the sound in jsfxr, and ChipForge's own links for
classic sounds carry the same code.

## Download

- **E** downloads the current sound as **WAV** or **OGG** (pick the format and sample rate
  next to the button). OGG files are many times smaller, which suits web games.
- **Download kept as .zip** saves every kept sound in that format, plus `sfx.json` with
  their names, synth and settings.

The sounds are yours to use, including in commercial games. See
[Using what you make](faq.md#can-i-use-what-i-make-in-a-commercial-game-or-a-monetized-video).

## All the keys

| Key | Action |
|---|---|
| Space | Play the current sound |
| 1–9, 0 | New sound from a preset |
| R | Random sound |
| M | Mutate |
| V | Variations: 8 close takes |
| S | Keep / stop keeping |
| E | Download (WAV or OGG) |
| L | Copy share link |
| F | Show or hide fine-tune |
| ↑ / ↓ | Move through history |
