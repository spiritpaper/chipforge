// MusicXML (.musicxml, .xml, and zipped .mxl), as MuseScore, Sibelius, Finale and
// Dorico export it, read into the same note list a MIDI file becomes, so the MIDI
// importer's arranging applies. Read: notes, chords, ties, voices, rests, every part,
// percussion, transposing instruments, repeats with 1st/2nd endings, the first tempo.

import { unzipSync, strFromU8 } from 'fflate'
import type { MidiFile, MidiNote } from '../../midi/smf'
import { playOrder, type BarRepeats } from './repeats'
import { child, children, parseXml, textOf } from './xml'

/** Ticks per quarter note in the result. */
const DIVISION = 480
const DRUMS = 9
const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

export class MusicXmlError extends Error {}

export interface MusicXmlResult {
  midi: MidiFile
  title: string
  notes: string[]
}

/** The score inside an .mxl: META-INF/container.xml names it, else the first .xml. */
export function unzipMxl(bytes: Uint8Array): string {
  const files = unzipSync(bytes)
  const container = files['META-INF/container.xml']
  const path = container ? /full-path="([^"]+)"/.exec(strFromU8(container))?.[1] : undefined
  const name = path && files[path] ? path : Object.keys(files).find((f) => !f.startsWith('META-INF') && /\.(musicxml|xml)$/i.test(f))
  if (!name) throw new MusicXmlError('That .mxl file has no score in it.')
  return strFromU8(files[name])
}

/** General MIDI drum for an unpitched note: its sound if the score says, else by name. */
function drumFor(name: string): number {
  const n = name.toLowerCase()
  if (/kick|bass drum|bd\b/.test(n)) return 36
  if (/rim|side/.test(n)) return 37
  if (/snare/.test(n)) return 38
  if (/clap/.test(n)) return 39
  if (/tom/.test(n)) return /high|hi/.test(n) ? 50 : /low|floor/.test(n) ? 43 : 47
  if (/open/.test(n) && /hat/.test(n)) return 46
  if (/pedal/.test(n)) return 44
  if (/hat/.test(n)) return 42
  if (/crash/.test(n)) return 49
  if (/ride/.test(n)) return 51
  if (/cowbell/.test(n)) return 56
  return 38
}

export function musicXmlToMidi(xmlText: string, fallbackTitle: string): MusicXmlResult {
  const doc = parseXml(xmlText)
  const score = child(doc, 'score-partwise')
  if (!score) {
    if (child(doc, 'score-timewise')) throw new MusicXmlError('Timewise MusicXML isn’t supported; export it from your notation app again (partwise is the default).')
    throw new MusicXmlError("That isn't a MusicXML score.")
  }
  const notes: string[] = []
  const title =
    textOf(score, 'work/work-title') || textOf(score, 'movement-title') ||
    children(score, 'credit').map((c) => textOf(c, 'credit-words')).find(Boolean) || fallbackTitle

  // Part names, and the GM sounds of percussion instruments.
  const partInfo = new Map<string, { name: string; drums: Map<string, number>; drumChannel: boolean }>()
  for (const sp of children(child(score, 'part-list'), 'score-part')) {
    const drums = new Map<string, number>()
    let drumChannel = false
    for (const mi of children(sp, 'midi-instrument')) {
      if (textOf(mi, 'midi-channel') === '10') drumChannel = true
      const unpitched = Number(textOf(mi, 'midi-unpitched'))
      if (unpitched) drums.set(mi.attrs.id, unpitched - 1)
    }
    for (const si of children(sp, 'score-instrument')) {
      if (!drums.has(si.attrs.id)) drums.set(si.attrs.id, drumFor(textOf(si, 'instrument-name') ?? ''))
    }
    partInfo.set(sp.attrs.id, { name: textOf(sp, 'part-name') ?? '', drums, drumChannel })
  }

  const parts = children(score, 'part')
  if (!parts.length) throw new MusicXmlError('The score has no parts.')

  // Repeats are read from the first part (bars line up across parts).
  const bars: BarRepeats[] = children(parts[0], 'measure').map((m) => {
    const r: BarRepeats = {}
    for (const bl of children(m, 'barline')) {
      const rep = child(bl, 'repeat')
      if (rep?.attrs.direction === 'forward') r.forward = true
      if (rep?.attrs.direction === 'backward') r.backward = Number(rep.attrs.times) || 2
      const ending = child(bl, 'ending')
      if (ending && (ending.attrs.type === 'start' || !r.endings)) {
        const nums = (ending.attrs.number ?? '').split(/[,\s]+/).map(Number).filter((n) => n > 0)
        if (nums.length) r.endings = nums
      }
    }
    return r
  })
  const order = playOrder(bars)
  if (order.length > bars.length) notes.push('Repeats were played out in full.')
  if (/<sound[^>]*(dacapo|dalsegno|tocoda)=/i.test(xmlText)) notes.push('D.C., D.S. and coda jumps were not followed.')

  let tempo: number | null = null
  let tempoChanges = 0
  const tracks = parts.map((part, pi) => {
    const info = partInfo.get(part.attrs.id)
    const measures = children(part, 'measure')
    const out: MidiNote[] = []
    // Ties: the open note of each pitch, to extend instead of restarting.
    const open = new Map<number, MidiNote>()
    let divisions = 1
    let transpose = 0
    let tick = 0
    let isPercussion = info?.drumChannel ?? false

    for (const index of order) {
      const measure = measures[index]
      if (!measure) continue
      let pos = 0 // in divisions, within the bar
      let longest = 0
      let lastStart = 0
      const at = (d: number) => tick + Math.round((d * DIVISION) / divisions)
      for (const el of measure.children) {
        switch (el.name) {
          case 'attributes': {
            divisions = Number(textOf(el, 'divisions')) || divisions
            const tr = child(el, 'transpose')
            if (tr) transpose = (Number(textOf(tr, 'chromatic')) || 0) + 12 * (Number(textOf(tr, 'octave-change')) || 0)
            if (textOf(el, 'clef/sign') === 'percussion') isPercussion = true
            break
          }
          case 'direction':
          case 'sound': {
            const sound = el.name === 'sound' ? el : child(el, 'sound')
            const t = Number(sound?.attrs.tempo) || Number(textOf(el, 'direction-type/metronome/per-minute'))
            if (t > 0) {
              if (tempo === null) tempo = t
              else if (Math.abs(t - tempo) > 0.5) tempoChanges++
            }
            break
          }
          case 'backup':
            pos -= Number(textOf(el, 'duration')) || 0
            break
          case 'forward':
            pos += Number(textOf(el, 'duration')) || 0
            break
          case 'note': {
            if (child(el, 'grace') || child(el, 'cue')) break
            const duration = Number(textOf(el, 'duration')) || 0
            const start = child(el, 'chord') ? lastStart : pos
            if (!child(el, 'chord')) {
              lastStart = pos
              pos += duration
            }
            longest = Math.max(longest, pos)
            if (child(el, 'rest')) break
            let pitch: number
            let channel = pi % 16 === DRUMS ? 0 : pi % 16
            const unpitched = child(el, 'unpitched')
            if (unpitched || isPercussion) {
              const instrument = child(el, 'instrument')?.attrs.id
              pitch = (instrument && info?.drums.get(instrument)) || drumFor(textOf(el, 'notehead') ?? '')
              channel = DRUMS
            } else {
              const step = STEPS[textOf(el, 'pitch/step') ?? '']
              if (step === undefined) break
              const octave = Number(textOf(el, 'pitch/octave') ?? 4)
              pitch = (octave + 1) * 12 + step + Math.round(Number(textOf(el, 'pitch/alter') ?? 0)) + transpose
            }
            pitch = Math.min(127, Math.max(0, pitch))
            const tieStop = children(el, 'tie').some((t) => t.attrs.type === 'stop')
            const tieStart = children(el, 'tie').some((t) => t.attrs.type === 'start')
            const startTick = at(start)
            const length = at(start + duration) - startTick
            const held = tieStop ? open.get(pitch) : undefined
            if (held && held.tick + held.duration >= startTick - 1) {
              held.duration = startTick + length - held.tick
            } else {
              const note: MidiNote = { tick: startTick, duration: Math.max(1, length), note: pitch, velocity: 100, channel }
              out.push(note)
              if (tieStart) open.set(pitch, note)
            }
            if (!tieStart) open.delete(pitch)
            break
          }
        }
      }
      // A bar lasts as long as its longest voice (pickup bars are short).
      tick += Math.round((Math.max(longest, pos) * DIVISION) / divisions)
    }
    return { name: info?.name || `Part ${pi + 1}`, notes: out }
  })

  if (tempoChanges) notes.push(`The score changes tempo ${tempoChanges} ${tempoChanges === 1 ? 'time' : 'times'}; the chip version keeps the first.`)
  const bpm = tempo ?? 120
  return { midi: { division: DIVISION, tempo: Math.round(60_000_000 / bpm), tracks }, title, notes }
}
