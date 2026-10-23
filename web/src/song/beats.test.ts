import { describe, expect, it } from 'vitest'
import { addBeat, BEATS } from './beats'
import { emptySong } from './model'
import { validateSong } from './validate'
import { segments } from '../lib/grid'

describe('beats', () => {
  it('writes a bar of drums into the noise channel and adds the kit once', () => {
    const song = addBeat(emptySong(), 'rock', [0])
    expect(song.instruments.map((i) => i.name)).toEqual(['Lead', 'Kick', 'Snare', 'Hi-hat', 'Open hat'])
    const noise = song.patterns[0].channels[3]
    expect(segments(noise).slice(0, 4).map((s) => [s.start, s.instrument])).toEqual([[0, 1], [2, 3], [4, 2], [6, 3]])
    expect(validateSong(JSON.parse(JSON.stringify(song)))).not.toBeNull()
    // Again, with another style: same instruments, new beat.
    const again = addBeat(song, 'sparse', [0])
    expect(again.instruments).toHaveLength(5)
    expect(segments(again.patterns[0].channels[3]).map((s) => s.start).slice(0, 2)).toEqual([0, 8])
  })

  it('only fills the patterns it is given, and leaves other channels alone', () => {
    const base = emptySong()
    base.patterns.push(structuredClone(base.patterns[0]))
    base.patterns[0].channels[0][0] = { note: 60, instrument: 0, volume: null, effect: null, param: 0 }
    const song = addBeat(base, 'chiptune', [1])
    expect(segments(song.patterns[0].channels[3])).toHaveLength(0)
    expect(segments(song.patterns[1].channels[3]).length).toBeGreaterThan(10)
    expect(song.patterns[0].channels[0][0].note).toBe(60)
  })

  it('stretches the bar to the song: 3 rows a beat makes 12-row bars', () => {
    const song = { ...emptySong(), rowsPerBeat: 3, patternLength: 24 }
    song.patterns = [{ channels: emptySong().patterns[0].channels.map((c) => c.slice(0, 24)) }]
    const starts = segments(addBeat(song, 'sparse', [0]).patterns[0].channels[3]).map((s) => s.start)
    expect(starts).toEqual([0, 6, 12, 18])
  })

  it('every style has 16 steps', () => {
    for (const b of Object.values(BEATS)) expect(b.bar).toHaveLength(16)
  })
})
