// Piano-roll edits on one channel's cells. A drawn note becomes a note cell plus,
// where needed, a note off where it ends; these functions keep that bookkeeping
// right so neighbouring notes keep their lengths.

import { segments, type Segment } from '../lib/grid'
import { EMPTY_CELL, NOTE_OFF, type Cell } from './model'

function put(cells: Cell[], row: number, patch: Partial<Cell>) {
  const next = { ...cells[row], ...patch }
  cells[row] = next.note === null && next.instrument === null && next.volume === null && next.effect === null ? EMPTY_CELL : next
}

export function segmentAt(cells: readonly Cell[], row: number): Segment | undefined {
  return segments(cells).find((s) => row >= s.start && row < s.start + s.length)
}

/** Adds a note over [start, start + length), replacing any notes it covers. */
export function addNote(cells: readonly Cell[], start: number, length: number, note: number, instrument: number | null): Cell[] {
  const out = cells.slice()
  const end = Math.min(out.length, start + Math.max(1, length))
  put(out, start, { note, instrument })
  for (let r = start + 1; r < end; r++) {
    if (out[r].note !== null) put(out, r, { note: null, instrument: null })
  }
  // Stop the note at its end unless something else starts there.
  if (end < out.length && out[end].note === null) put(out, end, { note: NOTE_OFF, instrument: null })
  return out
}

/** Removes the note starting at `start`, keeping the note before it the same length. */
export function removeNote(cells: readonly Cell[], start: number): Cell[] {
  const segs = segments(cells)
  const seg = segs.find((s) => s.start === start)
  if (!seg) return cells.slice()
  const out = cells.slice()
  const previousRunsInto = segs.some((s) => s.start + s.length === start)
  put(out, start, { note: previousRunsInto ? NOTE_OFF : null, instrument: null, volume: null })
  const end = seg.start + seg.length
  if (end < out.length && out[end].note === NOTE_OFF) put(out, end, { note: null })
  return out
}

/** Changes a note's length, keeping its pitch, instrument and volume. */
export function resizeNote(cells: readonly Cell[], start: number, length: number): Cell[] {
  const seg = segments(cells).find((s) => s.start === start)
  if (!seg) return cells.slice()
  const volume = cells[start].volume
  const out = addNote(removeNote(cells, start), start, length, seg.note, seg.instrument)
  put(out, start, { volume })
  return out
}

/** Moves a note in time and/or pitch, keeping its length, instrument and volume. */
export function moveNote(cells: readonly Cell[], start: number, newStart: number, newNote: number): Cell[] {
  const seg = segments(cells).find((s) => s.start === start)
  if (!seg) return cells.slice()
  const target = Math.min(cells.length - 1, Math.max(0, newStart))
  const volume = cells[start].volume
  const length = Math.min(seg.length, cells.length - target)
  const out = addNote(removeNote(cells, start), target, length, newNote, seg.instrument)
  put(out, target, { volume })
  return out
}

// ---- several notes at once (a selection) ----------------------------------

/** Copied notes, with starts relative to the earliest one. */
export interface NoteClip {
  notes: { offset: number; length: number; note: number; instrument: number | null; volume: number | null }[]
  /** Rows from the first note's start to the last note's end. */
  span: number
}

/** Removes every note starting at one of `starts`. */
export function removeNotes(cells: readonly Cell[], starts: Iterable<number>): Cell[] {
  let out = cells.slice()
  for (const start of starts) out = removeNote(out, start)
  return out
}

/**
 * Shifts the notes starting at `starts` by `rows` and `semitones` together, keeping
 * their lengths, instruments and volumes. Returns the cells and the notes' new starts.
 * The caller keeps the shift in range (see `clampShift`).
 */
export function moveNotes(
  cells: readonly Cell[],
  starts: Iterable<number>,
  rows: number,
  semitones: number,
): { cells: Cell[]; starts: number[] } {
  const wanted = new Set(starts)
  const moving = segments(cells).filter((s) => wanted.has(s.start))
  const volumes = moving.map((s) => cells[s.start].volume)
  const out = removeNotes(cells, wanted)
  const placed: number[] = []
  moving.forEach((seg, i) => {
    const start = seg.start + rows
    if (start < 0 || start >= out.length) return
    const next = addNote(out, start, Math.min(seg.length, out.length - start), seg.note + semitones, seg.instrument)
    put(next, start, { volume: volumes[i] })
    out.splice(0, out.length, ...next)
    placed.push(start)
  })
  return { cells: out, starts: placed }
}

/** Limits a group shift so every note stays inside the pattern and the pitch range. */
export function clampShift(
  cells: readonly Cell[],
  starts: Iterable<number>,
  rows: number,
  semitones: number,
  low: number,
  high: number,
): { rows: number; semitones: number } {
  const wanted = new Set(starts)
  const segs = segments(cells).filter((s) => wanted.has(s.start))
  if (!segs.length) return { rows: 0, semitones: 0 }
  const first = Math.min(...segs.map((s) => s.start))
  const last = Math.max(...segs.map((s) => s.start))
  const lowest = Math.min(...segs.map((s) => s.note))
  const highest = Math.max(...segs.map((s) => s.note))
  return {
    rows: Math.min(cells.length - 1 - last, Math.max(-first, rows)),
    semitones: Math.min(high - highest, Math.max(low - lowest, semitones)),
  }
}

/** Changes the length of several notes by `delta` rows (at least one row each). */
export function resizeNotes(cells: readonly Cell[], starts: Iterable<number>, delta: number): Cell[] {
  const wanted = new Set(starts)
  let out = cells.slice()
  for (const seg of segments(cells).filter((s) => wanted.has(s.start))) {
    out = resizeNote(out, seg.start, Math.max(1, seg.length + delta))
  }
  return out
}

export function copyNotes(cells: readonly Cell[], starts: Iterable<number>): NoteClip | null {
  const wanted = new Set(starts)
  const segs = segments(cells).filter((s) => wanted.has(s.start))
  if (!segs.length) return null
  const first = segs[0].start
  return {
    notes: segs.map((s) => ({
      offset: s.start - first,
      length: s.length,
      note: s.note,
      instrument: s.instrument,
      volume: cells[s.start].volume,
    })),
    span: Math.max(...segs.map((s) => s.start + s.length)) - first,
  }
}

/** Pastes a clip with its first note at `row`; returns the cells and the pasted starts. */
export function pasteNotes(cells: readonly Cell[], clip: NoteClip, row: number, top = 127): { cells: Cell[]; starts: number[] } {
  let out = cells.slice()
  const starts: number[] = []
  for (const n of clip.notes) {
    const start = row + n.offset
    if (start < 0 || start >= out.length) continue
    out = addNote(out, start, Math.min(n.length, out.length - start), Math.min(top, n.note), n.instrument)
    put(out, start, { volume: n.volume })
    starts.push(start)
  }
  return { cells: out, starts }
}
