# Composing

Compose writes songs for a sound chip with four channels:

| Channel | NES (2A03) | Game Boy (DMG) | Usually |
|---|---|---|---|
| Pulse 1 | Square wave, 4 tone colors | Square wave, 4 tone colors | Melody |
| Pulse 2 | Square wave, 4 tone colors | Square wave, 4 tone colors | Harmony or chords |
| Triangle / Wave | Triangle wave | Wave channel, 8 waveforms | Bass |
| Noise | 16 noise sounds | 16 noise sounds | Drums |

Each channel plays one note at a time. That limit is the chiptune sound: chords become
fast arpeggios, and drums are short noise bursts. Switch chips with **Chip** at the top
at any time; notes and instruments carry over.

## How a song is built

- A **pattern** is a block of rows (64 by default) with a column per channel.
- The **song order** strip lists which pattern plays when. Drag blocks to reorder them.
  Press **Arrange** next to it for the part buttons: **New pattern**, **Repeat** (plays
  the same pattern again; editing one changes both) and **Duplicate** (a copy you can
  change separately).
- The song plays to the end of the order, then loops back to the **Loop** mark (set it
  with **Loop from here**). Game music loops forever; that mark is where it comes back to.
- **Tempo** (BPM) and **Speed** (ticks per row) set how fast rows go. Each row is 1/4
  of a beat.

Start from a template (**Songs → Start a new song**) to see how a working song is put
together:

| Loops | Jingles |
|---|---|
| Overworld, Town, Menu, Title Screen, Dungeon, Boss, First Light | Victory, Level Clear, Game Over |

## Tracker

The tracker is the classic way to write chip music: rows run down the screen and you
type notes into them with the computer keyboard laid out as a piano.

```
C-4 01 F A04
 │   │ │  └── effect A, value 04
 │   │ └───── volume (0–F)
 │   └─────── instrument
 └─────────── note and octave ("---" stops, "===" releases)
```

The bottom letter row is a piano octave (**Z** is C, **S** is C#, **X** is D…), the top
row is the octave above (**Q** is C), and **[ ]** change octave. **Step** sets how many
rows the cursor moves after each note. On a phone, Rows, Octave and Step are under
**Settings**.

**Selecting:** Shift+arrows, or drag with the mouse. Then **drag the selection** to
move it, or **Ctrl-drag** to copy it. **Ctrl+C / X / V** copy, cut and paste;
**Ctrl+↑ / ↓** transposes (add Shift for an octave); **Ctrl+A** selects the channel,
press again for the whole pattern.

| Key | Action |
|---|---|
| Z–M, Q–P (number row for sharps) | Enter notes |
| 1 / = | Note off (stop) / release (let it fade) |
| 0–9, A–F | Instrument, volume and effect values |
| [ ] | Octave down / up |
| , . | Previous / next instrument |
| Arrows, Tab, PageUp/Down, Home/End | Move (Shift selects) |
| Ctrl+C / X / V, Ctrl+A | Copy, cut, paste, select |
| Ctrl+↑ / ↓ | Transpose |
| Insert / Backspace / Delete | Insert row / delete row / clear |
| Enter | Play from the cursor |
| Ctrl+← / → | Previous / next part of the song |

## Piano roll

The piano roll shows one channel as bars on a keyboard: easier if you think in
melodies rather than rows. Pick the channel at the top; the other channels show faintly
behind it. The **?** button at the end of its toolbar shows these controls in short.

- **Draw:** drag on empty space to draw a note as long as you drag. **Drag a note** to
  move it, **drag its right end** to resize, **right-click** to erase.
- **Select several:** drag a box with the **Select** tool (or **Shift-drag** with
  Draw), or **Shift-click** notes. Selected notes move, resize and delete together.
- **Keys:** arrows move the selection (Shift+↑/↓ by an octave), Shift+←/→ resizes,
  Delete removes, **Ctrl+A** selects every note, **Ctrl+C / X / V** copy, cut and paste
  at the row you last clicked, **Ctrl+D** duplicates right after the selection.

### Staying in key

If you don't read music, let the piano roll keep you in tune. Pick a **Key** (or press
**Find key** to work it out from the notes you've written) and a scale: rows outside
the scale go darker and the key's home note is marked on every octave. Tick **Snap to
key** and new and moved notes land on notes of the key, and ↑/↓ step through the
scale. Major, minor, harmonic minor, dorian, mixolydian, both pentatonics and blues are
there; pentatonic scales are hard to sound wrong in.

### Drums in one click

Press **Arrange** next to the song order, pick a **Beat** (rock, driving, four on the floor, half-time,
chiptune, breakbeat, march, shuffle, sparse) and press **This part** or **Every part**.
It replaces that part's noise channel and adds the kick, snare and hi-hat instruments
if the song doesn't have them. Edit the drums afterwards like any other notes.

## Instruments

An instrument is four little graphs, played one step per tick (60 or so per second):

| Graph | What it changes |
|---|---|
| **Volume** | Loudness each tick (0–15). Set a **release** step and the note holds there until a release (`===`), then plays the rest, like letting go of a key. |
| **Tone** | Pulse width: 0 thin, 1 nasal, 2 hollow, 3 thin again. On noise, 1 makes it metallic. On the Game Boy's wave channel, it picks the waveform. |
| **Bend** | Pitch change per tick, in sixteenths of a semitone. It adds up, so a row of 4s slides up. |
| **Chord** | Semitones added per tick. `0 4 7` looping is a major chord on one channel. |

**Add…** offers ready-made instruments (Lead, Soft lead, Pluck, Echo arp, Vibrato lead,
Triangle bass, Kick, Snare, Hi-hat, Open hat). Press **Try** to hear one.

## Effects

An effect is a letter and a two-digit hex value in the last column. `x` and `y` are the
two digits.

| Effect | What it does |
|---|---|
| `0xy` | Arpeggio: cycles the note, +x and +y semitones (`037` is a minor chord) |
| `1xx` | Slide up, xx sixteenths of a semitone per tick |
| `2xx` | Slide down |
| `3xx` | Glide (portamento) to the next note at speed xx |
| `4xy` | Vibrato: speed x, depth y |
| `Axy` | Volume slide: up by x, down by y |
| `Bxx` | Jump to part xx of the song order |
| `Dxx` | End this pattern; continue at row xx of the next part |
| `Fxx` | Speed (01–1F ticks per row) or tempo (20–FF BPM) |
| `Sxx` | Cut the note after xx ticks |
| `Vxx` | Override tone (pulse width or noise mode) |

## Other handy things

- **Space** plays or stops anywhere in Compose; **Loop pattern** repeats just the part
  you're editing; **Follow playback** scrolls along.
- **Mute / Solo** on the channel strips at the bottom.
- **Connect MIDI keyboard** plays and records from a USB keyboard, in browsers with Web
  MIDI (Chrome, Edge, Firefox; not Safari).
- **Songs → Open a song file…** opens music written down elsewhere, as a new song you
  can play and edit. See [Opening songs from other apps](#opening-songs-from-other-apps).
- Undo and redo: **Ctrl+Z** and **Ctrl+Shift+Z**. Songs save automatically.
- **`** (backquote) switches between tracker and piano roll.

## Opening songs from other apps

**Songs → Open a song file…** reads these, telling them apart by their contents:

| Format | From | What comes over |
|---|---|---|
| **FamiTracker text** (`.txt`) | FamiTracker, Dn-FamiTracker, 0CC (File → Export Text) | Everything for the four 2A03 channels: notes, instruments with their macros, volumes, effects, tempo. The DPCM channel and expansion chips are left out. |
| **MIDI** (`.mid`) | DAWs, notation apps, the web | Notes and tempo |
| **MusicXML** (`.musicxml`, `.mxl`) | MuseScore, Sibelius, Finale, Dorico, sheet-music sites | Notes, chords, ties, every part and voice, drums, transposing instruments, repeats with 1st and 2nd endings, tempo |
| **ABC** (`.abc`) | thesession.org, abcnotation.com, folk and game tune collections | Notes, keys and modes, accidentals, chords, ties, triplets, repeats, voices, tempo |
| **MOD** (`.mod`) | ProTracker and Amiga trackers, modarchive.org | Notes and tempo of every channel; samples with drum names (BD, snare, hat…) become drums |
| **ChipForge song** (`.chipsong.json`) | ChipForge's own Export | The whole song |

Except for FamiTracker and ChipForge files, a song with more parts than the chip has
channels is arranged the way MIDI files are: the three busiest parts become melody,
harmony and bass (highest to lowest), drums go to Noise, and chords become one note per
channel. A report says what went where. A single melody line (a folk tune) stays the
melody, with the other channels left free for you.

A song you open is still its writer's: see
[Can I convert any song and use it?](faq.md#can-i-convert-any-song-and-use-it)

When it sounds right, [export it](export.md).
