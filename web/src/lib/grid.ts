import { NOTE_OFF, NOTE_RELEASE, type Cell } from '../song/model'

/** A sounding note in one channel, as drawn on a piano roll. */
export interface Segment {
  start: number
  length: number
  note: number
  instrument: number | null
  /** True if the note ends with a release (its instrument fades) rather than a cut. */
  released: boolean
}

/**
 * Group a channel's cells into notes: a note lasts until the next note, a note off
 * or a release, or the end of the pattern.
 */
export function segments(cells: readonly Cell[]): Segment[] {
  const out: Segment[] = []
  let current: Segment | null = null
  cells.forEach((cell, row) => {
    if (cell.note === null) {
      if (current) current.length++
      return
    }
    if (current && cell.note === NOTE_RELEASE) current.released = true
    current = null
    if (cell.note === NOTE_OFF || cell.note === NOTE_RELEASE) return
    current = { start: row, length: 1, note: cell.note, instrument: cell.instrument, released: false }
    out.push(current)
  })
  return out
}

/** Vertical position 0 (bottom) .. 1 (top) of a note within a range. */
export function pitchPosition(note: number, lowest: number, highest: number): number {
  return highest === lowest ? 0.5 : (note - lowest) / (highest - lowest)
}
