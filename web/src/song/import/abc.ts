// ABC notation (abcnotation.com, thesession.org): the text format thousands of folk and
// game tunes are shared in. Read: the header (title, meter, unit length, tempo, key in
// any mode), notes with accidentals that last the bar, octaves, lengths, rests, chords,
// ties, broken rhythm (> <), tuplets, repeats with endings, inline fields and voices.
// Grace notes, decorations, chord symbols and lyrics are skipped. The first tune in a
// file is read.

import type { MidiFile, MidiNote } from '../../midi/smf'
import { playOrder, type BarRepeats } from './repeats'

const DIVISION = 480
const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
/** Sharps (+) or flats (-) in each major key, by tonic. */
const MAJOR_FIFTHS: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
}
/** How far each mode's tonic sits from its relative major, in fifths. */
const MODE_SHIFT: Record<string, number> = { maj: 0, ion: 0, mix: -1, dor: -2, m: -3, min: -3, aeo: -3, phr: -4, loc: -5, lyd: 1 }
const SHARP_ORDER = 'FCGDAEB'

export class AbcError extends Error {}

export interface AbcResult {
  midi: MidiFile
  title: string
  notes: string[]
}

/** Accidental per letter for a key like "G", "Dm", "A mix", "Bb dor", "none". */
export function keySignature(key: string): Record<string, number> {
  const sig: Record<string, number> = {}
  const m = /^\s*([A-G])([#b]?)\s*([A-Za-z]*)/.exec(key)
  if (!m || /^\s*(none|hp|HP)/i.test(key)) return sig
  const mode = m[3].toLowerCase().slice(0, 3)
  const shift = MODE_SHIFT[mode === '' ? 'maj' : mode === 'm' || m[3] === 'm' ? 'm' : mode] ?? 0
  // The relative major's tonic: the tonic's own fifths, minus the mode's shift.
  const tonicFifths = MAJOR_FIFTHS[m[1] + m[2]] ?? 0
  const fifths = tonicFifths + shift
  for (let i = 0; i < Math.abs(fifths) && i < 7; i++) {
    const letter = fifths > 0 ? SHARP_ORDER[i] : SHARP_ORDER[6 - i]
    sig[letter] = fifths > 0 ? 1 : -1
  }
  return sig
}

/** "3/4" → 0.75, "C" → 1, "C|" → 1. */
function meterValue(m: string): number {
  const t = m.trim()
  if (t === 'C' || t === 'C|') return 1
  const f = /^(\d+)\/(\d+)/.exec(t)
  return f ? Number(f[1]) / Number(f[2]) : 1
}

function fraction(text: string): number {
  const f = /^(\d+)\/(\d+)$/.exec(text.trim())
  return f ? Number(f[1]) / Number(f[2]) : Number(text) || 0
}

/** "1/4=120", "120", "\"Allegro\" 1/4=132" → quarter notes per minute. */
function tempoOf(q: string): number | null {
  const m = /(\d+)\/(\d+)\s*=\s*(\d+)/.exec(q)
  if (m) return (Number(m[3]) * Number(m[1]) * 4) / Number(m[2])
  const n = /^\s*(\d+)\s*$/.exec(q.replace(/"[^"]*"/g, ''))
  return n ? Number(n[1]) : null
}

interface Bar extends BarRepeats {
  /** Notes in this bar for each voice, times in whole notes from the bar's start. */
  voices: Map<string, { start: number; length: number; pitch: number; tieOut: boolean }[]>
  length: number
}

export function abcToMidi(text: string, fallbackTitle: string): AbcResult {
  const lines = text.split(/\r?\n/)
  const tunes = lines.filter((l) => /^X:/.test(l)).length
  const firstX = lines.findIndex((l) => /^X:/.test(l))
  if (!lines.some((l) => /^K:/.test(l))) throw new AbcError("That isn't ABC notation (it has no K: key line).")
  const notes: string[] = []
  if (tunes > 1) notes.push(`The file has ${tunes} tunes; this is the first.`)

  let title = fallbackTitle
  let meter = 1
  let unit = 0
  let tempo: number | null = null
  let key: Record<string, number> = {}
  let inBody = false
  let voice = '1'
  const voiceNames = new Map<string, string>()
  const bars: Bar[] = [{ voices: new Map(), length: 0 }]
  // Per voice: where it is in the current bar, and its bar index.
  const state = new Map<string, { bar: number; pos: number; accidentals: Record<string, number> }>()
  const voiceState = () => {
    let s = state.get(voice)
    if (!s) state.set(voice, (s = { bar: 0, pos: 0, accidentals: {} }))
    return s
  }
  const unitLength = () => unit || (meter < 0.75 ? 1 / 16 : 1 / 8)

  const field = (name: string, value: string) => {
    switch (name) {
      case 'T':
        if (title === fallbackTitle && value.trim()) title = value.trim()
        break
      case 'M':
        meter = meterValue(value)
        break
      case 'L':
        unit = fraction(value)
        break
      case 'Q':
        tempo ??= tempoOf(value)
        break
      case 'K':
        key = keySignature(value)
        inBody = true
        break
      case 'V': {
        const id = value.trim().split(/\s+/)[0] || '1'
        voice = id
        const name = /(?:name|nm)="([^"]+)"/.exec(value)?.[1]
        if (name) voiceNames.set(id, name)
        break
      }
    }
  }

  const barAt = (i: number) => {
    while (bars.length <= i) bars.push({ voices: new Map(), length: 0 })
    return bars[i]
  }
  const endBar = (sign: string) => {
    const s = voiceState()
    const bar = barAt(s.bar)
    bar.length = Math.max(bar.length, s.pos)
    if (/:\|/.test(sign) || /^::/.test(sign)) bar.backward = Math.max(bar.backward ?? 0, 2)
    s.bar++
    s.pos = 0
    s.accidentals = {}
    const next = barAt(s.bar)
    if (/\|:/.test(sign) || /::/.test(sign)) next.forward = true
  }

  for (const raw of lines.slice(Math.max(0, firstX))) {
    if (inBody && /^X:/.test(raw) && raw !== lines[firstX]) break // the next tune
    const line = raw.replace(/%.*$/, '')
    const header = /^([A-Za-z]):(.*)$/.exec(line)
    if (header) {
      field(header[1], header[2])
      continue
    }
    if (!inBody || !line.trim()) continue

    let i = 0
    let broken = 0 // pending length factor for the next note from > or <
    let tuplet: { left: number; factor: number } | null = null
    let ending: number[] | null = null
    const take = (re: RegExp) => {
      re.lastIndex = i
      const m = re.exec(line)
      if (m) i = re.lastIndex
      return m
    }
    const length = () => {
      const m = take(/(\d*)(\/*)(\d*)/y)!
      let len = m[1] ? Number(m[1]) : 1
      if (m[2]) len /= m[3] ? Number(m[3]) : 2 ** m[2].length
      return len * unitLength()
    }

    while (i < line.length) {
      const c = line[i]
      if (c === ' ' || c === '\t' || c === '\\' || c === '`') {
        i++
      } else if (c === '"') {
        i = line.indexOf('"', i + 1) + 1 || line.length // chord symbol or annotation
      } else if (c === '!' || c === '+') {
        const end = line.indexOf(c, i + 1)
        i = end > i ? end + 1 : i + 1 // decoration
      } else if (c === '{') {
        i = line.indexOf('}', i) + 1 || line.length // grace notes
      } else if (c === '[' && /^\[[A-Za-z]:/.test(line.slice(i))) {
        const end = line.indexOf(']', i)
        field(line[i + 1], line.slice(i + 3, end))
        i = end + 1
      } else if (c === '[' && /^\[\d/.test(line.slice(i))) {
        const m = take(/\[(\d+(?:[,-]\d+)*)/y)!
        ending = endingNumbers(m[1])
        barAt(voiceState().bar).endings = ending
      } else if (c === '|' || c === ':' || (c === '[' && line[i + 1] === '|')) {
        const m = take(/[:|[\]]+/y)!
        endBar(m[0])
        const after = take(/\s*(\d+(?:[,-]\d+)*)/y)
        if (after && /[|:]$/.test(m[0])) barAt(voiceState().bar).endings = endingNumbers(after[1])
      } else if (c === ']') {
        i++
      } else if (c === '(' && /^\(\d/.test(line.slice(i))) {
        const m = take(/\((\d)(?::(\d*))?(?::(\d*))?/y)!
        const p = Number(m[1])
        const q = m[2] ? Number(m[2]) : [0, 1, 3, 2, 3, 2, 2, 2, 3, 2][p] ?? 2
        tuplet = { left: m[3] ? Number(m[3]) : p, factor: q / p }
      } else if (c === '>' || c === '<') {
        const m = take(/[<>]+/y)!
        const dots = m[0].length
        const longer = 2 - 1 / 2 ** dots
        const shorter = 1 / 2 ** dots
        // Adjust the note just written and the next one.
        const s = voiceState()
        const list = barAt(s.bar).voices.get(voice) ?? []
        const prev = list.filter((n) => n.start === lastStart(list)).filter(Boolean)
        const old = prev[0]?.length ?? 0
        const factor = c === '>' ? longer : shorter
        for (const n of prev) n.length = old * factor
        s.pos = (prev[0]?.start ?? s.pos) + old * factor
        broken = c === '>' ? shorter : longer
      } else if (c === '-') {
        const s = voiceState()
        const list = barAt(s.bar).voices.get(voice) ?? []
        for (const n of list.filter((n) => n.start === lastStart(list))) n.tieOut = true
        i++
      } else if (/[zxZX]/.test(c)) {
        i++
        const s = voiceState()
        if (c === 'Z' || c === 'X') {
          // Multi-bar rest: Z4 is four bars.
          const m = take(/\d*/y)!
          const count = Number(m[0]) || 1
          for (let k = 0; k < count; k++) {
            s.pos = meter
            endBar('|')
          }
        } else {
          let len = length()
          if (broken) (len *= broken), (broken = 0)
          if (tuplet) {
            len *= tuplet.factor
            if (--tuplet.left <= 0) tuplet = null
          }
          s.pos += len
        }
      } else if (c === '[' || /[_=^A-Ga-g]/.test(c)) {
        // A note, or a chord of notes sharing one start.
        const chord = c === '['
        if (chord) i++
        const s = voiceState()
        const start = s.pos
        let longest = 0
        do {
          const m = take(/(\^\^|\^|__|_|=)?([A-Ga-g])([,']*)/y)
          if (!m) break
          const letter = m[2].toUpperCase()
          let octave = m[2] === letter ? 4 : 5
          for (const mark of m[3]) octave += mark === ',' ? -1 : 1
          const id = `${letter}${octave}`
          if (m[1]) s.accidentals[id] = { '^^': 2, '^': 1, '=': 0, _: -1, __: -2 }[m[1]]!
          const accidental = s.accidentals[id] ?? key[letter] ?? 0
          let len = length()
          if (broken) len *= broken
          if (tuplet) len *= tuplet.factor
          longest = Math.max(longest, len)
          const pitch = (octave + 1) * 12 + LETTERS[letter] + accidental
          const list = barAt(s.bar).voices.get(voice) ?? []
          list.push({ start, length: len, pitch, tieOut: false })
          barAt(s.bar).voices.set(voice, list)
          if (take(/-/y)) list[list.length - 1].tieOut = true
        } while (chord && line[i] !== ']' && i < line.length)
        if (chord) {
          i++ // ]
          // A length after the chord applies to all its notes.
          const after = take(/(\d+)?(\/*)(\d*)/y)
          if (after && (after[1] || after[2])) {
            let f = after[1] ? Number(after[1]) : 1
            if (after[2]) f /= after[3] ? Number(after[3]) : 2 ** after[2].length
            const list = barAt(s.bar).voices.get(voice)!
            for (const n of list.filter((n) => n.start === start)) n.length *= f
            longest *= f
          }
        }
        if (broken) broken = 0
        if (tuplet && --tuplet.left <= 0) tuplet = null
        s.pos = start + longest
      } else {
        i++ // anything else (lyrics markers, stray symbols)
      }
    }
  }
  // Close the last bar.
  for (const [v, s] of state) {
    voice = v
    const bar = barAt(s.bar)
    bar.length = Math.max(bar.length, s.pos)
  }
  if (!bars.some((b) => b.voices.size)) throw new AbcError('The tune has no notes.')

  const order = playOrder(bars)
  if (order.length > bars.length) notes.push('Repeats were played out in full.')
  const voices = [...new Set(bars.flatMap((b) => [...b.voices.keys()]))]
  const ticks = (wholeNotes: number) => Math.round(wholeNotes * 4 * DIVISION)
  const tracks = voices.map((v, k) => {
    const out: MidiNote[] = []
    const open = new Map<number, MidiNote>()
    let at = 0
    for (const b of order) {
      const bar = bars[b]
      for (const n of bar.voices.get(v) ?? []) {
        const tick = at + ticks(n.start)
        const held = open.get(n.pitch)
        if (held && held.tick + held.duration >= tick - 1) held.duration = tick + ticks(n.length) - held.tick
        else {
          const note = { tick, duration: Math.max(1, ticks(n.length)), note: Math.min(127, Math.max(0, n.pitch)), velocity: 100, channel: k % 16 === 9 ? 10 : k % 16 }
          out.push(note)
          open.set(n.pitch, note)
        }
        if (!n.tieOut) open.delete(n.pitch)
      }
      // Empty bars (rests only) still take a bar of time.
      at += ticks(bar.length || meter)
    }
    return { name: voiceNames.get(v) ?? (voices.length > 1 ? `Voice ${v}` : title), notes: out }
  })
  const bpm = tempo ?? 120
  return { midi: { division: DIVISION, tempo: Math.round(60_000_000 / bpm), tracks }, title, notes }
}

function endingNumbers(text: string): number[] {
  const out: number[] = []
  for (const part of text.split(',')) {
    const [a, b] = part.split('-').map(Number)
    for (let n = a; n <= (b || a); n++) out.push(n)
  }
  return out
}

function lastStart(list: { start: number }[]): number {
  return list.length ? list[list.length - 1].start : -1
}
