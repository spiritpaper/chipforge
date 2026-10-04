import { describe, expect, it } from 'vitest'
import {
  clearRegion,
  copyRegion,
  deleteRow,
  insertRow,
  pasteClip,
  resizePatterns,
  setCell,
  setNibble,
  transposeRegion,
  updateCell,
} from './edit'
import { EMPTY_CELL, NOTE_OFF, emptySong, type Song } from './model'
import { buildPattern, parseTrack } from './build'

function song(...tracks: string[]): Song {
  return { ...emptySong(), patternLength: 8, patterns: [buildPattern(8, tracks.map((t) => parseTrack(t, 0)))] }
}

const notes = (s: Song, ch: number) => s.patterns[0].channels[ch].map((c) => c.note)

describe('song edits', () => {
  it('never mutates the original and shares untouched channels', () => {
    const before = song('C4', 'D4')
    const after = setCell(before, 0, 0, 1, { ...EMPTY_CELL, note: 64 })
    expect(notes(before, 0)[1]).toBeNull()
    expect(notes(after, 0)[1]).toBe(64)
    expect(after.patterns[0].channels[1]).toBe(before.patterns[0].channels[1])
  })

  it('returns the same song when nothing changes', () => {
    const s = song('C4')
    expect(updateCell(s, 0, 0, 0, { note: 60 })).toBe(s)
    expect(clearRegion(song(), 0, { fromChannel: 0, toChannel: 3, fromRow: 0, toRow: 7 })).toEqual(song())
  })

  it('transposes notes but not offs', () => {
    const s = transposeRegion(song('C4 - E4'), 0, { fromChannel: 0, toChannel: 0, fromRow: 0, toRow: 7 }, 12)
    expect(notes(s, 0).slice(0, 3)).toEqual([72, NOTE_OFF, 76])
    expect(notes(transposeRegion(song('C9'), 0, { fromChannel: 0, toChannel: 0, fromRow: 0, toRow: 0 }, 24), 0)[0]).toBe(127)
  })

  it('copies and pastes rectangles, clipping at the edges', () => {
    const s = song('C4 D4 E4', 'F4 G4 A4')
    const clip = copyRegion(s, 0, { fromChannel: 1, toChannel: 0, fromRow: 2, toRow: 1 })
    expect(clip.map((c) => c.map((x) => x.note))).toEqual([[62, 64], [67, 69]])
    const pasted = pasteClip(s, 0, 3, 7, clip)
    expect(notes(pasted, 3)[7]).toBe(62)
    expect(pasted.patterns[0].channels[3]).toHaveLength(8)
  })

  it('inserts and deletes rows within one channel', () => {
    const s = song('C4 D4 E4', 'F4')
    expect(notes(insertRow(s, 0, 0, 1), 0).slice(0, 4)).toEqual([60, null, 62, 64])
    expect(notes(deleteRow(s, 0, 0, 0), 0).slice(0, 3)).toEqual([62, 64, null])
    expect(notes(insertRow(s, 0, 0, 1), 1)[0]).toBe(65)
  })

  it('resizes every pattern', () => {
    const s = resizePatterns(song('C4 . . . . . . E4'), 4)
    expect(s.patternLength).toBe(4)
    expect(notes(s, 0)).toEqual([60, null, null, null])
    expect(resizePatterns(s, 6).patterns[0].channels[2]).toHaveLength(6)
  })

  it('edits hex digits', () => {
    expect(setNibble(0x00, 0, 0xa)).toBe(0xa0)
    expect(setNibble(0xa0, 1, 0x7)).toBe(0xa7)
  })
})

import { validateSong } from './validate'
import { firstLight } from './templates'

describe('validateSong', () => {
  it('accepts real songs, including after a JSON round trip', () => {
    const s = firstLight()
    expect(validateSong(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })

  it('rejects broken songs', () => {
    const s = JSON.parse(JSON.stringify(firstLight()))
    expect(validateSong(null)).toBeNull()
    expect(validateSong({ ...s, version: 2 })).toBeNull()
    expect(validateSong({ ...s, bpm: 1000 })).toBeNull()
    expect(validateSong({ ...s, order: [5] })).toBeNull()
    expect(validateSong({ ...s, loopPoint: 3 })).toBeNull()
    const badCell = JSON.parse(JSON.stringify(s))
    badCell.patterns[0].channels[0][0] = { note: 999, instrument: null, volume: null, effect: null, param: 0 }
    expect(validateSong(badCell)).toBeNull()
    const shortChannel = JSON.parse(JSON.stringify(s))
    shortChannel.patterns[0].channels[1].pop()
    expect(validateSong(shortChannel)).toBeNull()
  })
})
