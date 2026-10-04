# ChipForge — Design System

## Point of view

ChipForge should feel like **sitting at the sound chip itself**. You see the four
voices and their real waveforms, never a generic DAW. The UI stays quiet, dark and
precise so the music and the moving waveforms are the brightest things on screen.

Spend boldness in **one place: the channel scopes**. They are drawn at the chip's own
low resolution, pixel-stepped, in each channel's color. Everything else is calm.

## Color

Channel colors are taken from the NES PPU palette. Color is *information*: a channel keeps
its color everywhere (scope, tracker column, piano-roll notes, mixer, export list).
Color is never the only cue, so every channel also shows its name.

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#14122A` | App background (the "CRT off" indigo) |
| `--panel` | `#1E1B3A` | Raised surfaces: rails, strips |
| `--line` | `#34305C` | Dividers, control outlines, grid |
| `--text` | `#E8E4FF` | Primary text |
| `--muted` | `#9A94C8` | Secondary text, inactive icons |
| `--pulse1` | `#F85898` | Pulse 1 (lead) |
| `--pulse2` | `#F8B800` | Pulse 2 (harmony) |
| `--tri` | `#3CBCFC` | Triangle (bass) |
| `--noise` | `#D8B8F8` | Noise (drums) |
| `--dpcm` | `#58D854` | DPCM samples (Phase 2+) |

The primary action color is `--text` on a filled `--line` shape. There is no extra
brand accent, so channel colors stay meaningful.

## Type

- **Chakra Petch** (500/600) is the UI face. Its squared, cut corners look like the
  silk-screened labels on hardware, and it stays readable at 13–15 px.
- **JetBrains Mono** is for note data only (tracker cells, BPM, note names, hex
  effects). Here monospace does a job: columns must align.
- **Silkscreen** is for the ChipForge wordmark only.

Scale (1.2 ratio, base 14 px): 12 · 14 · 17 · 20 · 24 · 29. Use sentence case
everywhere. Don't use all-caps labels.

## Layout: the app shell (all phases)

```
┌──────┬──────────────────────────────────────────────────────┐
│ logo │  transport: ▶ ■   BPM 140   chip: NES   ⟲ ⟳          │
├──────┼──────────────────────────────────────────────────────┤
│ SFX  │                                                      │
│ Comp │            workspace (mode-specific)                 │
│ Conv │                                                      │
│ Lib  │                                                      │
├──────┼──────────────────────────────────────────────────────┤
│      │ Pulse 1 ▁▇▁▇ │ Pulse 2 ▁▇▁▇ │ Triangle /\/\ │ Noise ░ │  ← always-visible scopes
└──────┴──────────────────────────────────────────────────────┘
```

- **Mode rail (left)**: SFX Lab, Compose, Convert, Library. Each has an icon and a
  text label.
- **Transport (top)**: the same play/stop/tempo for every mode.
- **Channel strip (bottom)**: visible in Compose,
  so you always see what the chip is doing. Mute and Solo buttons on each strip
  (`1–4`, `Shift+1–4`). SFX Lab hides it: one sound has one voice, shown large instead.
- On mobile, the rail becomes a bottom tab bar and the strips become a 2×2 grid.

Everything is left-aligned except the transport, which is grouped on the left. The
grid unit is 4 px.

## SFX Lab

```
┌──────────────────────────────────────────────┬────────────┐
│ Make a new sound: [Coin 1][Jump 2]…[Random R] │ History    │
│                                              │ All · Kept │
│ Coin 4                      (editable name)  │ ▮▮▮ Coin 4 ★│
│ [Mutate M][Keep S][Download WAV E][Link L]   │ ▮▮▮ Jump 1  │
│ ┌ Loudness ───────────────────────────────┐  │  …         │
│ ├ Pitch (spectrogram, log scale) ─────────┤  │            │
│ [Fine-tune F] → grouped sliders             │ [.zip]     │
└──────────────────────────────────────────────┴────────────┘
```

The current sound's wave type sets its color (pulse pink, triangle cyan, noise
lavender), and the same rule applies to history thumbnails.

## Compose

```
┌ Title · Songs · Export · Tracker|Piano roll · Undo Redo · Rows · Octave · Step ┐
│ Song order: [00 ▮▮▮][01 ▮▮ ×2][Loop▸02 ▮▮▮]  New · Duplicate · Repeat · ← → … │
├───────────────────────────────────────────────┬────────────────────────────────┤
│ 00  C-4 00 . ...  │ E-4 01 . 047 │ …           │ Instruments  [Add…]           │
│ 01  ... .. . ...  │ ... .. . ... │             │ 00 Lead  01 Echo arp …        │
│ (tracker, or piano roll for one channel)       │ Volume|Tone|Bend|Chord graph  │
├───────────────────────────────────────────────┴────────────────────────────────┤
│ channel strips with scopes                                                    │
└────────────────────────────────────────────────────────────────────────────────┘
```

- The tracker is the keyboard path (QWERTY piano, hex entry, selections); the piano
  roll is the mouse and touch path. Both edit the same cells, and both are
  accessible: the tracker announces the cursor cell, and roll notes are focusable.
- Channel colors carry over to tracker columns, roll notes, ghost notes and the song
  order previews. The noise channel writes its 16 sounds as `0-#` … `F-#`.
- Destructive actions confirm in place with the consequence ("64 notes use it").

## Interaction principles

1. **Sound first.** Every control previews instantly (under 50 ms). If you can change
   it, you can hear it.
2. **Keyboard first, mouse friendly.** Every action has a key, and the key is shown in
   its tooltip. `Space` plays and stops in every mode.
3. **Nothing is lost.** Undo works everywhere, and SFX history is kept automatically.
4. **No dead ends.** Generated sounds and converted songs open as editable projects.
5. **Presets before parameters.** Show the big obvious choices first and put the
   details behind "Fine-tune".
6. **Plain words.** Say "Wobble", not "Vibrato depth". Add the technical term in the
   tooltip for experts.

## Quality floor

- Visible focus rings (2 px `--text` outline, offset 2 px).
- `prefers-reduced-motion`: scopes refresh twice a second instead of every frame.
- Contrast: text ≥ 4.5:1 on `--ink`/`--panel` (`--muted` on `--panel` = 5.9:1).
- Hit targets ≥ 32 px desktop, ≥ 44 px touch.
