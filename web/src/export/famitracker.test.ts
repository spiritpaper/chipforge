import { describe, expect, it } from 'vitest'
import { songToFamiTracker } from './famitracker'
import { buildPattern, parseTrack } from '../song/build'
import { emptySong, macro, type Song } from '../song/model'
import { firstLight } from '../song/templates'

function small(): Song {
  const song = emptySong('Test "song"')
  song.patternLength = 4
  song.instruments = [{ name: 'Lead', volume: macro([15, 10, 5], 1, null), duty: macro([1]), pitch: macro([]), arpeggio: macro([0, 4, 7], 0) }]
  song.patterns = [
    buildPattern(4, [parseTrack('A4:8:047 . - =', 0), parseTrack('.', 0), parseTrack('A2', 0), parseTrack('C0', 0)]),
  ]
  return song
}

describe('FamiTracker text export', () => {
  it('writes macros and instruments with FamiTracker numbering', () => {
    const text = songToFamiTracker(small())
    expect(text).toContain('MACRO     0   0   1  -1   0 : 15 10 5')
    expect(text).toContain('MACRO     1   0   0  -1   0 : 0 4 7')
    expect(text).toContain('MACRO     4   0  -1  -1   0 : 1')
    expect(text).toContain(`INST2A03   0     0     0    -1    -1     0 "Lead"`)
    expect(text).toContain(`TITLE           "Test 'song'"`)
  })

  it('writes rows with notes, offs, releases and effects', () => {
    const text = songToFamiTracker(small())
    // C0 is MIDI 12; on the noise channel that's sound 12, written C-#.
    expect(text).toContain('ROW 00 : A-4 00 8 047 : ... .. . ... : A-3 00 . ... : C-# 00 . ... : ... .. . ...')
    expect(text).toContain('ROW 02 : --- .. . ...')
    expect(text).toContain('ROW 03 : === .. . ...')
  })

  it('writes the triangle an octave up, as FamiTracker plays it an octave down', () => {
    // A2 (110 Hz) in ChipForge is A-3 on FamiTracker's triangle.
    expect(songToFamiTracker(small())).toMatch(/ROW 00 : [^:]+: [^:]+: A-3/)
  })

  it('writes the track, order and every pattern row', () => {
    const song = { ...firstLight(), patterns: [firstLight().patterns[0], firstLight().patterns[0]], order: [0, 1, 0] }
    const text = songToFamiTracker(song)
    expect(text).toContain('TRACK  64   6 140 "First Light"')
    expect(text).toContain('COLUMNS : 1 1 1 1 1')
    expect(text).toContain('ORDER 02 : 00 00 00 00 00')
    expect(text.match(/^ROW /gm)).toHaveLength(128)
    expect(text.match(/^PATTERN /gm)).toHaveLength(2)
  })
})
