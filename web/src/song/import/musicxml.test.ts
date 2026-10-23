import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { musicXmlToMidi, unzipMxl } from './musicxml'

const note = (step: string, octave: number, duration: number, extra = '') =>
  `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration>${extra}</note>`

// Two parts: a melody with a chord, a tie across the bar line, a pickup and a repeat
// with endings; a drum part.
const SCORE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Test Tune</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Clarinet</part-name></score-part>
    <score-part id="P2"><part-name>Drums</part-name>
      <score-instrument id="P2-I36"><instrument-name>Bass Drum</instrument-name></score-instrument>
      <midi-instrument id="P2-I36"><midi-channel>10</midi-channel><midi-unpitched>37</midi-unpitched></midi-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="0">
      <attributes><divisions>2</divisions><transpose><chromatic>-2</chromatic></transpose></attributes>
      <direction><sound tempo="96"/></direction>
      ${note('G', 4, 2)}
    </measure>
    <measure number="1">
      <barline location="left"><repeat direction="forward"/></barline>
      ${note('C', 5, 4)}${note('E', 5, 4, '<chord/>')}${note('D', 5, 4, '<tie type="start"/>')}
    </measure>
    <measure number="2">
      ${note('D', 5, 2, '<tie type="stop"/>')}<note><rest/><duration>6</duration></note>
      <barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline>
      <barline location="left"><ending number="1" type="start"/></barline>
    </measure>
    <measure number="3">
      <barline location="left"><ending number="2" type="start"/></barline>
      ${note('F', 5, 8)}
    </measure>
  </part>
  <part id="P2">
    <measure number="0"><attributes><divisions>2</divisions><clef><sign>percussion</sign></clef></attributes><note><rest/><duration>2</duration></note></measure>
    <measure number="1"><note><unpitched><display-step>F</display-step><display-octave>4</display-octave></unpitched><duration>8</duration><instrument id="P2-I36"/></note></measure>
    <measure number="2"><note><rest/><duration>8</duration></note></measure>
    <measure number="3"><note><rest/><duration>8</duration></note></measure>
  </part>
</score-partwise>`

describe('MusicXML import', () => {
  const { midi, title, notes } = musicXmlToMidi(SCORE, 'file')
  const [clarinet, drums] = midi.tracks
  const q = midi.division // a quarter note

  it('reads the title, parts and first tempo', () => {
    expect(title).toBe('Test Tune')
    expect(midi.tracks.map((t) => t.name)).toEqual(['Clarinet', 'Drums'])
    expect(Math.round(60_000_000 / midi.tempo)).toBe(96)
  })

  it('places notes, chords and ties at sounding pitch, playing repeats and endings', () => {
    // Clarinet in B♭ sounds a tone lower. Pickup G4 (1 beat) → F4 at 0.
    const timeline = clarinet.notes.map((n) => [n.tick / q, n.duration / q, n.note])
    expect(timeline).toEqual([
      [0, 1, 65],
      // Bar 1 (first time): C5+E5 for 2 beats, then D5 tied over the bar line: 3 beats.
      [1, 2, 70], [1, 2, 74], [3, 3, 72],
      // Bar 1 again. Its tie led into the 1st ending, which is skipped this time, so the
      // D5 ends with the bar.
      [9, 2, 70], [9, 2, 74], [11, 2, 72],
      // The 2nd ending: F5 for 4 beats.
      [13, 4, 75],
    ])
    expect(notes.join(' ')).toMatch(/Repeats were played out/)
  })

  it('puts percussion on the drum channel with its General MIDI sound', () => {
    expect(drums.notes.map((n) => [n.tick / q, n.channel, n.note])).toEqual([[1, 9, 36], [9, 9, 36]])
  })

  it('opens zipped .mxl files', () => {
    const mxl = zipSync({
      'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>'),
      'score.musicxml': strToU8(SCORE),
    })
    expect(unzipMxl(mxl)).toBe(SCORE)
  })

  it('refuses things that are not scores', () => {
    expect(() => musicXmlToMidi('<html></html>', 'x')).toThrow(/MusicXML/)
  })
})
