// The song document. JSON-friendly and immutable: edits create new objects, which
// makes undo a list of earlier songs. See core/src/tracker.rs for playback semantics.

export const SONG_VERSION = 1
export const CHANNEL_COUNT = 4

/** Cell `note` values besides MIDI notes 0..127. */
export const NOTE_OFF = -1
export const NOTE_RELEASE = -2

export interface Cell {
  /** MIDI note, NOTE_OFF, NOTE_RELEASE, or null for nothing. */
  note: number | null
  instrument: number | null
  /** 0..15, or null to keep the channel's volume. */
  volume: number | null
  /** Effect letter: 0 1 2 3 4 A B D F S V. */
  effect: string | null
  param: number
}

export interface Macro {
  values: number[]
  loop: number | null
  release: number | null
}

export interface Instrument {
  name: string
  /** 0..15 per tick; empty = full volume. */
  volume: Macro
  /** 0..3 pulse duty (noise: 1 = metallic); empty = 50%. */
  duty: Macro
  /** Pitch change per tick in 1/16 semitones, accumulated. */
  pitch: Macro
  /** Semitone offset per tick. */
  arpeggio: Macro
}

export interface Pattern {
  /** channels[channel][row] */
  channels: Cell[][]
}

export interface Song {
  version: typeof SONG_VERSION
  title: string
  bpm: number
  /** Ticks per row. */
  speed: number
  rowsPerBeat: number
  patternLength: number
  instruments: Instrument[]
  patterns: Pattern[]
  /** Pattern indices in play order. */
  order: number[]
  /** Order index the song returns to after the last entry. */
  loopPoint: number
}

export const LIMITS = {
  bpm: [30, 300],
  speed: [1, 31],
  patternLength: [1, 256],
  instruments: 64,
  patterns: 256,
  order: 256,
  macroLength: 255,
} as const

export const EFFECTS = ['0', '1', '2', '3', '4', 'A', 'B', 'D', 'F', 'S', 'V'] as const

export const EMPTY_CELL: Cell = Object.freeze({ note: null, instrument: null, volume: null, effect: null, param: 0 })

export const isEmptyCell = (c: Cell) =>
  c.note === null && c.instrument === null && c.volume === null && c.effect === null

export const emptyMacro = (): Macro => ({ values: [], loop: null, release: null })

export const macro = (values: number[], loop: number | null = null, release: number | null = null): Macro => ({
  values,
  loop,
  release,
})

export function emptyPattern(length: number): Pattern {
  return { channels: Array.from({ length: CHANNEL_COUNT }, () => Array<Cell>(length).fill(EMPTY_CELL)) }
}

export function defaultInstrument(name = 'Instrument'): Instrument {
  return { name, volume: macro([15, 14, 12, 10, 9, 8]), duty: macro([2]), pitch: emptyMacro(), arpeggio: emptyMacro() }
}

export function emptySong(title = 'Untitled song'): Song {
  return {
    version: SONG_VERSION,
    title,
    bpm: 150,
    speed: 6,
    rowsPerBeat: 4,
    patternLength: 64,
    instruments: [defaultInstrument('Lead')],
    patterns: [emptyPattern(64)],
    order: [0],
    loopPoint: 0,
  }
}

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-']

/** Tracker spelling: "C-4", "F#3"; "---" off, "===" release, "..." empty. */
export function noteLabel(note: number | null): string {
  if (note === null) return '...'
  if (note === NOTE_OFF) return '---'
  if (note === NOTE_RELEASE) return '==='
  const octave = Math.floor(note / 12) - 1
  return `${NOTE_NAMES[note % 12]}${octave < 0 ? '-' : octave}`
}

/** Plain spelling for people: "C4", "F#3". */
export function noteName(note: number): string {
  return `${NOTE_NAMES[note % 12].replace('-', '')}${Math.floor(note / 12) - 1}`
}

/** Parse "C4", "F#3", "Bb2" into a MIDI note, or null. */
export function parseNote(token: string): number | null {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(token)
  if (!m) return null
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase() as 'C']
  const note = (Number(m[3]) + 1) * 12 + base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
  return note >= 0 && note <= 127 ? note : null
}

/** Ticks per second, as the engine computes it. */
export const tickRate = (song: Song) => (song.bpm * song.rowsPerBeat * song.speed) / 60

/** Seconds for one pass through the order list (ignores jump and speed effects). */
export const songSeconds = (song: Song) => (song.order.length * song.patternLength * song.speed) / tickRate(song)
