// Adds Vorbis comments (e.g. LOOPSTART / LOOPLENGTH, which Godot, RPG Maker and many
// players read) to an Ogg Vorbis stream. The encoder can't write comments, so this
// rebuilds the header pages and renumbers the audio pages after them.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
    t[i] = r >>> 0
  }
  return t
})()

export function oggCrc(bytes: Uint8Array): number {
  let crc = 0
  for (const b of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ b) & 0xff]) >>> 0
  return crc
}

interface Page {
  headerType: number
  granule: Uint8Array
  serial: number
  segments: number[]
  body: Uint8Array
}

export function readPages(bytes: Uint8Array): Page[] {
  const pages: Page[] = []
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let pos = 0
  while (pos + 27 <= bytes.length) {
    if (bytes[pos] !== 0x4f || bytes[pos + 1] !== 0x67 || bytes[pos + 2] !== 0x67 || bytes[pos + 3] !== 0x53) {
      throw new Error('Not an Ogg stream')
    }
    const n = bytes[pos + 26]
    const segments = [...bytes.subarray(pos + 27, pos + 27 + n)]
    const len = segments.reduce((s, x) => s + x, 0)
    const start = pos + 27 + n
    pages.push({
      headerType: bytes[pos + 5],
      granule: bytes.slice(pos + 6, pos + 14),
      serial: view.getUint32(pos + 14, true),
      segments,
      body: bytes.slice(start, start + len),
    })
    pos = start + len
  }
  return pages
}

function writePage(p: Page, sequence: number): Uint8Array {
  const out = new Uint8Array(27 + p.segments.length + p.body.length)
  const view = new DataView(out.buffer)
  out.set([0x4f, 0x67, 0x67, 0x53, 0, p.headerType])
  out.set(p.granule, 6)
  view.setUint32(14, p.serial, true)
  view.setUint32(18, sequence, true)
  out[26] = p.segments.length
  out.set(p.segments, 27)
  out.set(p.body, 27 + p.segments.length)
  view.setUint32(22, oggCrc(out), true)
  return out
}

/**
 * Splits the first `count` packets out of the pages; returns them and the page index
 * after. With `boundary`, the last packet must also end its page.
 */
function headerPackets(pages: Page[], count: number, boundary = true): { packets: Uint8Array[]; nextPage: number } | null {
  const packets: Uint8Array[] = []
  let current: number[] = []
  for (let p = 0; p < pages.length; p++) {
    let offset = 0
    for (const seg of pages[p].segments) {
      current.push(...pages[p].body.subarray(offset, offset + seg))
      offset += seg
      if (seg < 255) {
        packets.push(Uint8Array.from(current))
        current = []
        if (packets.length === count) {
          // Audio must start on a fresh page for the headers to be swappable.
          return !boundary || offset === pages[p].body.length ? { packets, nextPage: p + 1 } : null
        }
      }
    }
  }
  return null
}

function lace(packets: Uint8Array[], serial: number): Page[] {
  const pages: Page[] = []
  let segments: number[] = []
  let body: number[] = []
  let continued = false
  const flush = (nextContinues: boolean) => {
    pages.push({ headerType: continued ? 1 : 0, granule: new Uint8Array(8), serial, segments, body: Uint8Array.from(body) })
    segments = []
    body = []
    continued = nextContinues
  }
  for (const packet of packets) {
    let left = packet.length
    let offset = 0
    while (true) {
      const seg = Math.min(255, left)
      if (segments.length === 255) flush(true)
      segments.push(seg)
      body.push(...packet.subarray(offset, offset + seg))
      offset += seg
      left -= seg
      if (seg < 255) break
    }
  }
  if (segments.length) flush(false)
  return pages
}

function commentPacket(vendor: Uint8Array, comments: string[]): Uint8Array {
  const enc = new TextEncoder()
  const items = comments.map((c) => enc.encode(c))
  const size = 7 + 4 + vendor.length + 4 + items.reduce((s, i) => s + 4 + i.length, 0) + 1
  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  out.set([3, ...enc.encode('vorbis')])
  let o = 7
  view.setUint32(o, vendor.length, true)
  out.set(vendor, o + 4)
  o += 4 + vendor.length
  view.setUint32(o, items.length, true)
  o += 4
  for (const i of items) {
    view.setUint32(o, i.length, true)
    out.set(i, o + 4)
    o += 4 + i.length
  }
  out[o] = 1 // framing bit
  return out
}

/** Reads the KEY=value comments of a Vorbis stream (for tests and checks). */
export function readComments(bytes: Uint8Array): string[] {
  const found = headerPackets(readPages(bytes), 2, false)
  if (!found) return []
  const c = found.packets[1]
  const view = new DataView(c.buffer, c.byteOffset, c.byteLength)
  let o = 7
  o += 4 + view.getUint32(o, true)
  const n = view.getUint32(o, true)
  o += 4
  const dec = new TextDecoder()
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const len = view.getUint32(o, true)
    out.push(dec.decode(c.subarray(o + 4, o + 4 + len)))
    o += 4 + len
  }
  return out
}

/**
 * Returns the stream with `comments` (KEY=value) in its comment header, or null if
 * the stream's layout doesn't allow it (then use it untagged).
 */
export function withComments(ogg: Uint8Array, comments: string[]): Uint8Array<ArrayBuffer> | null {
  const pages = readPages(ogg)
  const headers = headerPackets(pages, 3)
  if (!pages.length || !headers) return null
  const [id, oldComment, setup] = headers.packets
  const view = new DataView(oldComment.buffer, oldComment.byteOffset, oldComment.byteLength)
  const vendor = oldComment.slice(11, 11 + view.getUint32(7, true))
  const serial = pages[0].serial

  const out: Uint8Array[] = []
  let sequence = 0
  out.push(writePage({ ...pages[0], headerType: 2, segments: lace([id], serial)[0].segments, body: id }, sequence++))
  for (const p of lace([commentPacket(vendor, comments), setup], serial)) out.push(writePage(p, sequence++))
  for (const p of pages.slice(headers.nextPage)) out.push(writePage(p, sequence++))

  const total = out.reduce((s, p) => s + p.length, 0)
  const result = new Uint8Array(total)
  let o = 0
  for (const p of out) {
    result.set(p, o)
    o += p.length
  }
  return result
}
