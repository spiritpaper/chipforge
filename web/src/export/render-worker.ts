// Renders and encodes songs off the main thread so the page stays responsive.

import { zipSync } from 'fflate'
import { instantiateChip, renderSong } from '../audio/chip-wasm'
import { oggFile, shapeAudio, wavFile, type AudioFormat, type Ending } from './audio'

export interface RenderRequest {
  module: WebAssembly.Module
  song: Uint8Array
  title: string
  sampleRate: number
  format: AudioFormat
  ending: Ending
  /** For `ending: 'length'`: the track's length in seconds. */
  seconds?: number
  /**
   * Stems: one encoded song per channel. With them, the reply is a zip of the full mix
   * (`<file>.<format>`) and each stem (`<file>-<name>.<format>`), all the same length.
   */
  stems?: { name: string; song: Uint8Array }[]
  /** File name stem for the zip's contents. */
  file?: string
}

export type RenderResponse =
  | { ok: true; bytes: Uint8Array<ArrayBuffer>; seconds: number; looped: boolean; loopStartSeconds: number | null; zip: boolean }
  | { ok: false; error: string }

self.onmessage = async (e: MessageEvent<RenderRequest>) => {
  const { module, song, title, sampleRate, format, ending, seconds = 0, stems, file = 'song' } = e.data
  try {
    const wasm = await instantiateChip(module)
    const encode = async (bytes: Uint8Array, name: string) => {
      const rendered = renderSong(wasm, bytes, sampleRate)
      if (!rendered) throw new Error('The song could not be read for rendering.')
      const shaped = shapeAudio(rendered, sampleRate, ending, seconds)
      const out = format === 'wav' ? wavFile(shaped, sampleRate) : await oggFile(shaped, sampleRate, name)
      return { out, rendered, shaped }
    }
    const mix = await encode(song, title)
    let bytes = mix.out
    if (stems?.length) {
      const files: Record<string, [Uint8Array, { level: 0 }]> = { [`${file}.${format}`]: [mix.out, { level: 0 }] }
      for (const stem of stems) files[`${file}-${stem.name}.${format}`] = [(await encode(stem.song, `${title} (${stem.name})`)).out, { level: 0 }]
      bytes = zipSync(files) as Uint8Array<ArrayBuffer>
    }
    const reply: RenderResponse = {
      ok: true,
      bytes,
      seconds: mix.shaped.samples.length / sampleRate,
      looped: mix.rendered.looped,
      loopStartSeconds: mix.shaped.loop ? mix.shaped.loop.start / sampleRate : null,
      zip: !!stems?.length,
    }
    postMessage(reply, { transfer: [bytes.buffer] })
  } catch (err) {
    postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) } satisfies RenderResponse)
  }
}
