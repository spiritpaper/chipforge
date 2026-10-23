// MOD files (ProTracker and its relatives: M.K., FLT4, 4CHN…8CHN, xxCH), the Amiga
// tracker format behind archives of game and demo music like modarchive.org, read into
// the note list a MIDI file becomes. Each channel is a part; notes played with a
// sample whose name says drum, kick, snare, hat and so on go to the drums. Samples
// aren't carried over: the chip plays the notes with its own instruments.

import type { MidiFile, MidiNote } from '../../midi/smf'

const ROWS = 64
/** Ticks per quarter note in the result; a row is a 16th note, as in ChipForge. */
const DIVISION = 96
const TICKS_PER_ROW = DIVISION / 4
const DRUMS = 9
/** Amiga clock (PAL), for how long an unlooped sample sounds. */
const PAULA = 7_093_789.2

export class ModError extends Error {}

export interface ModResult {
  midi: MidiFile
  title: string
  notes: string[]
}

interface Sample {
  name: string
  /** In bytes. */
  length: number
  looped: boolean
  volume: number
}

function channelsFor(tag: string): number {
  if (['M.K.', 'M!K!', 'FLT4', '4CHN'].includes(tag)) return 4
  if (tag === 'FLT8') return 8
  const n = /^(\d)CHN$/.exec(tag) ?? /^(\d\d)CH$/.exec(tag)
  return n ? Number(n[1]) : 0
}

/** The General MIDI drum a sample's name suggests, or null for melodic samples. */
export function drumForSample(name: string): number | null {
  const n = name.toLowerCase()
  // Abbreviations count when no other letter follows: "BD1", "sd-2", "hh".
  if (/kick|\bbd(?![a-z])|bassdr|bass ?drum/.test(n)) return 36
  if (/snare|\bsd(?![a-z])|\bsn(?![a-z])/.test(n)) return 38
  if (/clap/.test(n)) return 39
  if (/open\s*h|\bohh?(?![a-z])/.test(n)) return 46
  if (/hat|\bhh(?![a-z])|\bch(?![a-z])|shake|maraca|tamb/.test(n)) return 42
  if (/crash|cymbal|cymb/.test(n)) return 49
  if (/ride/.test(n)) return 51
  if (/tom/.test(n)) return 45
  if (/drum|perc|noise|\bhit\b/.test(n)) return 38
  return null
}

/** Amiga period → MIDI note; period 428 (ProTracker's C-2) is middle C. */
export function periodToNote(period: number): number {
  return Math.round(60 + 12 * Math.log2(428 / period))
}

export function modToMidi(bytes: Uint8Array, fallbackTitle: string): ModResult {
  if (bytes.length < 1084) throw new ModError("That isn't a MOD file: it's too short.")
  const ascii = (from: number, len: number) => String.fromCharCode(...bytes.slice(from, from + len)).replace(/\0.*$/s, '').trim()
  const channels = channelsFor(ascii(1080, 4))
  if (!channels) throw new ModError("That isn't a MOD file this importer knows (or it's an old 15-sample Soundtracker module).")
  const notes: string[] = []
  const title = ascii(0, 20) || fallbackTitle

  const samples: Sample[] = [{ name: '', length: 0, looped: false, volume: 64 }]
  for (let s = 0; s < 31; s++) {
    const o = 20 + s * 30
    const word = (at: number) => (bytes[o + at] << 8) | bytes[o + at + 1]
    samples.push({ name: ascii(o, 22), length: word(22) * 2, volume: Math.min(64, bytes[o + 25]), looped: word(28) > 1 })
  }
  const songLength = Math.max(1, Math.min(128, bytes[950]))
  const orders = Array.from(bytes.slice(952, 952 + 128))
  const patternCount = Math.max(...orders) + 1
  const patternBytes = ROWS * channels * 4
  if (bytes.length < 1084 + patternCount * patternBytes) throw new ModError('The MOD file is cut short.')

  const cell = (pattern: number, row: number, ch: number) => {
    const o = 1084 + pattern * patternBytes + (row * channels + ch) * 4
    return {
      sample: (bytes[o] & 0xf0) | (bytes[o + 2] >> 4),
      period: ((bytes[o] & 0x0f) << 8) | bytes[o + 1],
      effect: bytes[o + 2] & 0x0f,
      param: bytes[o + 3],
    }
  }

  // Play the song row by row, following pattern breaks and jumps, until it ends or
  // loops back to a row it already played.
  let speed = 6
  let tempo = 125
  let firstTempo: number | null = null
  let firstSpeed = 6
  let tempoChanges = 0
  const melodic: MidiNote[][] = Array.from({ length: channels }, () => [])
  const drums: MidiNote[] = []
  const playing: (MidiNote | null)[] = Array(channels).fill(null)
  const lastSample = Array(channels).fill(0)
  const seen = new Set<string>()
  let row = 0
  let ticks = 0
  const end = (ch: number, at: number) => {
    const n = playing[ch]
    if (n) n.duration = Math.max(1, Math.min(n.duration, at - n.tick))
    playing[ch] = null
  }

  for (let pos = 0, startRow = 0; pos < songLength; ) {
    const pattern = orders[pos]
    let jump: { pos: number; row: number } | null = null
    for (row = startRow; row < ROWS; row++) {
      const key = `${pos}:${row}`
      if (seen.has(key)) {
        notes.push('The song loops; it was read up to where it starts again.')
        pos = songLength
        break
      }
      seen.add(key)
      for (let ch = 0; ch < channels; ch++) {
        const c = cell(pattern, row, ch)
        if (c.effect === 0xf && c.param) {
          if (c.param < 0x20) speed = c.param
          else {
            if (firstTempo === null && ticks === 0) tempo = c.param
            else if (c.param !== tempo) tempoChanges++
          }
        }
        if (c.effect === 0xb) jump = { pos: c.param, row: 0 }
        if (c.effect === 0xd) jump ??= { pos: pos + 1, row: Math.min(63, (c.param >> 4) * 10 + (c.param & 0xf)) }
        if (c.sample) lastSample[ch] = c.sample
        // A note: a period, with this cell's sample or the last one used here.
        if (c.period) {
          end(ch, ticks)
          const sample = samples[lastSample[ch]] ?? samples[0]
          const drum = drumForSample(sample.name)
          const volume = c.effect === 0xc ? Math.min(64, c.param) : sample.volume
          // An unlooped sample stops when it runs out.
          const seconds = sample.looped || !sample.length ? Infinity : sample.length / (PAULA / (2 * c.period))
          const rowSeconds = (2.5 * speed) / tempo
          const maxTicks = Number.isFinite(seconds) ? Math.max(1, Math.round((seconds / rowSeconds) * TICKS_PER_ROW)) : 1e9
          const note: MidiNote = {
            tick: ticks,
            duration: maxTicks,
            note: drum ?? Math.min(127, Math.max(0, periodToNote(c.period))),
            velocity: Math.max(1, Math.round((volume / 64) * 127)),
            channel: drum !== null ? DRUMS : ch % 16 === DRUMS ? 15 : ch % 16,
          }
          if (volume > 0) {
            ;(drum !== null ? drums : melodic[ch]).push(note)
            playing[ch] = note
          }
        } else if ((c.effect === 0xc && c.param === 0) || (c.effect === 0xe && c.param >> 4 === 0xc)) {
          end(ch, ticks + (c.effect === 0xe ? Math.round(((c.param & 0xf) / speed) * TICKS_PER_ROW) : 0))
        }
      }
      if (firstTempo === null) {
        firstTempo = tempo
        firstSpeed = speed
      }
      ticks += TICKS_PER_ROW
      if (jump) break
    }
    if (pos >= songLength) break
    if (jump) {
      if (jump.pos <= pos && seen.has(`${jump.pos}:${jump.row}`)) {
        notes.push('The song loops; it was read up to where it starts again.')
        break
      }
      pos = jump.pos
      startRow = jump.row
    } else {
      pos++
      startRow = 0
    }
  }
  for (let ch = 0; ch < channels; ch++) end(ch, ticks)

  if (tempoChanges) notes.push('The module changes tempo; the chip version keeps the first.')
  if (drums.length) notes.push('Notes played with drum samples (by their names) went to the Noise channel.')
  // ChipForge's BPM for the module's first speed and tempo (a row is a 16th note).
  const bpm = (6 * (firstTempo ?? 125)) / firstSpeed
  const tracks = [
    ...melodic.map((list, ch) => ({ name: `MOD channel ${ch + 1}`, notes: list })),
    { name: 'Drums', notes: drums },
  ].filter((t) => t.notes.length)
  return { midi: { division: DIVISION, tempo: Math.round(60_000_000 / bpm), tracks }, title, notes }
}
