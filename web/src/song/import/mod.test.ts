import { describe, expect, it } from 'vitest'
import { drumForSample, modToMidi, periodToNote } from './mod'

/** A 4-channel M.K. module. `cells` sets [pattern, row, channel, sample, period, effect, param]. */
function mod(orders: number[], cells: number[][], samples: { name: string; words: number; loop?: boolean }[]) {
  const patterns = Math.max(...orders) + 1
  const bytes = new Uint8Array(1084 + patterns * 1024)
  const text = (at: number, s: string) => [...s].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)))
  text(0, 'Test Module')
  samples.forEach((s, i) => {
    const o = 20 + i * 30
    text(o, s.name)
    bytes[o + 22] = s.words >> 8
    bytes[o + 23] = s.words & 0xff
    bytes[o + 25] = 64
    if (s.loop) bytes[o + 29] = 8 // loop length in words
  })
  bytes[950] = orders.length
  orders.forEach((p, i) => (bytes[952 + i] = p))
  text(1080, 'M.K.')
  for (const [p, row, ch, sample, period, effect = 0, param = 0] of cells) {
    const o = 1084 + p * 1024 + (row * 4 + ch) * 4
    bytes[o] = (sample & 0xf0) | (period >> 8)
    bytes[o + 1] = period & 0xff
    bytes[o + 2] = ((sample & 0x0f) << 4) | effect
    bytes[o + 3] = param
  }
  return bytes
}

describe('MOD import', () => {
  it('converts Amiga periods and guesses drums from sample names', () => {
    expect([periodToNote(428), periodToNote(214), periodToNote(856), periodToNote(381)]).toEqual([60, 72, 48, 62])
    expect(drumForSample('BassDrum 1')).toBe(36)
    expect(drumForSample('snare.wav')).toBe(38)
    expect(drumForSample('closed hihat')).toBe(42)
    expect([drumForSample('BD1'), drumForSample('SD1'), drumForSample('SoftShake')]).toEqual([36, 38, 42])
    expect(drumForSample('SuperHyperBass')).toBeNull()
    expect(drumForSample('strings')).toBeNull()
  })

  it('reads notes, tempo, drums, note cuts and pattern breaks', () => {
    const bytes = mod(
      [0, 1],
      [
        [0, 0, 0, 1, 428, 0xf, 3], // speed 3: twice as fast as speed 6
        [0, 4, 0, 0, 381], // same sample, D
        [0, 6, 0, 0, 0, 0xc, 0], // volume 0 ends the note
        [0, 0, 1, 2, 428], // kick
        [0, 8, 2, 1, 0, 0xd, 0x02], // break to row 2 of the next pattern
        [1, 2, 0, 1, 214],
      ],
      [{ name: 'lead', words: 4000, loop: true }, { name: 'kick drum', words: 1000 }],
    )
    const { midi, title, notes } = modToMidi(bytes, 'file')
    expect(title).toBe('Test Module')
    // Tempo 125 at speed 3 → 250 BPM in rows of a 16th note.
    expect(Math.round(60_000_000 / midi.tempo)).toBe(250)
    const row = midi.division / 4
    const lead = midi.tracks.find((t) => t.name === 'MOD channel 1')!.notes
    expect(lead.map((n) => [n.tick / row, n.duration / row, n.note])).toEqual([
      [0, 4, 60],
      [4, 2, 62],
      // Rows 0-8 of pattern 0 (9 rows), then pattern 1 from row 2: its row 2 is row 9.
      // The lead's sample loops, so the note holds to the end of the song (62 rows).
      [9, 62, 72],
    ])
    const drums = midi.tracks.find((t) => t.name === 'Drums')!.notes
    expect(drums[0]).toMatchObject({ tick: 0, note: 36, channel: 9 })
    // An unlooped kick of 2000 bytes at period 428 plays at 8.3 kHz for 0.24 s: about
    // 4 rows of 0.06 s, not to the end of the song.
    expect(drums[0].duration / row).toBeCloseTo(4, 0)
    expect(notes.join(' ')).toMatch(/drum samples/)
  })

  it('stops where the song loops back', () => {
    const bytes = mod([0], [[0, 0, 0, 1, 428], [0, 3, 0, 0, 0, 0xb, 0]], [{ name: 'lead', words: 100, loop: true }])
    const { midi, notes } = modToMidi(bytes, 'x')
    expect(midi.tracks[0].notes).toHaveLength(1)
    expect(notes.join(' ')).toMatch(/loops/)
  })

  it('refuses files that are not modules', () => {
    expect(() => modToMidi(new Uint8Array(2000), 'x')).toThrow(/MOD/)
    expect(() => modToMidi(new Uint8Array(10), 'x')).toThrow(/short/)
  })
})
