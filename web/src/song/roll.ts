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
