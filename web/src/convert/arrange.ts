// Transcribed notes + drum hits → a four-channel chip song.

import { PRESET_INSTRUMENTS as I } from '../song/instruments'
import { EMPTY_CELL, SONG_VERSION, type Cell, type Song } from '../song/model'
import { drumRows, monophonic, splitIntoPatterns, type DrumKind, type RowNote } from '../song/voices'
import type { DrumHit } from './drums'
import type { HeardNote } from './transcribe'

export type Detail = 'simple' | 'balanced' | 'detailed'

export interface ArrangeOptions {
  bpm: number
  /** Seconds at which row 0 starts (a beat). */
  origin: number
  detail: Detail
  /** Play chords as fast arpeggios on the second pulse channel. */
  chords: boolean
  drums: boolean
}

const ROWS_PER_BEAT = 4
const PATTERN_LENGTH = 64
const MAX_PATTERNS = 256
/** Notes from G3 down go to the triangle bass. */
const BASS_SPLIT = 55
const LIMITS: Record<Detail, { level: number; rows: number }> = {
  simple: { level: 0.5, rows: 2 },
  balanced: { level: 0.32, rows: 1 },
  detailed: { level: 0.18, rows: 1 },
}

export interface ChipResult {
  song: Song
  lines: string[]
}

/** Second voice: either chord arpeggios (0xy) or the highest note left after the melody. */
function harmony(notes: RowNote[], melody: Cell[], rows: number, chords: boolean): Cell[] {
  const rest = notes.filter((n) => melody[n.start]?.note !== n.pitch)
  if (!chords) return monophonic(rest, rows, 'high', 1)
  const byRow = new Map<number, RowNote[]>()
  for (const n of rest) byRow.set(n.start, [...(byRow.get(n.start) ?? []), n])
  const cells: Cell[] = monophonic(rest, rows, 'high', 1)
  for (const [row, group] of byRow) {
    const pitches = [...new Set(group.map((n) => n.pitch))].sort((a, b) => a - b)
    if (pitches.length < 2) continue
    const root = pitches[0]
    const intervals = pitches.slice(1).map((p) => p - root).filter((i) => i > 0 && i <= 15).slice(0, 2)
    if (!intervals.length) continue
    const [x, y = 0] = intervals
    cells[row] = { ...EMPTY_CELL, note: root, instrument: 1, effect: '0', param: (x << 4) | y }
  }
  return cells
}

/** A note must jump this much (dB) at its own pitch to count as struck again. */
const ATTACK_DB = 4

/** Semitone distances of the first overtones (octave, twelfth, two octaves, …). */
const HARMONICS = new Set([12, 19, 24, 28, 31])

/**
 * Removes the usual transcription artefacts before arranging:
 * - a quieter note at an overtone above a louder one starting with it is that note's
 *   harmonic, not a real note;
 * - in the bass, a quieter note an octave below a louder one is a known octave error
 *   (an octave doubling higher up is usually real, so only the bass is checked);
 * - a pitch re-detected inside a note of the same pitch, or split off right where it
 *   ends without a real attack of its own (the model often splits sustained notes at
 *   drum hits), is that same note. A repeat with a real attack stays.
 */
export function cleanNotes(notes: HeardNote[]): HeardNote[] {
  const continues = (prev: HeardNote, n: HeardNote) => {
    const end = prev.start + prev.duration
    if (n.start < end - 0.05) return true
    // With a measured attack, trust it; without one, a much quieter piece is a tail.
    const noAttack = n.attack !== undefined ? n.attack < ATTACK_DB : n.amplitude < prev.amplitude * 0.75
    return n.start <= end + 0.05 && noAttack
  }
  const together = (a: HeardNote, b: HeardNote) => Math.abs(a.start - b.start) < 0.08
  const isHarmonic = (n: HeardNote, loud: HeardNote) => {
    const up = n.pitch - loud.pitch
    if (HARMONICS.has(up)) return true
    return up === -12 && loud.pitch <= BASS_SPLIT + 12
  }
  const kept = notes.filter((n) => !notes.some((m) => m !== n && m.amplitude > n.amplitude * 1.15 && together(n, m) && isHarmonic(n, m)))
  const merged: HeardNote[] = []
  for (const n of kept.slice().sort((a, b) => a.start - b.start)) {
    const prev = merged.findLast((m) => m.pitch === n.pitch)
    if (prev && continues(prev, n)) {
      prev.duration = Math.max(prev.duration, n.start + n.duration - prev.start)
      prev.amplitude = Math.max(prev.amplitude, n.amplitude)
    } else merged.push({ ...n })
  }
  return merged
}

export function arrangeChip(heard: HeardNote[], hits: DrumHit[], options: ArrangeOptions, title: string): ChipResult {
  const rowSeconds = 60 / options.bpm / ROWS_PER_BEAT
  const limit = LIMITS[options.detail]
  const row = (t: number) => Math.round((t - options.origin) / rowSeconds)
  const notes = cleanNotes(heard)
  const placed: RowNote[] = notes
    .filter((n) => n.amplitude >= limit.level)
    .map((n) => ({ start: row(n.start), end: row(n.start + n.duration), pitch: n.pitch, level: Math.min(1, n.amplitude * 1.4) }))
    .filter((n) => n.start >= 0 && n.end - n.start >= limit.rows)
  const lastRow = Math.max(0, ...placed.map((n) => n.end), ...hits.map((h) => row(h.time) + 1))
  const rows = Math.min(MAX_PATTERNS * PATTERN_LENGTH, Math.max(PATTERN_LENGTH, Math.ceil(lastRow / PATTERN_LENGTH) * PATTERN_LENGTH))

  const high = placed.filter((n) => n.pitch > BASS_SPLIT)
  const low = placed.filter((n) => n.pitch <= BASS_SPLIT)
  const lead = monophonic(high, rows, 'high', 0)
  const second = harmony(high, lead, rows, options.chords)
  const bass = monophonic(low, rows, 'low', 2)
  const kit: Record<DrumKind, number> = { kick: 3, snare: 4, hat: 5, open: 5 }
  const drums = options.drums ? drumRows(hits.map((h) => ({ row: row(h.time), kind: h.kind })), rows, kit) : Array<Cell>(rows).fill(EMPTY_CELL)

  const { patterns, order } = splitIntoPatterns([lead, second, bass, drums], PATTERN_LENGTH)
  const count = (cells: Cell[]) => cells.filter((c) => c.note !== null && c.note >= 0).length
  const lines = [
    `Tempo ${Math.round(options.bpm)} BPM; ${placed.length} of ${heard.length} heard notes kept (${options.detail} detail; overtones and repeats removed).`,
    `Melody ${count(lead)} notes, ${options.chords ? 'chords and harmony' : 'harmony'} ${count(second)}, bass ${count(bass)}${options.drums ? `, drums ${count(drums)} hits` : ''}.`,
  ]
  if (lastRow > rows) lines.push(`The recording is longer than ${MAX_PATTERNS} patterns, so the end was cut.`)

  const song: Song = {
    version: SONG_VERSION,
    title,
    bpm: Math.round(Math.min(300, Math.max(30, options.bpm))),
    speed: 6,
    rowsPerBeat: ROWS_PER_BEAT,
    patternLength: PATTERN_LENGTH,
    instruments: structuredClone([I.lead, options.chords ? I.softLead : I.pluck, I.bass, I.kick, I.snare, I.hat]),
    patterns,
    order,
    loopPoint: 0,
  }
  return { song, lines }
}
