import { describe, expect, it } from 'vitest'
import { MidiError, parseMidi, writeMidi, type MidiFile } from './smf'
import { midiToSong, songToMidi } from './convert'
import { firstLight } from '../song/templates'
import { segments } from '../lib/grid'
import { validateSong } from '../song/validate'

const file = (notes: [number, number, number, number][], channel = 0): MidiFile => ({
  division: 96,
  tempo: 500_000,
  tracks: [{ name: 'Test', notes: notes.map(([tick, duration, note, velocity]) => ({ tick, duration, note, velocity, channel })) }],
})

describe('standard MIDI files', () => {
  it('round-trips notes, names and tempo', () => {
    const f = file([[0, 96, 60, 100], [96, 48, 64, 80], [96, 48, 67, 80]])
    const back = parseMidi(writeMidi(f))
    expect(back.division).toBe(96)
    expect(back.tempo).toBe(500_000)
    expect(back.tracks[0].name).toBe('Test')
    expect(back.tracks[0].notes.map((n) => [n.tick, n.duration, n.note, n.velocity])).toEqual([[0, 96, 60, 100], [96, 48, 67, 80], [96, 48, 64, 80]])
  })

  it('reads running status and note-on with velocity 0 as note-off', () => {
    // MThd, then one track: 90 3C 64, (running) 3C 00 after 96 ticks, end.
    const bytes = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96,
      0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 11,
      0x00, 0x90, 0x3c, 0x64, 0x60, 0x3c, 0x00, 0x00, 0xff, 0x2f, 0x00,
    ])
    const midi = parseMidi(bytes)
    expect(midi.tracks[0].notes).toEqual([{ tick: 0, duration: 96, note: 60, velocity: 100, channel: 0 }])
  })

  it('refuses files it cannot read', () => {
    expect(() => parseMidi(new TextEncoder().encode('RIFF....'))).toThrow(MidiError)
    expect(() => parseMidi(new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 2, 0, 1, 0, 96]))).toThrow(/format/)
  })
})

describe('songs and MIDI', () => {
  it('exports every channel, with noise as General MIDI drums', () => {
    const midi = songToMidi(firstLight())
    expect(midi.tempo).toBe(Math.round(60_000_000 / 140))
    expect(midi.tracks.map((t) => t.name)).toEqual(['Pulse 1', 'Pulse 2', 'Triangle', 'Noise'])
    expect(midi.tracks[1].notes).toHaveLength(64)
    expect(new Set(midi.tracks[3].notes.map((n) => n.note))).toEqual(new Set([36, 38, 42]))
    expect(midi.tracks[3].notes.every((n) => n.channel === 9)).toBe(true)
  })

  it('imports a song that sounds like the one exported', () => {
    const original = firstLight()
    const midi = parseMidi(writeMidi(songToMidi(original)))
    const { song, report } = midiToSong(midi, 'Round trip')
    expect(validateSong(JSON.parse(JSON.stringify(song)))).not.toBeNull()
    expect(song.bpm).toBe(140)
    // Lead line survives exactly: same notes at the same rows and lengths.
    const lead = (s: typeof song) => segments(s.patterns[s.order[0]].channels[0]).map((x) => [x.start, x.note])
    expect(lead(song)).toEqual(lead(original))
    const bass = (s: typeof song) => segments(s.patterns[s.order[0]].channels[2]).map((x) => x.note)
    expect(bass(song)).toEqual(bass(original))
    expect(report.lines.some((l) => l.includes('Drums'))).toBe(true)
  })

  it('reduces chords to the top note and splits one-part files into melody and bass', () => {
    const { song } = midiToSong(file([[0, 96, 48, 100], [0, 96, 64, 100], [0, 96, 67, 100]]), 'Chord')
    expect(song.patterns[0].channels[0][0].note).toBe(67)
    expect(song.patterns[0].channels[2][0].note).toBe(48)
  })

  it('mentions reduced chords only when there were some', () => {
    const reduced = (m: MidiFile) => midiToSong(m, 'x').report.lines.some((l) => l.startsWith('Chords were reduced'))
    expect(reduced(file([[0, 96, 48, 100], [0, 96, 64, 100], [0, 96, 67, 100]]))).toBe(true)
    expect(reduced(file([[0, 96, 60, 100], [96, 96, 62, 100], [192, 96, 64, 100]]))).toBe(false)
  })

  it('stores repeated sections once', () => {
    // The same note at the top of eight 64-row stretches (16 beats each).
    const notes: [number, number, number, number][] = []
    for (let part = 0; part < 8; part++) notes.push([part * 96 * 16, 96, 60, 100])
    const { song } = midiToSong(file(notes), 'Repeats')
    expect(song.order).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(song.patterns.length).toBe(1)
  })
})
