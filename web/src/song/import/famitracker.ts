// FamiTracker text import (File → Export Text in FamiTracker 0.4.x, Dn-FamiTracker and
// 0CC-FamiTracker). The 2A03's pulse, pulse, triangle and noise columns map onto
// ChipForge's channels one to one: notes, instruments, volumes, effects and macros.
// What doesn't fit (the DPCM channel, expansion chips, extra effect columns, effects
// ChipForge doesn't have) is left out and listed in the report.

import { EFFECTS, EMPTY_CELL, LIMITS, NOTE_OFF, NOTE_RELEASE, SONG_VERSION, emptyMacro, type Cell, type Instrument, type Macro, type Song } from '../model'
import type { ImportReport } from '../../midi/convert'

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const TRIANGLE = 2
const NOISE = 3
/** FamiTracker macro types: volume, arpeggio, pitch, hi-pitch, duty. */
const MACRO_KIND = ['volume', 'arpeggio', 'pitch', null, 'duty'] as const

export class FamiTrackerError extends Error {}

/** FamiTracker's tempo for a song: its rows go at the same speed as ChipForge's. */
export function famiTempo(bpm: number, speed: number): number {
  return Math.round((bpm * speed) / 6)
}

/** ChipForge's BPM for a FamiTracker tempo and speed (the inverse of `famiTempo`). */
export function chipBpm(tempo: number, speed: number): number {
  return Math.round((6 * tempo) / Math.max(1, speed))
}

/** Splits on whitespace, keeping "quoted strings" whole (without the quotes). */
function words(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2])
}

function parseNote(text: string, channel: number): number | null | undefined {
  if (text === '...') return null
  if (text === '---') return NOTE_OFF
  if (text === '===') return NOTE_RELEASE
  if (channel === NOISE) {
    const m = /^([0-9A-F])-#$/i.exec(text)
    return m ? parseInt(m[1], 16) : undefined
  }
  const m = /^([A-G])([-#b])(\d)$/.exec(text)
  if (!m) return undefined
  const sharp = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  const written = (Number(m[3]) + 1) * 12 + NAMES[m[1]] + sharp
  // FamiTracker's triangle sounds an octave below its written note; ChipForge's doesn't.
  return Math.min(127, Math.max(0, channel === TRIANGLE ? written - 12 : written))
}

const hexOrNull = (text: string) => (/^\.+$/.test(text) ? null : parseInt(text, 16))

export function famiTrackerToSong(text: string, fallbackTitle: string): { song: Song; report: ImportReport } {
  const lines = text.split(/\r?\n/)
  if (!lines.some((l) => /^\s*TRACK\s/.test(l)) || !lines.some((l) => /^\s*ROW\s/.test(l))) {
    throw new FamiTrackerError("That isn't a FamiTracker text export (File → Export Text in FamiTracker).")
  }
  const report: string[] = []
  const dropped = new Map<string, number>()
  const drop = (what: string) => dropped.set(what, (dropped.get(what) ?? 0) + 1)

  let title = fallbackTitle
  let expansion = 0
  const macros = new Map<string, Macro>()
  const instruments: Instrument[] = []
  let track: { rows: number; speed: number; tempo: number; name: string } | null = null
  let tracks = 0
  let effectColumns: number[] = []
  const orders: number[][] = []
  const patterns = new Map<number, string[][]>()
  let current: string[][] | null = null

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const w = words(line)
    switch (w[0]) {
      case 'TITLE':
        if (w[1]) title = w[1]
        break
      case 'EXPANSION':
        expansion = Number(w[1]) || 0
        break
      case 'MACRO': {
        // MACRO type id loop release setting : values
        const [type, id, loop, release, setting] = w.slice(1, 6).map(Number)
        const values = line.split(':')[1]?.trim().split(/\s+/).filter(Boolean).map(Number) ?? []
        if (type === 1 && setting !== 0) drop('arpeggio macros in fixed or relative mode (played as absolute)')
        if (type === 3) drop('hi-pitch macros')
        macros.set(`${type}:${id}`, {
          values: values.slice(0, LIMITS.macroLength),
          loop: loop >= 0 && loop < values.length ? loop : null,
          release: release >= 0 && release < values.length ? release : null,
        })
        break
      }
      case 'INST2A03': {
        // INST2A03 index vol arp pitch hipitch duty "name"
        const [index, ...ids] = w.slice(1, 7).map(Number)
        if (index >= LIMITS.instruments) break
        const macro = (type: number) => (ids[type] >= 0 ? structuredClone(macros.get(`${type}:${ids[type]}`) ?? emptyMacro()) : emptyMacro())
        while (instruments.length < index) instruments.push(blankInstrument(instruments.length))
        instruments[index] = {
          name: w[7] || `Instrument ${index}`,
          volume: macro(0),
          arpeggio: macro(1),
          pitch: macro(2),
          duty: macro(4),
        }
        break
      }
      case 'INSTVRC6':
      case 'INSTVRC7':
      case 'INSTFDS':
      case 'INSTN163':
      case 'INSTS5B':
        drop('expansion-chip instruments')
        break
      case 'TRACK':
        tracks++
        if (track) {
          current = null
          break
        }
        // TRACK rows speed tempo "name"
        track = { rows: Number(w[1]) || 64, speed: Number(w[2]) || 6, tempo: Number(w[3]) || 150, name: w[4] ?? '' }
        break
      case 'COLUMNS':
        if (tracks === 1) effectColumns = line.split(':')[1].trim().split(/\s+/).map(Number)
        break
      case 'ORDER':
        if (tracks === 1) orders.push(line.split(':')[1].trim().split(/\s+/).map((h) => parseInt(h, 16)))
        break
      case 'PATTERN':
        current = tracks === 1 ? [] : null
        if (current) patterns.set(parseInt(w[1], 16), current)
        break
      case 'ROW':
        current?.push(line.split(':').slice(1).map((c) => c.trim()))
        break
    }
  }
  if (!track || !orders.length) throw new FamiTrackerError('The FamiTracker file has no song in it.')
  if (tracks > 1) report.push(`The file has ${tracks} songs; this is the first, "${track.name || 'untitled'}".`)
  if (expansion) report.push('The song uses an expansion chip; only its 2A03 channels came over.')

  const length = Math.min(LIMITS.patternLength[1], Math.max(LIMITS.patternLength[0], track.rows))
  const cellAt = (column: string | undefined, channel: number): Cell => {
    if (!column) return EMPTY_CELL
    const parts = column.split(/\s+/)
    const note = parseNote(parts[0], channel)
    if (note === undefined) drop(`unreadable notes (${parts[0]})`)
    const instrument = hexOrNull(parts[1] ?? '..')
    const volume = hexOrNull(parts[2] ?? '.')
    // One effect column: the first effect ChipForge has.
    let effect: string | null = null
    let param = 0
    for (const fx of parts.slice(3)) {
      if (/^\.+$/.test(fx)) continue
      const letter = fx[0].toUpperCase()
      if (effect === null && (EFFECTS as readonly string[]).includes(letter)) {
        effect = letter
        param = parseInt(fx.slice(1), 16) || 0
        // FamiTracker's Fxx tempo is in its own units.
        if (letter === 'F' && param >= 0x20) param = Math.min(0xff, Math.max(0x20, chipBpm(param, track!.speed)))
      } else drop(effect === null ? `${letter}xx effects` : 'second effect columns')
    }
    if (note === null && instrument === null && volume === null && effect === null) return EMPTY_CELL
    return {
      note: note ?? null,
      instrument: note !== null && note !== undefined && note >= 0 ? (instrument ?? null) : null,
      volume: volume === null ? null : Math.min(15, volume),
      effect,
      param,
    }
  }

  // FamiTracker orders choose a pattern per channel; ChipForge's choose one for all
  // four, so each distinct combination becomes one ChipForge pattern.
  const combos = new Map<string, number>()
  const songPatterns: Song['patterns'] = []
  const order: number[] = []
  if (orders.some((o) => o[4] !== undefined && patterns.get(o[4])?.some((r) => r[4] && !/^\.\.\./.test(r[4])))) {
    report.push('The DPCM (sample) channel was left out: the chip version has no samples.')
  }
  for (const o of orders.slice(0, LIMITS.order)) {
    const key = o.slice(0, 4).join(',')
    let index = combos.get(key)
    if (index === undefined) {
      if (songPatterns.length >= LIMITS.patterns) break
      index = songPatterns.length
      combos.set(key, index)
      songPatterns.push({
        channels: [0, 1, 2, 3].map((ch) => {
          const rows = patterns.get(o[ch]) ?? []
          return Array.from({ length }, (_, r) => cellAt(rows[r]?.[ch], ch))
        }),
      })
    }
    order.push(index)
  }
  if (orders.length > order.length) report.push(`The song is longer than ${order.length} parts, so the end was cut.`)

  while (instruments.length === 0 || instruments.some((i) => !i)) {
    const gap = instruments.findIndex((i) => !i)
    if (gap >= 0) instruments[gap] = blankInstrument(gap)
    else instruments.push(blankInstrument(0))
  }

  const bpm = Math.min(LIMITS.bpm[1], Math.max(LIMITS.bpm[0], chipBpm(track.tempo, track.speed)))
  const song: Song = {
    version: SONG_VERSION,
    title: track.name && tracks > 1 ? `${title} - ${track.name}` : title,
    bpm,
    speed: Math.min(LIMITS.speed[1], Math.max(LIMITS.speed[0], track.speed)),
    rowsPerBeat: 4,
    patternLength: length,
    instruments: instruments.slice(0, LIMITS.instruments),
    patterns: songPatterns,
    order,
    loopPoint: 0,
  }
  report.unshift(
    `Opened ${order.length} parts, ${songPatterns.length} patterns and ${song.instruments.length} instruments at ${bpm} BPM, speed ${song.speed}.`,
  )
  for (const [what, count] of dropped) report.push(`Left out ${count} ${what}.`)
  if (macros.size && [...macros.keys()].some((k) => k.startsWith('2:'))) {
    report.push('Pitch macros use different units in FamiTracker, so bends may sound a little different.')
  }
  return { song, report: { title: song.title, lines: report } }
}

function blankInstrument(index: number): Instrument {
  return { name: `Instrument ${index}`, volume: emptyMacro(), duty: emptyMacro(), pitch: emptyMacro(), arpeggio: emptyMacro() }
}
