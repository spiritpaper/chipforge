// Starter songs. Each is original music written for ChipForge.

import { buildPattern, parseTrack, type Drums } from './build'
import { PRESET_INSTRUMENTS as I } from './instruments'
import { SONG_VERSION, type Song } from './model'

/** Noise-channel drum hits: notes pick the noise pitch (higher note, higher hiss). */
const drumKit = (kick: number, snare: number, hat: number): Drums => ({
  k: { note: 1, instrument: kick },
  s: { note: 8, instrument: snare },
  h: { note: 14, instrument: hat },
})

/** "First Light": a four-bar loop in A minor (Am – F – C – G). */
export function firstLight(): Song {
  const instruments = [I.lead, I.echo, I.bass, I.kick, I.snare, I.hat]
  const drums = drumKit(3, 4, 5)
  const lead = parseTrack(
    `A4 . C5 . E5 . A5 . G5 . E5 . C5 . D5 .
     F5 . . . E5 . C5 . A4 . . . C5 . . =
     E5 . G5 . C6 . . . B5 . G5 . E5 . G5 .
     D5 . . . B4 . D5 . G5 . . . = . . .`,
    0,
  )
  const harmony = parseTrack(
    `A3 C4 E4 C4 A3 C4 E4 C4 A3 C4 E4 C4 A3 C4 E4 C4
     F3 A3 C4 A3 F3 A3 C4 A3 F3 A3 C4 A3 F3 A3 C4 A3
     C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4
     G3 B3 D4 B3 G3 B3 D4 B3 G3 B3 D4 B3 G3 B3 D4 B3`,
    1,
  )
  const bass = parseTrack(
    `A2 . A3 . A2 . A3 . A2 . A3 . A2 . E3 .
     F2 . F3 . F2 . F3 . F2 . F3 . F2 . C3 .
     C3 . C4 . C3 . C4 . C3 . C4 . C3 . G3 .
     G2 . G3 . G2 . G3 . G2 . G3 . B2 . D3 .`,
    2,
  )
  const beat = 'k . h . s . h . k k h . s . h h'
  const drumsTrack = parseTrack(`${beat} ${beat} ${beat} k . h . s . h . k . s s s s s s`, 3, drums)
  return {
    version: SONG_VERSION,
    title: 'First Light',
    bpm: 140,
    speed: 6,
    rowsPerBeat: 4,
    patternLength: 64,
    instruments,
    patterns: [buildPattern(64, [lead, harmony, bass, drumsTrack])],
    order: [0],
    loopPoint: 0,
  }
}
