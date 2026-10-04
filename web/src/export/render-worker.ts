// Renders and encodes songs off the main thread so the page stays responsive.

import { instantiateChip, renderSong } from '../audio/chip-wasm'
import { oggFile, shapeAudio, wavFile, type AudioFormat, type Ending } from './audio'

export interface RenderRequest {
  module: WebAssembly.Module
  song: Uint8Array
  title: string
  sampleRate: number
  format: AudioFormat
  ending: Ending
}

export type RenderResponse =
  | { ok: true; bytes: Uint8Array<ArrayBuffer>; seconds: number; looped: boolean; loopStartSeconds: number | null }
  | { ok: false; error: string }

self.onmessage = async (e: MessageEvent<RenderRequest>) => {
  const { module, song, title, sampleRate, format, ending } = e.data
  try {
    const wasm = await instantiateChip(module)
    const rendered = renderSong(wasm, song, sampleRate)
    if (!rendered) throw new Error('The song could not be read for rendering.')
    const shaped = shapeAudio(rendered, sampleRate, ending)
    const bytes = format === 'wav' ? wavFile(shaped, sampleRate) : await oggFile(shaped, sampleRate, title)
    const reply: RenderResponse = {
      ok: true,
      bytes,
      seconds: shaped.samples.length / sampleRate,
      looped: rendered.looped,
      loopStartSeconds: shaped.loop ? shaped.loop.start / sampleRate : null,
    }
    postMessage(reply, { transfer: [bytes.buffer] })
  } catch (err) {
    postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) } satisfies RenderResponse)
  }
}
