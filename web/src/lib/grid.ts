import { CELL_HAT, CELL_HOLD, CELL_KICK, CELL_OFF, CELL_SNARE } from '../audio/protocol'

export interface Segment {
  start: number
  length: number
  /** MIDI note, or a CELL_KICK/SNARE/HAT drum code. */
  value: number
}

export const isDrum = (value: number) => value >= CELL_KICK && value <= CELL_HAT

/** Group a track's cells into sounding segments: a note lasts through holds. */
export function segments(cells: ArrayLike<number>): Segment[] {
  const out: Segment[] = []
  let current: Segment | null = null
  for (let step = 0; step < cells.length; step++) {
    const cell = cells[step]
    if (cell === CELL_HOLD) {
      if (current && !isDrum(current.value)) current.length++
      continue
    }
    current = null
    if (cell === CELL_OFF || cell < 0) continue
    current = { start: step, length: 1, value: cell }
    out.push(current)
  }
  return out
}

/** Vertical position 0 (bottom) .. 1 (top) for drawing a segment in its row. */
export function pitchPosition(value: number, lowest: number, highest: number): number {
  if (isDrum(value)) {
    return value === CELL_KICK ? 0 : value === CELL_SNARE ? 0.5 : 1
  }
  return highest === lowest ? 0.5 : (value - lowest) / (highest - lowest)
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function cellLabel(value: number): string {
  if (value === CELL_KICK) return 'Kick'
  if (value === CELL_SNARE) return 'Snare'
  if (value === CELL_HAT) return 'Hi-hat'
  return `${NAMES[value % 12]}${Math.floor(value / 12) - 1}`
}
