import { describe, expect, it } from 'vitest'
import { addNote, moveNote, removeNote, resizeNote } from './roll'
import { parseTrack } from './build'
import { segments } from '../lib/grid'

const track = (s: string) => parseTrack(s, 0)
const notes = (cells: ReturnType<typeof track>) => cells.map((c) => (c.note === null ? '.' : c.note === -1 ? '-' : String(c.note))).join(' ')
const lengths = (cells: ReturnType<typeof track>) => segments(cells).map((s) => [s.start, s.length, s.note])

describe('piano roll edits', () => {
  it('adds a note with an off where it ends', () => {
    expect(notes(addNote(track('. . . . . .'), 1, 2, 60, 0))).toBe('. 60 . - . .')
  })

  it('does not add an off when another note starts there', () => {
    expect(notes(addNote(track('. . . E4 . .'), 1, 2, 60, 0))).toBe('. 60 . 64 . .')
  })

  it('replaces notes it covers and shortens one it lands in', () => {
    const cells = addNote(track('C4 . . . D4 . E4 .'), 2, 4, 67, 0)
    expect(lengths(cells)).toEqual([[0, 2, 60], [2, 4, 67], [6, 2, 64]])
  })

  it('removes a note without stretching the one before it', () => {
    const cells = removeNote(track('C4 . D4 . - . . .'), 2)
    expect(lengths(cells)).toEqual([[0, 2, 60]])
    expect(notes(cells)).toBe('60 . - . . . . .')
  })

  it('removes a lone note and its trailing off', () => {
    expect(notes(removeNote(track('. C4 . - . .'), 1))).toBe('. . . . . .')
  })

  it('resizes and moves notes, keeping their volume', () => {
    const base = parseTrack('C4:8 . - . . . . .', 3)
    const longer = resizeNote(base, 0, 5)
    expect(lengths(longer)).toEqual([[0, 5, 60]])
    expect(longer[0].volume).toBe(8)
    const moved = moveNote(base, 0, 4, 62)
    expect(lengths(moved)).toEqual([[4, 2, 62]])
    expect(moved[4]).toMatchObject({ volume: 8, instrument: 3 })
    expect(moved[0].volume).toBeNull()
  })

  it('keeps effects where they are when notes move', () => {
    const moved = moveNote(parseTrack('C4:A04 . - . .', 0), 0, 2, 60)
    expect(moved[0]).toMatchObject({ note: null, effect: 'A', param: 4 })
  })
})
