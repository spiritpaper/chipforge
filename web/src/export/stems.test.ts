import { describe, expect, it } from 'vitest'
import { soloChannel, stemSongs } from './stems'
import { firstLight } from '../song/templates'
import { emptySong } from '../song/model'

describe('stems', () => {
  it('makes one song per channel with notes, the others silent', () => {
    const song = firstLight()
    const stems = stemSongs(song)
    expect(stems.map((s) => s.name)).toEqual(['pulse-1', 'pulse-2', 'triangle', 'noise'])
    const bass = stems[2].song.patterns[0].channels
    expect(bass[2]).toEqual(song.patterns[0].channels[2])
    expect(bass[0].every((c) => c.note === null)).toBe(true)
  })

  it('keeps jumps, breaks and tempo changes in silent channels, so stems stay in time', () => {
    const song = emptySong()
    song.patterns[0].channels[1][3] = { note: 60, instrument: 0, volume: null, effect: 'F', param: 0x90 }
    song.patterns[0].channels[1][5] = { note: null, instrument: null, volume: 4, effect: 'A', param: 0x0f }
    const solo = soloChannel(song, 0).patterns[0].channels[1]
    expect(solo[3]).toEqual({ note: null, instrument: null, volume: null, effect: 'F', param: 0x90 })
    expect(solo[5].effect).toBeNull()
  })

  it('names Game Boy channels after its chip', () => {
    const song = { ...firstLight(), chip: 'gb' as const }
    expect(stemSongs(song).map((s) => s.name)[2]).toBe('wave')
  })
})
