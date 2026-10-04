// Songs ↔ MIDI. Export writes what the song plays (effects are not representable);
// import squeezes any MIDI file onto the chip's four channels.

import { segments } from '../lib/grid'
import { emptyPattern, EMPTY_CELL, NOTE_OFF, SONG_VERSION, type Cell, type Pattern, type Song } from '../song/model'
import { PRESET_INSTRUMENTS as I } from '../song/instruments'
import type { MidiFile, MidiNote } from './smf'

const DIVISION = 96
const DRUM_CHANNEL = 9
const NOISE = 3

/** General MIDI drums for the noise channel, by noise sound (note % 16). */
function gmDrum(noise: number): number {
  return noise <= 5 ? 36 : noise <= 10 ? 38 : 42
}

export function songToMidi(song: Song): MidiFile {
  const ticksPerRow = DIVISION / song.rowsPerBeat
  const names = ['Pulse 1', 'Pulse 2', 'Triangle', 'Noise']
  const tracks = names.map((name, ch) => {
    const notes: MidiNote[] = []
    song.order.forEach((p, i) => {
      const offset = i * song.patternLength
      for (const s of segments(song.patterns[p].channels[ch])) {
        const volume = song.patterns[p].channels[ch][s.start].volume
        notes.push({
          tick: (offset + s.start) * ticksPerRow,
          duration: s.length * ticksPerRow,
          note: ch === NOISE ? gmDrum(s.note % 16) : s.note,
          velocity: volume === null ? 100 : Math.max(1, Math.round((volume / 15) * 127)),
          channel: ch === NOISE ? DRUM_CHANNEL : ch,
        })
      }
    })
    return { name, notes }
  })
  return { division: DIVISION, tempo: Math.round(60_000_000 / song.bpm), tracks }
}

export interface ImportReport {
  title: string
  /** Plain-language notes about what went where, for the user. */
  lines: string[]
}

interface Source {
  label: string
  notes: MidiNote[]
  avgPitch: number
}

const ROWS_PER_BEAT = 4
const PATTERN_LENGTH = 64
const MAX_PATTERNS = 256

/** One note per row: the highest (melody) or lowest (bass) of notes starting together. */
function monophonic(notes: MidiNote[], rows: number, ticksPerRow: number, prefer: 'high' | 'low', instrument: number): Cell[] {
  const cells: Cell[] = Array(rows).fill(EMPTY_CELL)
  const starts = new Map<number, MidiNote>()
  for (const n of notes) {
    const row = Math.round(n.tick / ticksPerRow)
    if (row >= rows) continue
    const prev = starts.get(row)
    if (!prev || (prefer === 'high' ? n.note > prev.note : n.note < prev.note)) starts.set(row, n)
  }
  const ordered = [...starts.entries()].sort((a, b) => a[0] - b[0])
  ordered.forEach(([row, n], k) => {
    const volume = n.velocity >= 112 ? null : Math.max(1, Math.round((n.velocity / 127) * 15))
    cells[row] = { ...EMPTY_CELL, note: Math.min(127, n.note), instrument, volume }
    const end = Math.max(row + 1, Math.round((n.tick + n.duration) / ticksPerRow))
    const next = ordered[k + 1]?.[0] ?? rows
    if (end < next && end < rows) cells[end] = { ...EMPTY_CELL, note: NOTE_OFF }
  })
  return cells
}

/** GM drum note → our kit: [noise note, instrument]. */
function drumVoice(gm: number, kit: { kick: number; snare: number; hat: number; open: number }): [number, number, number] {
  if (gm === 35 || gm === 36) return [1, kit.kick, 0]
  if ([37, 38, 39, 40].includes(gm)) return [8, kit.snare, 1]
  if ([42, 44].includes(gm)) return [14, kit.hat, 2]
  if ([46, 49, 51, 52, 55, 57, 59].includes(gm)) return [12, kit.open, 3]
  if (gm >= 41 && gm <= 50) return [4, kit.kick, 0] // toms: low thuds
  return [10, kit.snare, 1]
}

function drums(notes: MidiNote[], rows: number, ticksPerRow: number, kit: { kick: number; snare: number; hat: number; open: number }): Cell[] {
  const cells: Cell[] = Array(rows).fill(EMPTY_CELL)
  const best = new Map<number, [number, number, number]>()
  for (const n of notes) {
    const row = Math.round(n.tick / ticksPerRow)
    if (row >= rows) continue
    const voice = drumVoice(n.note, kit)
    const prev = best.get(row)
    // Kick beats snare beats hats when they land on the same row.
    if (!prev || voice[2] < prev[2]) best.set(row, voice)
  }
  for (const [row, [note, instrument]] of best) cells[row] = { ...EMPTY_CELL, note, instrument }
  return cells
}

export function midiToSong(midi: MidiFile, title: string): { song: Song; report: ImportReport } {
  const ticksPerRow = midi.division / ROWS_PER_BEAT
  const lines: string[] = []

  // Split tracks by MIDI channel: format 0 files put everything in one track.
  const sources: Source[] = []
  const drumNotes: MidiNote[] = []
  midi.tracks.forEach((t, ti) => {
    const byChannel = new Map<number, MidiNote[]>()
    for (const n of t.notes) {
      if (n.channel === DRUM_CHANNEL) drumNotes.push(n)
      else byChannel.set(n.channel, [...(byChannel.get(n.channel) ?? []), n])
    }
    for (const [ch, notes] of byChannel) {
      const label = t.name.trim() || `track ${ti + 1}${byChannel.size > 1 ? ` channel ${ch + 1}` : ''}`
      sources.push({ label, notes, avgPitch: notes.reduce((s, n) => s + n.note, 0) / notes.length })
    }
  })

  const lastTick = Math.max(0, ...midi.tracks.flatMap((t) => t.notes.map((n) => n.tick + n.duration)))
  const maxRows = MAX_PATTERNS * PATTERN_LENGTH
  const totalRows = Math.min(maxRows, Math.max(PATTERN_LENGTH, Math.ceil(lastTick / ticksPerRow / PATTERN_LENGTH) * PATTERN_LENGTH))
  if (lastTick / ticksPerRow > maxRows) lines.push(`The file is longer than ${MAX_PATTERNS} patterns, so the end was cut.`)

  // The three busiest melodic parts, assigned high to low: lead, harmony, bass.
  const chosen = sources.slice().sort((a, b) => b.notes.length - a.notes.length).slice(0, 3)
  const byPitch = chosen.slice().sort((a, b) => b.avgPitch - a.avgPitch)
  const instruments = [I.lead, I.echo, I.bass, I.kick, I.snare, I.hat, I.openHat]
  const kit = { kick: 3, snare: 4, hat: 5, open: 6 }
  const channels: Cell[][] = [0, 1, 2].map(() => Array(totalRows).fill(EMPTY_CELL))

  if (byPitch.length === 1) {
    // One part (a piano piece, say): melody on top, bass line from its lowest notes.
    channels[0] = monophonic(byPitch[0].notes, totalRows, ticksPerRow, 'high', 0)
    channels[2] = monophonic(byPitch[0].notes, totalRows, ticksPerRow, 'low', 2)
    lines.push(`Melody and bass both come from ${byPitch[0].label}.`)
  } else {
    const targets = byPitch.length === 2 ? [0, 2] : [0, 1, 2]
    byPitch.forEach((src, k) => {
      const ch = targets[k]
      channels[ch] = monophonic(src.notes, totalRows, ticksPerRow, ch === 2 ? 'low' : 'high', ch)
      lines.push(`${['Melody', 'Harmony', 'Bass'][ch]} comes from ${src.label}.`)
    })
  }
  const skipped = sources.length - chosen.length
  if (skipped > 0) lines.push(`${skipped} quieter ${skipped === 1 ? 'part was' : 'parts were'} left out: the chip has three melodic channels.`)
  channels[3] = drums(drumNotes, totalRows, ticksPerRow, kit)
  if (drumNotes.length) lines.push('Drums come from MIDI channel 10.')
  if (!sources.length && !drumNotes.length) lines.push('The file has no notes.')
  lines.push('Chords were reduced to one note per channel; overlapping notes keep the highest (or lowest, for bass).')

  // Cut into patterns; identical patterns are stored once and repeated in the order.
  const patterns: Pattern[] = []
  const keys = new Map<string, number>()
  const order: number[] = []
  for (let start = 0; start < totalRows; start += PATTERN_LENGTH) {
    const pattern = { channels: channels.map((cells) => cells.slice(start, start + PATTERN_LENGTH)) }
    const key = JSON.stringify(pattern)
    let index = keys.get(key)
    if (index === undefined) {
      index = patterns.length
      patterns.push(pattern)
      keys.set(key, index)
    }
    order.push(index)
  }
  if (!patterns.length) patterns.push(emptyPattern(PATTERN_LENGTH))

  const bpm = Math.round(Math.min(300, Math.max(30, 60_000_000 / midi.tempo)))
  const song: Song = {
    version: SONG_VERSION,
    title,
    bpm,
    speed: 6,
    rowsPerBeat: ROWS_PER_BEAT,
    patternLength: PATTERN_LENGTH,
    instruments: structuredClone(instruments),
    patterns,
    order: order.length ? order : [0],
    loopPoint: 0,
  }
  return { song, report: { title, lines } }
}
