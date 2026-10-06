// Songs ↔ MIDI. Export writes what the song plays (effects are not representable);
// import squeezes any MIDI file onto the chip's four channels.

import { segments } from '../lib/grid'
import { EMPTY_CELL, SONG_VERSION, type Cell, type Song } from '../song/model'
import { drumRows, monophonic, splitIntoPatterns, type DrumKind, type RowNote } from '../song/voices'
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

const toRows = (notes: MidiNote[], ticksPerRow: number): RowNote[] =>
  notes.map((n) => ({
    start: Math.round(n.tick / ticksPerRow),
    end: Math.round((n.tick + n.duration) / ticksPerRow),
    pitch: n.note,
    level: n.velocity >= 112 ? undefined : n.velocity / 127,
  }))

/** General MIDI drum note → our kit. */
function gmKind(gm: number): DrumKind {
  if (gm === 35 || gm === 36 || (gm >= 41 && gm <= 50 && ![42, 44, 46, 49].includes(gm))) return 'kick'
  if ([37, 38, 39, 40].includes(gm)) return 'snare'
  if ([42, 44].includes(gm)) return 'hat'
  if ([46, 49, 51, 52, 55, 57, 59].includes(gm)) return 'open'
  return 'snare'
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
  const kit: Record<DrumKind, number> = { kick: 3, snare: 4, hat: 5, open: 6 }
  const channels: Cell[][] = [0, 1, 2].map(() => Array(totalRows).fill(EMPTY_CELL))

  if (byPitch.length === 1) {
    // One part (a piano piece, say): melody on top, bass line from its lowest notes.
    channels[0] = monophonic(toRows(byPitch[0].notes, ticksPerRow), totalRows, 'high', 0)
    channels[2] = monophonic(toRows(byPitch[0].notes, ticksPerRow), totalRows, 'low', 2)
    lines.push(`Melody and bass both come from ${byPitch[0].label}.`)
  } else {
    const targets = byPitch.length === 2 ? [0, 2] : [0, 1, 2]
    byPitch.forEach((src, k) => {
      const ch = targets[k]
      channels[ch] = monophonic(toRows(src.notes, ticksPerRow), totalRows, ch === 2 ? 'low' : 'high', ch)
      lines.push(`${['Melody', 'Harmony', 'Bass'][ch]} comes from ${src.label}.`)
    })
  }
  const skipped = sources.length - chosen.length
  if (skipped > 0) lines.push(`${skipped} quieter ${skipped === 1 ? 'part was' : 'parts were'} left out: the chip has three melodic channels.`)
  channels[3] = drumRows(drumNotes.map((n) => ({ row: Math.round(n.tick / ticksPerRow), kind: gmKind(n.note) })), totalRows, kit)
  if (drumNotes.length) lines.push('Drums come from MIDI channel 10.')
  if (!sources.length && !drumNotes.length) lines.push('The file has no notes.')
  lines.push('Chords were reduced to one note per channel; overlapping notes keep the highest (or lowest, for bass).')

  const { patterns, order } = splitIntoPatterns(channels, PATTERN_LENGTH)

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
    order,
    loopPoint: 0,
  }
  return { song, report: { title, lines } }
}
