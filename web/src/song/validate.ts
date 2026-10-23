// Checks songs read from storage or files, so a corrupt save can't crash the editor.

import { CHANNEL_COUNT, EFFECTS, EMPTY_CELL, LIMITS, SONG_VERSION, type Cell, type Instrument, type Macro, type Song } from './model'
import { isScaleName, type SongKey } from './scales'

const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi
const optInt = (v: unknown, lo: number, hi: number) => (v === null ? null : isInt(v, lo, hi) ? v : undefined)

function macroOf(x: unknown): Macro | null {
  if (typeof x !== 'object' || x === null) return null
  const m = x as Record<string, unknown>
  if (!Array.isArray(m.values) || m.values.length > LIMITS.macroLength || !m.values.every((v) => isInt(v, -128, 127))) return null
  const loop = optInt(m.loop ?? null, 0, 254)
  const release = optInt(m.release ?? null, 0, 254)
  if (loop === undefined || release === undefined) return null
  return { values: m.values as number[], loop, release }
}

function instrumentOf(x: unknown): Instrument | null {
  if (typeof x !== 'object' || x === null) return null
  const i = x as Record<string, unknown>
  const [volume, duty, pitch, arpeggio] = [i.volume, i.duty, i.pitch, i.arpeggio].map(macroOf)
  if (!volume || !duty || !pitch || !arpeggio || typeof i.name !== 'string') return null
  return { name: i.name, volume, duty, pitch, arpeggio }
}

function cellOf(x: unknown): Cell | null {
  if (typeof x !== 'object' || x === null) return null
  const c = x as Record<string, unknown>
  const note = optInt(c.note ?? null, -2, 127)
  const instrument = optInt(c.instrument ?? null, 0, 254)
  const volume = optInt(c.volume ?? null, 0, 15)
  const effect = c.effect ?? null
  const param = c.param ?? 0
  if (note === undefined || instrument === undefined || volume === undefined) return null
  if (effect !== null && !(EFFECTS as readonly unknown[]).includes(effect)) return null
  if (!isInt(param, 0, 255)) return null
  if (note === null && instrument === null && volume === null && effect === null) return EMPTY_CELL
  return { note, instrument, volume, effect: effect as string | null, param }
}

/** A song's key, or undefined if it has none (or a damaged one, which is just dropped). */
function keyOf(x: unknown): SongKey | undefined {
  const k = x as { root?: unknown; scale?: unknown } | null
  return k && isInt(k.root, 0, 11) && isScaleName(k.scale) ? { root: k.root, scale: k.scale } : undefined
}

/** A valid Song built from untrusted data, or null. */
export function validateSong(x: unknown): Song | null {
  if (typeof x !== 'object' || x === null) return null
  const s = x as Record<string, unknown>
  if (s.version !== SONG_VERSION || typeof s.title !== 'string') return null
  if (s.chip !== undefined && s.chip !== 'nes' && s.chip !== 'gb') return null
  if (!isInt(s.bpm, ...LIMITS.bpm) || !isInt(s.speed, ...LIMITS.speed) || !isInt(s.rowsPerBeat, 1, 32)) return null
  if (!isInt(s.patternLength, ...LIMITS.patternLength)) return null
  const rows = s.patternLength
  if (!Array.isArray(s.instruments) || s.instruments.length > LIMITS.instruments) return null
  if (!Array.isArray(s.patterns) || s.patterns.length === 0 || s.patterns.length > LIMITS.patterns) return null
  if (!Array.isArray(s.order) || s.order.length === 0 || s.order.length > LIMITS.order) return null

  const instruments = s.instruments.map(instrumentOf)
  if (instruments.some((i) => !i)) return null
  const patterns = []
  for (const p of s.patterns as unknown[]) {
    const channels = (p as { channels?: unknown })?.channels
    if (!Array.isArray(channels) || channels.length !== CHANNEL_COUNT) return null
    const parsed = channels.map((cells) => (Array.isArray(cells) && cells.length === rows ? cells.map(cellOf) : null))
    if (parsed.some((cells) => !cells || cells.some((c) => !c))) return null
    patterns.push({ channels: parsed as Cell[][] })
  }
  if (!s.order.every((o) => isInt(o, 0, patterns.length - 1))) return null
  if (!isInt(s.loopPoint, 0, s.order.length - 1)) return null

  return {
    version: SONG_VERSION,
    title: s.title,
    ...(s.chip === 'gb' ? { chip: 'gb' as const } : {}),
    bpm: s.bpm,
    speed: s.speed,
    rowsPerBeat: s.rowsPerBeat,
    patternLength: rows,
    instruments: instruments as Instrument[],
    patterns,
    order: s.order as number[],
    loopPoint: s.loopPoint,
    ...(keyOf(s.key) ? { key: keyOf(s.key)! } : {}),
  }
}
