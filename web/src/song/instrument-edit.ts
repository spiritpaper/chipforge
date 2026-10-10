// Instrument edits: pure, like song/edit.ts.

import { LIMITS, emptyMacro, type Cell, type ChipKind, type Instrument, type Macro, type Song } from './model'

export type MacroKind = 'volume' | 'duty' | 'pitch' | 'arpeggio'

/** Value range and meaning of each macro, shared by the editor and tests. */
export const MACRO_RANGE: Record<MacroKind, [number, number]> = {
  volume: [0, 15],
  duty: [0, 3],
  pitch: [-16, 16],
  arpeggio: [-12, 24],
}

/** The Game Boy's wave channel reads the Tone macro as one of eight waveforms. */
export const macroRange = (kind: MacroKind, chip: ChipKind = 'nes'): [number, number] =>
  kind === 'duty' && chip === 'gb' ? [0, 7] : MACRO_RANGE[kind]

export const MAX_MACRO_STEPS = 64

export function updateInstrument(song: Song, index: number, patch: Partial<Instrument>): Song {
  const instruments = song.instruments.slice()
  instruments[index] = { ...instruments[index], ...patch }
  return { ...song, instruments }
}

export function addInstrument(song: Song, instrument: Instrument): Song {
  if (song.instruments.length >= LIMITS.instruments) return song
  return { ...song, instruments: [...song.instruments, structuredClone(instrument)] }
}

/** Removes an instrument and renumbers every cell that points past it. */
export function deleteInstrument(song: Song, index: number): Song {
  if (song.instruments.length <= 1) return song
  const remap = (c: Cell): Cell => {
    if (c.instrument === null || c.instrument < index) return c
    return { ...c, instrument: c.instrument === index ? null : c.instrument - 1 }
  }
  return {
    ...song,
    instruments: song.instruments.filter((_, i) => i !== index),
    patterns: song.patterns.map((p) => ({
      channels: p.channels.map((cells) => (cells.some((c) => c.instrument !== null && c.instrument >= index) ? cells.map(remap) : cells)),
    })),
  }
}

/** How many cells use an instrument, so deleting one can warn first. */
export function instrumentUses(song: Song, index: number): number {
  let n = 0
  for (const p of song.patterns) for (const cells of p.channels) for (const c of cells) if (c.instrument === index) n++
  return n
}

export function setMacroValues(m: Macro, from: number, values: number[], kind: MacroKind, chip: ChipKind = 'nes'): Macro {
  const [lo, hi] = macroRange(kind, chip)
  const next = m.values.slice()
  values.forEach((v, i) => {
    if (from + i < next.length) next[from + i] = Math.min(hi, Math.max(lo, Math.round(v)))
  })
  return { ...m, values: next }
}

/** Grows (repeating the last value, or a sensible default) or shrinks a macro. */
export function resizeMacro(m: Macro, length: number, kind: MacroKind): Macro {
  const len = Math.min(MAX_MACRO_STEPS, Math.max(0, length))
  const fill = m.values.at(-1) ?? (kind === 'volume' ? 15 : kind === 'duty' ? 2 : 0)
  const values = m.values.length >= len ? m.values.slice(0, len) : [...m.values, ...Array<number>(len - m.values.length).fill(fill)]
  const keep = (p: number | null) => (p !== null && p < len ? p : null)
  return { values, loop: keep(m.loop), release: keep(m.release) }
}

/** Sets (or, if already there, clears) the loop or release point. */
export function toggleMarker(m: Macro, which: 'loop' | 'release', step: number): Macro {
  return { ...m, [which]: m[which] === step ? null : step }
}

export function blankInstrument(name = 'New instrument'): Instrument {
  return { name, volume: { values: [15], loop: null, release: null }, duty: { values: [2], loop: null, release: null }, pitch: emptyMacro(), arpeggio: emptyMacro() }
}
