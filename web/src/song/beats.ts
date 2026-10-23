// Drum beats for the noise channel, for people who'd rather not program drums: pick a
// style and it fills a part (or every part) with it, one bar of 16 steps repeated.

import { PRESET_INSTRUMENTS as I } from './instruments'
import { LIMITS, type Instrument, type Song } from './model'
import { drumRows, type DrumKind } from './voices'

/** k kick, s snare, h hi-hat, o open hat, . nothing; one bar of 16th notes. */
export const BEATS = {
  rock: { label: 'Rock', bar: 'k.h.s.h.k.h.s.h.' },
  driving: { label: 'Driving', bar: 'k.hhs.hhk.hhs.hh' },
  fourOnTheFloor: { label: 'Four on the floor', bar: 'k.o.k.o.k.o.k.o.' },
  halfTime: { label: 'Half-time', bar: 'k.h.h.h.s.h.h.h.' },
  chiptune: { label: 'Chiptune', bar: 'khhhshhhkkhhshhh' },
  breakbeat: { label: 'Breakbeat', bar: 'k.h.s.hkh.k.s.h.' },
  march: { label: 'March', bar: 'k.s.s.s.k.s.ssk.' },
  shuffle: { label: 'Shuffle', bar: 'k..hs..hk..hs.h.' },
  sparse: { label: 'Sparse', bar: 'k.......s.......' },
} as const

export type BeatName = keyof typeof BEATS

const KINDS: Record<string, DrumKind> = { k: 'kick', s: 'snare', h: 'hat', o: 'open' }
const KIT: Record<DrumKind, Instrument> = { kick: I.kick, snare: I.snare, hat: I.hat, open: I.openHat }

/**
 * Writes `beat` into the noise channel of the patterns `patternIndexes` play, adding
 * the drum instruments the song doesn't have yet (found by name). A bar is
 * rowsPerBeat × 4 rows; the 16 steps are spread over it.
 */
export function addBeat(song: Song, beat: BeatName, patternIndexes: number[]): Song {
  const instruments = song.instruments.slice()
  const index: Record<DrumKind, number> = { kick: -1, snare: -1, hat: -1, open: -1 }
  for (const kind of Object.keys(KIT) as DrumKind[]) {
    const found = instruments.findIndex((i) => i.name === KIT[kind].name)
    if (found >= 0) index[kind] = found
    else if (instruments.length < LIMITS.instruments) {
      index[kind] = instruments.push(structuredClone(KIT[kind])) - 1
    } else index[kind] = 0
  }
  const bar = BEATS[beat].bar
  const rowsPerBar = song.rowsPerBeat * 4
  const hits: { row: number; kind: DrumKind }[] = []
  for (let row = 0; row < song.patternLength; row++) {
    const step = ((row % rowsPerBar) * 16) / rowsPerBar
    if (!Number.isInteger(step)) continue
    const kind = KINDS[bar[step]]
    if (kind) hits.push({ row, kind })
  }
  const drums = drumRows(hits, song.patternLength, index)
  const targets = new Set(patternIndexes)
  return {
    ...song,
    instruments,
    patterns: song.patterns.map((p, i) => (targets.has(i) ? { channels: p.channels.map((cells, ch) => (ch === 3 ? drums.slice() : cells)) } : p)),
  }
}
