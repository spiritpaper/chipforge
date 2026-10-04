// Starter songs. Each is original music written for ChipForge.

import { buildPattern, parseTrack, type Drums } from './build'
import { PRESET_INSTRUMENTS as I } from './instruments'
import { SONG_VERSION, emptySong, type Instrument, type Song } from './model'

/** Noise-channel drum hits: notes pick the noise pitch (higher note, higher hiss). */
const drumKit = (kick: number, snare: number, hat: number): Drums => ({
  k: { note: 1, instrument: kick },
  s: { note: 8, instrument: snare },
  h: { note: 14, instrument: hat },
})

interface Part {
  lead: string
  harmony: string
  bass: string
  drums: string
}

/** Builds a song from parts; instruments 0–2 are lead, harmony, bass; 3–5 the drum kit. */
function song(title: string, bpm: number, length: number, instruments: Instrument[], parts: Part[], order: number[], loopPoint = 0): Song {
  const kit = drumKit(3, 4, 5)
  return {
    version: SONG_VERSION,
    title,
    bpm,
    speed: 6,
    rowsPerBeat: 4,
    patternLength: length,
    instruments: structuredClone(instruments),
    patterns: parts.map((p) =>
      buildPattern(
        length,
        [parseTrack(p.lead, 0), parseTrack(p.harmony, 1), parseTrack(p.bass, 2), parseTrack(p.drums, 3, kit)],
        true,
      ),
    ),
    order,
    loopPoint,
  }
}

const KIT = [I.kick, I.snare, I.hat]

/** "First Light": a four-bar loop in A minor (Am – F – C – G). */
export function firstLight(): Song {
  const beat = 'k . h . s . h . k k h . s . h h'
  return song('First Light', 140, 64, [I.lead, I.echo, I.bass, ...KIT], [
    {
      lead: `A4 . C5 . E5 . A5 . G5 . E5 . C5 . D5 .
             F5 . . . E5 . C5 . A4 . . . C5 . . =
             E5 . G5 . C6 . . . B5 . G5 . E5 . G5 .
             D5 . . . B4 . D5 . G5 . . . = . . .`,
      harmony: `A3 C4 E4 C4 A3 C4 E4 C4 A3 C4 E4 C4 A3 C4 E4 C4
                F3 A3 C4 A3 F3 A3 C4 A3 F3 A3 C4 A3 F3 A3 C4 A3
                C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4
                G3 B3 D4 B3 G3 B3 D4 B3 G3 B3 D4 B3 G3 B3 D4 B3`,
      bass: `A2 . A3 . A2 . A3 . A2 . A3 . A2 . E3 .
             F2 . F3 . F2 . F3 . F2 . F3 . F2 . C3 .
             C3 . C4 . C3 . C4 . C3 . C4 . C3 . G3 .
             G2 . G3 . G2 . G3 . G2 . G3 . B2 . D3 .`,
      drums: `${beat} ${beat} ${beat} k . h . s . h . k . s s s s s s`,
    },
  ], [0])
}

/** "Overworld": a bright C-major walking theme (C – G – Am – F, then F – G – Em – Am/G). */
export function overworld(): Song {
  const beat = 'k . h . s . h . k . h k s . h .'
  return song('Overworld', 150, 64, [I.lead, I.pluck, I.bass, ...KIT], [
    {
      lead: `C5 . E5 . G5 . . . A5 . G5 . E5 . . .
             D5 . G5 . B5 . . . A5 . G5 . D5 . . .
             E5 . A5 . C6 . . . B5 . A5 . E5 . . .
             F5 . A5 . C6 . A5 . G5 . . . = . . .`,
      harmony: `C4 . G4 . E4 . G4 . C4 . G4 . E4 . G4 .
                B3 . G4 . D4 . G4 . B3 . G4 . D4 . G4 .
                C4 . A4 . E4 . A4 . C4 . A4 . E4 . A4 .
                C4 . A4 . F4 . A4 . C4 . A4 . F4 . A4 .`,
      bass: `C3 . . . G2 . . . C3 . . . G2 . C3 .
             G2 . . . D3 . . . G2 . . . D3 . G2 .
             A2 . . . E3 . . . A2 . . . E3 . A2 .
             F2 . . . C3 . . . F2 . . . C3 . G2 .`,
      drums: `${beat} ${beat} ${beat} k . h . s . h . k k s . s s s s`,
    },
    {
      lead: `A5 . G5 . F5 . . . C5 . F5 . A5 . . .
             B5 . A5 . G5 . . . D5 . G5 . B5 . . .
             G5 . E5 . B4 . . . E5 . G5 . B5 . . .
             C6 . . . B5 . . . A5 . . . G5 . = .`,
      harmony: `C4 . A4 . F4 . A4 . C4 . A4 . F4 . A4 .
                B3 . G4 . D4 . G4 . B3 . G4 . D4 . G4 .
                B3 . G4 . E4 . G4 . B3 . G4 . E4 . G4 .
                C4 . A4 . E4 . A4 . B3 . G4 . D4 . G4 .`,
      bass: `F2 . . . C3 . . . F2 . . . C3 . F2 .
             G2 . . . D3 . . . G2 . . . D3 . G2 .
             E2 . . . B2 . . . E2 . . . B2 . E2 .
             A2 . . . E3 . . . G2 . . . D3 . G2 .`,
      drums: `${beat} ${beat} ${beat} k . s . k . s . k s k s s s s s`,
    },
  ], [0, 1])
}

/** "Dungeon": slow and uneasy in D minor (Dm – B♭ – Gm – A). */
export function dungeon(): Song {
  const quiet = 'k . . . . . . . . . h . . . . .'
  return song('Dungeon', 96, 64, [I.vibratoLead, I.echo, I.bass, ...KIT], [
    {
      lead: `D5 . . . . . . . F5 . . . E5 . . .
             D5 . . . . . . . C5 . . . Bb4 . . .
             G4 . . . . . . . Bb4 . . . D5 . . .
             C#5 . . . . . . . . . . . = . . .`,
      harmony: `D4 F4 A4 F4 D4 F4 A4 F4 D4 F4 A4 F4 D4 F4 A4 F4
                Bb3 D4 F4 D4 Bb3 D4 F4 D4 Bb3 D4 F4 D4 Bb3 D4 F4 D4
                G3 Bb3 D4 Bb3 G3 Bb3 D4 Bb3 G3 Bb3 D4 Bb3 G3 Bb3 D4 Bb3
                A3 C#4 E4 C#4 A3 C#4 E4 C#4 A3 C#4 E4 C#4 A3 C#4 E4 C#4`,
      bass: `D2 . . . . . . . D2 . . . A2 . . .
             Bb1 . . . . . . . Bb1 . . . F2 . . .
             G1 . . . . . . . G1 . . . D2 . . .
             A1 . . . . . . . A1 . . . E2 . . .`,
      drums: `${quiet} ${quiet} ${quiet} k . . . . . . . k . h . s . . .`,
    },
  ], [0])
}

/** "Boss": fast and driving in E minor (Em – C – D – B), with arpeggiated chords. */
export function boss(): Song {
  const beat = 'k . h . s . h k k . h . s . h h'
  return song('Boss', 172, 64, [I.lead, I.softLead, I.bass, ...KIT], [
    {
      lead: `E5 . . E5 G5 . E5 . B5 . . . A5 . G5 .
             E5 . . E5 G5 . E5 . C6 . . . B5 . G5 .
             F#5 . . F#5 A5 . F#5 . D6 . . . C6 . A5 .
             B5 . . . A5 . G5 . F#5 . . . D#5 . . =`,
      harmony: `E4:037 . . . . . . . . . . . . . . =
                C4:047 . . . . . . . . . . . . . . =
                D4:047 . . . . . . . . . . . . . . =
                B3:047 . . . . . . . . . . . . . . =`,
      bass: `E2 . E3 . E2 . E3 . E2 . E3 . E2 . E3 .
             C2 . C3 . C2 . C3 . C2 . C3 . C2 . C3 .
             D2 . D3 . D2 . D3 . D2 . D3 . D2 . D3 .
             B1 . B2 . B1 . B2 . B1 . B2 . B1 . B2 .`,
      drums: `${beat} ${beat} ${beat} k . s . k . s . k s k s s s s s`,
    },
  ], [0])
}

/** "Victory": a short fanfare in C major. Export with "Loop for games" for a one-shot. */
export function victory(): Song {
  return song('Victory', 140, 32, [I.lead, I.softLead, I.bass, ...KIT], [
    {
      lead: 'G4 . C5 . E5 . G5 . . . E5 . G5 . . . C6 . . . . . . . . . . . = . . .',
      harmony: 'E4 . G4 . C5 . E5 . . . C5 . E5 . . . G5 . . . . . . . . . . . = . . .',
      bass: 'C3 . . . G2 . . . C3 . . . G2 . . . C3 . . . . . . . . . . . - . . .',
      drums: 'k . . . s . . . k . . . s . . . k . s s s s s . . . . . . . . .',
    },
  ], [0])
}

export interface Template {
  id: string
  title: string
  description: string
  create: () => Song
}

export const TEMPLATES: Template[] = [
  { id: 'empty', title: 'Empty song', description: 'A blank pattern and one lead instrument.', create: () => emptySong() },
  { id: 'overworld', title: 'Overworld', description: 'Bright and walking, C major, 150 BPM. Two patterns.', create: overworld },
  { id: 'dungeon', title: 'Dungeon', description: 'Slow and uneasy, D minor, 96 BPM, with a wavering lead.', create: dungeon },
  { id: 'boss', title: 'Boss', description: 'Fast and driving, E minor, 172 BPM, chords as arpeggios.', create: boss },
  { id: 'victory', title: 'Victory', description: 'A two-bar fanfare for winning a level.', create: victory },
  { id: 'first-light', title: 'First Light', description: 'A four-bar loop in A minor, 140 BPM.', create: firstLight },
]
