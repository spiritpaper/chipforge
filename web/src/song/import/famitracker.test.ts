import { describe, expect, it } from 'vitest'
import { chipBpm, famiTempo, famiTrackerToSong } from './famitracker'
import { songToFamiTracker } from '../../export/famitracker'
import { TEMPLATES } from '../templates'
import { validateSong } from '../validate'

/** What each part of the song plays, independent of how patterns are numbered. */
const played = (song: ReturnType<typeof famiTrackerToSong>['song']) => song.order.map((p) => song.patterns[p].channels)

describe('FamiTracker text import', () => {
  for (const t of TEMPLATES) {
    it(`gets "${t.title}" back from its own export`, () => {
      const original = t.create()
      const { song, report } = famiTrackerToSong(songToFamiTracker(original), 'x')
      expect(validateSong(JSON.parse(JSON.stringify(song)))).not.toBeNull()
      expect(played(song)).toEqual(played(original))
      expect(song.instruments).toEqual(original.instruments.map((i) => ({ ...i, name: i.name.slice(0, 31) })))
      expect([song.bpm, song.speed, song.patternLength]).toEqual([original.bpm, original.speed, original.patternLength])
      expect(report.lines[0]).toMatch(/^Opened/)
    })
  }

  it('converts tempo both ways at any speed', () => {
    expect(famiTempo(150, 6)).toBe(150)
    expect(famiTempo(120, 3)).toBe(60)
    expect(chipBpm(60, 3)).toBe(120)
  })

  const file = (rows: string[], order = 'ORDER 00 : 00 01 00 00 00') =>
    [
      'TITLE "Tune"',
      'EXPANSION 0',
      'MACRO 0 0 -1 -1 0 : 15 12 8',
      'MACRO 4 3 0 -1 0 : 2',
      'INST2A03 0 0 -1 -1 -1 3 "Lead"',
      'INST2A03 2 -1 -1 -1 -1 -1 "Drum"',
      'TRACK 4 3 75 "Song"',
      'COLUMNS : 2 1 1 1 1',
      order,
      'PATTERN 00',
      ...rows,
      'PATTERN 01',
      'ROW 00 : ... .. . ... ... : E-4 00 . ... : ... .. . ... : ... .. . ... : ... .. . ...',
      'ROW 01 : ... .. . ... ... : ... .. . ... : ... .. . ... : ... .. . ... : ... .. . ...',
    ].join('\n')

  it('maps notes, triangle octaves, noise, effects and per-channel patterns', () => {
    const { song, report } = famiTrackerToSong(
      file([
        'ROW 00 : C-4 00 F Q12 4A3 : ... .. . ... : A-3 00 . ... : 7-# 02 . ... : C-3 00 . ...',
        'ROW 01 : --- .. . F96 ... : ... .. . ... : === .. . ... : ... .. . ... : ... .. . ...',
        'ROW 02 : ... .. . ... ... : ... .. . ... : ... .. . ... : ... .. . ... : ... .. . ...',
        'ROW 03 : D#5 00 . 047 ... : ... .. . ... : ... .. . ... : ... .. . ... : ... .. . ...',
      ]),
      'file',
    )
    expect(song.title).toBe('Tune')
    // Tempo 75 at speed 3 plays like ChipForge's 150 BPM.
    expect([song.bpm, song.speed, song.patternLength]).toEqual([150, 3, 4])
    const [p1, p2, tri, noise] = song.patterns[song.order[0]].channels
    expect(p1[0]).toMatchObject({ note: 60, instrument: 0, volume: 15, effect: '4', param: 0xa3 })
    expect(p1[1]).toMatchObject({ note: -1, effect: 'F', param: 0xff }) // tempo 0x96 at speed 3 → 300 BPM, capped at FF
    expect(p1[3]).toMatchObject({ note: 75, effect: '0', param: 0x47 })
    expect(p2[0]).toMatchObject({ note: 64 }) // pulse 2 plays pattern 01 in this order
    expect(tri[0].note).toBe(45) // written A-3 sounds as A2
    expect(tri[1].note).toBe(-2)
    expect(noise[0]).toMatchObject({ note: 7, instrument: 2 })
    expect(song.instruments.map((i) => i.name)).toEqual(['Lead', 'Instrument 1', 'Drum'])
    expect(song.instruments[0]).toMatchObject({ volume: { values: [15, 12, 8] }, duty: { values: [2], loop: 0 } })
    expect(report.lines.join(' ')).toMatch(/Left out 1 Qxx effects/)
    expect(report.lines.join(' ')).toMatch(/DPCM/)
  })

  it('refuses files that are not FamiTracker text', () => {
    expect(() => famiTrackerToSong('hello', 'x')).toThrow(/FamiTracker/)
  })
})
