// Turns a rendered song into a file: WAV or Ogg Vorbis, either looping (loop points
// for game engines) or with an ending for listening (loop played again, faded out).

import { encodeWav } from '../sfx/wav'
import { withComments } from './ogg'
import oggWasmUrl from 'wasm-media-encoders/wasm/ogg?url'
// A static import, so bundling keeps only createEncoder (not the inlined MP3 encoder).
import { createEncoder } from 'wasm-media-encoders'
import type { RenderedSong } from '../audio/chip-wasm'

export type AudioFormat = 'wav' | 'ogg'
/** Loop points for engines, a faded ending, or a fixed length (for video). */
export type Ending = 'loop' | 'fade' | 'length'

export interface ShapedAudio {
  samples: Float32Array
  /** Loop region for engines, when the song loops and `ending` is 'loop'. */
  loop: { start: number; length: number } | null
}

const MAX_FADE_SECONDS = 8
/** The longest track Fit to length makes. */
export const MAX_LENGTH_SECONDS = 20 * 60

/**
 * `seconds` long exactly: the song, then its looping part (or the whole song, if it
 * doesn't loop) again and again, fading out over the last few seconds.
 */
export function fitToLength(r: RenderedSong, sampleRate: number, seconds: number): Float32Array {
  const total = Math.round(Math.min(MAX_LENGTH_SECONDS, Math.max(1, seconds)) * sampleRate)
  const out = new Float32Array(total)
  const start = r.looped ? r.loopStart : 0
  const loop = r.samples.subarray(start)
  out.set(r.samples.subarray(0, total))
  for (let at = r.samples.length; at < total && loop.length; at += loop.length) out.set(loop.subarray(0, total - at), at)
  // Fade over the last 4 seconds, or a fifth of a short track.
  const fade = Math.min(Math.round(4 * sampleRate), Math.round(total / 5))
  for (let i = total - fade; i < total; i++) out[i] *= (total - i) / fade
  return out
}

export function shapeAudio(r: RenderedSong, sampleRate: number, ending: Ending, seconds = 0): ShapedAudio {
  if (ending === 'length') return { samples: fitToLength(r, sampleRate, seconds), loop: null }
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

/**
 * Vorbis-encodes; loop points go in LOOPSTART/LOOPLENGTH comments (in samples).
 * `wasm` is the Ogg encoder binary (its URL by default; tests pass the bytes). Only
 * this encoder is loaded: the package's helpers would also bundle its MP3 encoder.
 */
export async function oggFile(
  a: ShapedAudio,
  sampleRate: number,
  title: string,
  wasm: string | ArrayBuffer | Uint8Array = oggWasmUrl,
): Promise<Uint8Array<ArrayBuffer>> {
  const encoder = await createEncoder('audio/ogg', wasm)
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
