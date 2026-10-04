// Turns a rendered song into a file: WAV or Ogg Vorbis, either looping (loop points
// for game engines) or with an ending for listening (loop played again, faded out).

import { encodeWav } from '../sfx/wav'
import { withComments } from './ogg'
import type { RenderedSong } from '../audio/chip-wasm'

export type AudioFormat = 'wav' | 'ogg'
export type Ending = 'loop' | 'fade'

export interface ShapedAudio {
  samples: Float32Array
  /** Loop region for engines, when the song loops and `ending` is 'loop'. */
  loop: { start: number; length: number } | null
}

const MAX_FADE_SECONDS = 8

export function shapeAudio(r: RenderedSong, sampleRate: number, ending: Ending): ShapedAudio {
  const loopLength = r.samples.length - r.loopStart
  if (!r.looped || loopLength <= 0) return { samples: r.samples, loop: null }
  if (ending === 'loop') return { samples: r.samples, loop: { start: r.loopStart, length: loopLength } }

  // Play the looping part once more, fading out over its end.
  const fade = Math.min(loopLength, Math.round(MAX_FADE_SECONDS * sampleRate))
  const out = new Float32Array(r.samples.length + loopLength)
  out.set(r.samples)
  out.set(r.samples.subarray(r.loopStart), r.samples.length)
  const fadeStart = out.length - fade
  for (let i = fadeStart; i < out.length; i++) out[i] *= 1 - (i - fadeStart + 1) / fade
  return { samples: out, loop: null }
}

export function wavFile(a: ShapedAudio, sampleRate: number): Uint8Array<ArrayBuffer> {
  return encodeWav(a.samples, sampleRate, a.loop ? { start: a.loop.start, end: a.loop.start + a.loop.length - 1 } : undefined)
}

/** Vorbis-encodes; loop points go in LOOPSTART/LOOPLENGTH comments (in samples). */
export async function oggFile(a: ShapedAudio, sampleRate: number, title: string): Promise<Uint8Array<ArrayBuffer>> {
  const { createOggEncoder } = await import('wasm-media-encoders')
  const encoder = await createOggEncoder()
  encoder.configure({ channels: 1, sampleRate, vbrQuality: 6 })
  const chunks: Uint8Array[] = []
  const block = 1 << 16
  for (let i = 0; i < a.samples.length; i += block) chunks.push(encoder.encode([a.samples.subarray(i, i + block)]).slice())
  chunks.push(encoder.finalize().slice())
  const raw = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0))
  let o = 0
  for (const c of chunks) {
    raw.set(c, o)
    o += c.length
  }
  const comments = [`TITLE=${title}`, 'ENCODER=ChipForge']
  if (a.loop) comments.push(`LOOPSTART=${a.loop.start}`, `LOOPLENGTH=${a.loop.length}`)
  return withComments(raw, comments) ?? raw
}
