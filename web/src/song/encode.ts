// Song → chipcore binary format (see core/src/tracker.rs, "Binary format").

import { CHANNEL_COUNT, NOTE_OFF, NOTE_RELEASE, type Macro, type Song } from './model'

const MAGIC = [0x43, 0x46, 0x53] // "CFS"
const VERSION = 1
const NONE = 255

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)))

export function encodeSong(song: Song): Uint8Array<ArrayBuffer> {
  const rows = song.patternLength
  const macroBytes = (m: Macro) => 3 + Math.min(m.values.length, 255)
  const instrumentBytes = song.instruments
    .slice(0, 64)
    .reduce((n, i) => n + macroBytes(i.volume) + macroBytes(i.duty) + macroBytes(i.pitch) + macroBytes(i.arpeggio), 0)
  const size = 18 + song.order.length * 2 + instrumentBytes + song.patterns.length * rows * CHANNEL_COUNT * 5
  const bytes = new Uint8Array(size)
  const view = new DataView(bytes.buffer)
  let o = 0
  const u8 = (v: number) => (bytes[o++] = v & 0xff)
  const u16 = (v: number) => {
    view.setUint16(o, v, true)
    o += 2
  }

  MAGIC.forEach(u8)
  u8(VERSION)
  u16(clampInt(song.bpm, 30, 300))
  u8(clampInt(song.speed, 1, 31))
  u8(clampInt(song.rowsPerBeat, 1, 255))
  u16(rows)
  u16(song.patterns.length)
  u16(song.order.length)
  u16(clampInt(song.loopPoint, 0, song.order.length - 1))
  u8(Math.min(song.instruments.length, 64))
  u8(0)
  for (const p of song.order) u16(p)

  for (const inst of song.instruments.slice(0, 64)) {
    for (const m of [inst.volume, inst.duty, inst.pitch, inst.arpeggio]) {
      const values = m.values.slice(0, 255)
      u8(values.length)
      u8(m.loop ?? NONE)
      u8(m.release ?? NONE)
      for (const v of values) u8(clampInt(v, -128, 127))
    }
  }

  for (const pattern of song.patterns) {
    for (let row = 0; row < rows; row++) {
      for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
        const c = pattern.channels[ch][row]
        u8(c.note === null ? 255 : c.note === NOTE_OFF ? 254 : c.note === NOTE_RELEASE ? 253 : clampInt(c.note, 0, 127))
        u8(c.instrument ?? NONE)
        u8(c.volume ?? NONE)
        u8(c.effect ? c.effect.charCodeAt(0) : 0)
        u8(c.param)
      }
    }
  }
  return bytes
}
