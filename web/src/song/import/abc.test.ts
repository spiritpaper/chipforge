import { describe, expect, it } from 'vitest'
import { abcToMidi, keySignature } from './abc'

const timeline = (abc: string, track = 0) => {
  const { midi } = abcToMidi(abc, 'x')
  const eighth = midi.division / 2
  const r = (v: number) => Math.round(v * 1000) / 1000
  return midi.tracks[track].notes.map((n) => [r(n.tick / eighth), r(n.duration / eighth), n.note])
}

describe('ABC import', () => {
  it('works out key signatures in every mode', () => {
    expect(keySignature('G')).toEqual({ F: 1 })
    expect(keySignature('Dm')).toEqual({ B: -1 })
    expect(keySignature('A mix')).toEqual({ F: 1, C: 1 })
    expect(keySignature('E dor')).toEqual({ F: 1, C: 1 })
    expect(keySignature('Bb')).toEqual({ B: -1, E: -1 })
    expect(keySignature('none')).toEqual({})
  })

  it('reads the header and a simple tune', () => {
    const abc = 'X:1\nT:Little Tune\nM:4/4\nL:1/8\nQ:1/4=100\nK:G\nGABc d2 B2|'
    const { title, midi } = abcToMidi(abc, 'file')
    expect(title).toBe('Little Tune')
    expect(Math.round(60_000_000 / midi.tempo)).toBe(100)
    // In G, F is sharp; c is C5.
    expect(timeline(abc)).toEqual([[0, 1, 67], [1, 1, 69], [2, 1, 71], [3, 1, 72], [4, 2, 74], [6, 2, 71]])
  })

  it('handles octaves, accidentals through the bar, rests and chords', () => {
    expect(timeline('K:C\nL:1/8\nC, c c\' ^F F =F z [CEG]2|F')).toEqual([
      [0, 1, 48], [1, 1, 72], [2, 1, 84], [3, 1, 66], [4, 1, 66], [5, 1, 65],
      [7, 2, 60], [7, 2, 64], [7, 2, 67],
      // A new bar forgets the accidental.
      [9, 1, 65],
    ])
  })

  it('handles broken rhythm, triplets and ties across the bar', () => {
    expect(timeline('K:C\nL:1/8\nA>B (3cde c2-|c2')).toEqual([
      [0, 1.5, 69], [1.5, 0.5, 71],
      [2, 0.667, 72], [2.667, 0.667, 74], [3.333, 0.667, 76],
      [4, 4, 72],
    ])
  })

  it('plays repeats and endings', () => {
    const notes = timeline('K:C\nL:1/4\n|:C D|1 E F:|2 G A|]').map((n) => n[2])
    expect(notes).toEqual([60, 62, 64, 65, 60, 62, 67, 69])
  })

  it('reads several voices as several parts', () => {
    const abc = 'X:1\nK:C\nL:1/4\nV:1 name="Lead"\nc d|\nV:2 name="Bass"\nC, D,|'
    const { midi } = abcToMidi(abc, 'x')
    expect(midi.tracks.map((t) => t.name)).toEqual(['Lead', 'Bass'])
    expect(timeline(abc, 1).map((n) => n[2])).toEqual([48, 50])
  })

  it('reads only the first of several tunes, and refuses non-ABC', () => {
    const { notes } = abcToMidi('X:1\nK:C\nC|\n\nX:2\nK:C\nD|', 'x')
    expect(notes[0]).toMatch(/2 tunes/)
    expect(timeline('X:1\nK:C\nC|\n\nX:2\nK:C\nD|').map((n) => n[2])).toEqual([60])
    expect(() => abcToMidi('just text', 'x')).toThrow(/ABC/)
  })
})
