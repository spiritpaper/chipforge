import { describe, expect, it } from 'vitest'
import { importSongFile, SongImportError } from '.'
import { writeMidi } from '../../midi/smf'
import { songToMidi } from '../../midi/convert'
import { songToFamiTracker } from '../../export/famitracker'
import { firstLight } from '../templates'

const file = (data: BlobPart, name: string) => new File([data], name)

describe('importSongFile', () => {
  it('opens each format by its contents', async () => {
    const song = firstLight()
    const cases: [File, RegExp][] = [
      [file(writeMidi(songToMidi(song)), 'a.mid'), /MIDI/],
      [file(songToFamiTracker(song), 'a.txt'), /FamiTracker/],
      [file('X:1\nT:Reel\nK:D\nDEFG ABcd|', 'tune.abc'), /ABC/],
      [file('<score-partwise><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1"><measure><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration></note></measure></part></score-partwise>', 'x.musicxml'), /MusicXML/],
    ]
    for (const [f, kind] of cases) {
      const { song: s, report } = await importSongFile(f)
      expect(report.lines[0], f.name).toMatch(kind)
      expect(s.order.length).toBeGreaterThan(0)
    }
    const json = await importSongFile(file(JSON.stringify(song), 'song.json'))
    expect(json.song.title).toBe(song.title)
  })

  it('explains what it can open', async () => {
    await expect(importSongFile(file('hello', 'notes.txt'))).rejects.toThrow(/MIDI, MusicXML/)
    await expect(importSongFile(file('FTM data', 'song.ftm'))).rejects.toThrow(/Export Text/)
    await expect(importSongFile(file('x', 'laser.sfs'))).rejects.toThrow(/SFX Lab/)
    await expect(importSongFile(file('{"a":1}', 'x.json'))).rejects.toBeInstanceOf(SongImportError)
  })
})
