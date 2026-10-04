import { describe, expect, it } from 'vitest'
import { pitchPosition, segments } from './grid'
import { parseTrack } from '../song/build'

describe('segments', () => {
  it('extends notes through empty rows and ends them on off, release or a new note', () => {
    expect(segments(parseTrack('C4 . . D4 - . E4 . = F4', 2))).toEqual([
      { start: 0, length: 3, note: 60, instrument: 2, released: false },
      { start: 3, length: 1, note: 62, instrument: 2, released: false },
      { start: 6, length: 2, note: 64, instrument: 2, released: true },
      { start: 9, length: 1, note: 65, instrument: 2, released: false },
    ])
  })

  it('ignores rows with only volume or effect changes', () => {
    expect(segments(parseTrack('C4 .:8 .:A04 -', 0))).toEqual([
      { start: 0, length: 3, note: 60, instrument: 0, released: false },
    ])
  })
})

describe('pitchPosition', () => {
  it('places pitches within the range', () => {
    expect(pitchPosition(60, 60, 72)).toBe(0)
    expect(pitchPosition(72, 60, 72)).toBe(1)
    expect(pitchPosition(5, 5, 5)).toBe(0.5)
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
