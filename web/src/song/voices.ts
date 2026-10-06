// Turning loose notes (from MIDI files or transcription) into chip channel cells.

import { EMPTY_CELL, NOTE_OFF, emptyPattern, type Cell, type Pattern } from './model'

/** A note already placed on the row grid; `end` is exclusive. */
export interface RowNote {
  start: number
  end: number
  pitch: number
  /** 0..1, if known; quieter notes get a volume. */
  level?: number
}

/**
 * One note at a time: of notes starting on the same row, keep the highest (melody)
 * or lowest (bass). Each note lasts until its end or the next note.
 */
export function monophonic(notes: RowNote[], rows: number, prefer: 'high' | 'low', instrument: number): Cell[] {
  const cells: Cell[] = Array(rows).fill(EMPTY_CELL)
  const starts = new Map<number, RowNote>()
  for (const n of notes) {
    if (n.start < 0 || n.start >= rows) continue
    const prev = starts.get(n.start)
    if (!prev || (prefer === 'high' ? n.pitch > prev.pitch : n.pitch < prev.pitch)) starts.set(n.start, n)
  }
  const ordered = [...starts.values()].sort((a, b) => a.start - b.start)
  ordered.forEach((n, k) => {
    const volume = n.level === undefined || n.level >= 0.88 ? null : Math.max(1, Math.round(n.level * 15))
    cells[n.start] = { ...EMPTY_CELL, note: Math.min(127, Math.max(0, n.pitch)), instrument, volume }
    const end = Math.max(n.start + 1, n.end)
    const next = ordered[k + 1]?.start ?? rows
    if (end < next && end < rows) cells[end] = { ...EMPTY_CELL, note: NOTE_OFF }
  })
  return cells
}

export type DrumKind = 'kick' | 'snare' | 'hat' | 'open'
const DRUM_PRIORITY: DrumKind[] = ['kick', 'snare', 'hat', 'open']
/** Noise "note" for each drum: higher notes are higher-pitched hiss. */
export const DRUM_NOTES: Record<DrumKind, number> = { kick: 1, snare: 8, hat: 14, open: 12 }

/** One drum per row on the noise channel; kick beats snare beats hats. */
export function drumRows(hits: { row: number; kind: DrumKind }[], rows: number, instruments: Record<DrumKind, number>): Cell[] {
  const best = new Map<number, DrumKind>()
  for (const h of hits) {
    if (h.row < 0 || h.row >= rows) continue
    const prev = best.get(h.row)
    if (!prev || DRUM_PRIORITY.indexOf(h.kind) < DRUM_PRIORITY.indexOf(prev)) best.set(h.row, h.kind)
  }
  const cells: Cell[] = Array(rows).fill(EMPTY_CELL)
  for (const [row, kind] of best) cells[row] = { ...EMPTY_CELL, note: DRUM_NOTES[kind], instrument: instruments[kind] }
  return cells
}

/** Cuts full-length channels into patterns; identical patterns are stored once. */
export function splitIntoPatterns(channels: Cell[][], length: number): { patterns: Pattern[]; order: number[] } {
  const rows = channels[0]?.length ?? 0
  const patterns: Pattern[] = []
  const order: number[] = []
  const seen = new Map<string, number>()
  for (let start = 0; start < rows; start += length) {
    const pattern = {
      channels: channels.map((cells) => {
        const part = cells.slice(start, start + length)
        return part.length < length ? [...part, ...Array<Cell>(length - part.length).fill(EMPTY_CELL)] : part
      }),
    }
    const key = JSON.stringify(pattern)
    let index = seen.get(key)
    if (index === undefined) {
      index = patterns.push(pattern) - 1
      seen.set(key, index)
    }
    order.push(index)
  }
  if (!patterns.length) {
    patterns.push(emptyPattern(length))
    order.push(0)
  }
  return { patterns, order }
}
