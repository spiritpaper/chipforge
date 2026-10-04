import { describe, expect, it } from 'vitest'
import { addPatternAfter, duplicatePatternAt, moveEntry, patternUses, removeEntry, repeatAt, setEntryPattern, setLoopPoint } from './arrange'
import { emptySong, type Song } from './model'

const song = (order: number[], loopPoint = 0): Song => {
  const base = emptySong()
  const patterns = Array.from({ length: Math.max(...order) + 1 }, () => base.patterns[0])
  return { ...base, patterns, order, loopPoint }
}

describe('arrangement', () => {
  it('adds and duplicates patterns after an entry', () => {
    const s = addPatternAfter(song([0, 1]), 0)
    expect(s.order).toEqual([0, 2, 1])
    expect(s.patterns).toHaveLength(3)
    const d = duplicatePatternAt(song([0, 1]), 1)
    expect(d.order).toEqual([0, 1, 2])
    expect(d.patterns[2]).not.toBe(d.patterns[1])
    expect(d.patterns[2]).toEqual(d.patterns[1])
  })

  it('repeats an entry without a new pattern', () => {
    const s = repeatAt(song([0, 1]), 0)
    expect(s.order).toEqual([0, 0, 1])
    expect(patternUses(s)).toEqual([2, 1])
  })

  it('keeps the loop point on its entry when inserting before it', () => {
    expect(repeatAt(song([0, 1, 2], 2), 0).loopPoint).toBe(3)
    expect(repeatAt(song([0, 1, 2], 1), 2).loopPoint).toBe(1)
  })

  it('removes entries but never the last one', () => {
    expect(removeEntry(song([0, 1, 2], 2), 0)).toMatchObject({ order: [1, 2], loopPoint: 1 })
    expect(removeEntry(song([0, 1], 1), 1)).toMatchObject({ order: [0], loopPoint: 0 })
    const one = song([0])
    expect(removeEntry(one, 0)).toBe(one)
  })

  it('moves entries and the loop point with them', () => {
    const s = moveEntry(song([0, 1, 2, 3], 1), 1, 3)
    expect(s.order).toEqual([0, 2, 3, 1])
    expect(s.loopPoint).toBe(3)
    expect(moveEntry(song([0, 1, 2], 0), 2, 0)).toMatchObject({ order: [2, 0, 1], loopPoint: 1 })
  })

  it('points an entry at another pattern, creating it if new', () => {
    const s = setEntryPattern(song([0]), 0, 3)
    expect(s.order).toEqual([3])
    expect(s.patterns).toHaveLength(4)
  })

  it('clamps the loop point', () => {
    expect(setLoopPoint(song([0, 1]), 9).loopPoint).toBe(1)
  })
})
