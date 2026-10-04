// Standard MIDI File reading and writing (formats 0 and 1), just the parts songs need:
// notes and tempo. Everything else is skipped on read.

export interface MidiNote {
  tick: number
  duration: number
  note: number
  velocity: number
  channel: number
}

export interface MidiTrack {
  name: string
  notes: MidiNote[]
}

export interface MidiFile {
  /** Ticks per quarter note. */
  division: number
  /** Microseconds per quarter note at the start (500000 = 120 BPM). */
  tempo: number
  tracks: MidiTrack[]
}

export class MidiError extends Error {}

class Reader {
  pos = 0
  constructor(private bytes: Uint8Array) {}
  get done() {
    return this.pos >= this.bytes.length
  }
  u8() {
    if (this.pos >= this.bytes.length) throw new MidiError('The file ends unexpectedly.')
    return this.bytes[this.pos++]
  }
  u16() {
    return (this.u8() << 8) | this.u8()
  }
  u32() {
    return ((this.u8() << 24) >>> 0) + (this.u8() << 16) + (this.u8() << 8) + this.u8()
  }
  /** Variable-length quantity. */
  vlq() {
    let v = 0
    for (let i = 0; i < 4; i++) {
      const b = this.u8()
      v = (v << 7) | (b & 0x7f)
      if (!(b & 0x80)) return v
    }
    throw new MidiError('A length in the file is malformed.')
  }
  text(n: number) {
    const s = this.bytes.subarray(this.pos, this.pos + n)
    this.pos += n
    return new TextDecoder('latin1').decode(s)
  }
  skip(n: number) {
    this.pos += n
  }
}

export function parseMidi(bytes: Uint8Array): MidiFile {
  const r = new Reader(bytes)
  if (r.text(4) !== 'MThd') throw new MidiError('This is not a MIDI file.')
  const headerLen = r.u32()
  const format = r.u16()
  const trackCount = r.u16()
  const division = r.u16()
  r.skip(headerLen - 6)
  if (format > 1) throw new MidiError('Only MIDI format 0 and 1 files are supported.')
  if (division & 0x8000) throw new MidiError('MIDI files timed in SMPTE frames are not supported.')

  let tempo = 500_000
  const tracks: MidiTrack[] = []
  for (let t = 0; t < trackCount && !r.done; t++) {
    const id = r.text(4)
    const len = r.u32()
    const end = r.pos + len
    if (id !== 'MTrk') {
      r.skip(len)
      continue
    }
    const track: MidiTrack = { name: '', notes: [] }
    const open = new Map<number, { tick: number; velocity: number }>()
    let tick = 0
    let status = 0
    while (r.pos < end) {
      tick += r.vlq()
      let b = r.u8()
      if (b === 0xff) {
        const type = r.u8()
        const n = r.vlq()
        if (type === 0x03 && !track.name) track.name = r.text(n)
        else if (type === 0x51 && n === 3) {
          const v = (r.u8() << 16) | (r.u8() << 8) | r.u8()
          if (tick === 0 || tempo === 500_000) tempo = v
        } else r.skip(n)
        continue
      }
      if (b === 0xf0 || b === 0xf7) {
        r.skip(r.vlq())
        continue
      }
      // Running status: a data byte reuses the previous status.
      if (b < 0x80) {
        if (!status) throw new MidiError('The file uses running status before any event.')
        r.pos--
        b = status
      } else status = b
      const type = b & 0xf0
      const channel = b & 0x0f
      const d1 = r.u8()
      const d2 = type === 0xc0 || type === 0xd0 ? 0 : r.u8()
      const key = (channel << 8) | d1
      if (type === 0x90 && d2 > 0) {
        // A repeated note-on closes the previous one.
        const prev = open.get(key)
        if (prev) track.notes.push({ tick: prev.tick, duration: tick - prev.tick, note: d1, velocity: prev.velocity, channel })
        open.set(key, { tick, velocity: d2 })
      } else if (type === 0x80 || (type === 0x90 && d2 === 0)) {
        const prev = open.get(key)
        if (prev) {
          track.notes.push({ tick: prev.tick, duration: Math.max(1, tick - prev.tick), note: d1, velocity: prev.velocity, channel })
          open.delete(key)
        }
      }
    }
    r.pos = end
    for (const [key, prev] of open) {
      track.notes.push({ tick: prev.tick, duration: Math.max(1, tick - prev.tick), note: key & 0xff, velocity: prev.velocity, channel: key >> 8 })
    }
    track.notes.sort((a, b) => a.tick - b.tick || b.note - a.note)
    // Tempo-only and empty tracks carry nothing a song can use.
    if (track.notes.length) tracks.push(track)
  }
  return { division, tempo, tracks }
}

/** Writes a format 1 file: a tempo track, then one track per entry. */
export function writeMidi(file: MidiFile): Uint8Array<ArrayBuffer> {
  const out: number[] = []
  const u32 = (v: number) => out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255)
  const u16 = (v: number) => out.push((v >>> 8) & 255, v & 255)
  const vlq = (v: number, into: number[]) => {
    const bytes = [v & 0x7f]
    while ((v >>>= 7)) bytes.unshift((v & 0x7f) | 0x80)
    into.push(...bytes)
  }
  const chunk = (body: number[]) => {
    out.push(...[...'MTrk'].map((c) => c.charCodeAt(0)))
    u32(body.length)
    out.push(...body)
  }

  out.push(...[...'MThd'].map((c) => c.charCodeAt(0)))
  u32(6)
  u16(1)
  u16(file.tracks.length + 1)
  u16(file.division)

  chunk([0x00, 0xff, 0x51, 0x03, (file.tempo >> 16) & 255, (file.tempo >> 8) & 255, file.tempo & 255, 0x00, 0xff, 0x2f, 0x00])

  for (const track of file.tracks) {
    const events: { tick: number; bytes: number[] }[] = []
    for (const n of track.notes) {
      events.push({ tick: n.tick, bytes: [0x90 | n.channel, n.note, n.velocity] })
      events.push({ tick: n.tick + n.duration, bytes: [0x80 | n.channel, n.note, 0] })
    }
    // Note-offs before note-ons at the same tick, so repeated notes retrigger.
    events.sort((a, b) => a.tick - b.tick || (a.bytes[0] & 0xf0) - (b.bytes[0] & 0xf0))
    const body: number[] = []
    const name = [...new TextEncoder().encode(track.name)]
    body.push(0x00, 0xff, 0x03)
    vlq(name.length, body)
    body.push(...name)
    let last = 0
    for (const e of events) {
      vlq(e.tick - last, body)
      body.push(...e.bytes)
      last = e.tick
    }
    body.push(0x00, 0xff, 0x2f, 0x00)
    chunk(body)
  }
  return new Uint8Array(out)
}
