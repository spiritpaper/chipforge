import { describe, expect, it } from 'vitest'
import { cellLabel, pitchPosition, segments } from './grid'
import { CELL_HOLD as H, CELL_KICK, CELL_OFF as O, CELL_SNARE } from '../audio/protocol'

describe('segments', () => {
  it('extends notes through holds and ends them on off or a new note', () => {
    expect(segments([60, H, H, 62, O, H, 64, H])).toEqual([
      { start: 0, length: 3, value: 60 },
      { start: 3, length: 1, value: 62 },
      { start: 6, length: 2, value: 64 },
    ])
  })

  it('keeps drums one step long', () => {
    expect(segments([CELL_KICK, H, CELL_SNARE])).toEqual([
      { start: 0, length: 1, value: CELL_KICK },
      { start: 2, length: 1, value: CELL_SNARE },
    ])
  })
})

describe('labels and positions', () => {
  it('names notes and drums', () => {
    expect(cellLabel(69)).toBe('A4')
    expect(cellLabel(61)).toBe('C#4')
    expect(cellLabel(CELL_KICK)).toBe('Kick')
  })

  it('places pitches within the track range', () => {
    expect(pitchPosition(60, 60, 72)).toBe(0)
    expect(pitchPosition(72, 60, 72)).toBe(1)
    expect(pitchPosition(CELL_KICK, 0, 0)).toBe(0)
  })
})

import { parseHash } from './hash'

describe('parseHash', () => {
  it('defaults to the SFX Lab and reads share codes', () => {
    expect(parseHash('')).toEqual({ mode: 'sfx', share: null })
    expect(parseHash('#/demo')).toEqual({ mode: 'demo', share: null })
    expect(parseHash('#/sfx?s=AbC_-1')).toEqual({ mode: 'sfx', share: 'AbC_-1' })
  })
})
