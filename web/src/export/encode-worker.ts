// Encodes audio for download off the main thread, optionally running the Lo-fi Filter first.

import { lofiRender, type LofiParams } from '../convert/lofi'
import { oggFile, wavFile, type AudioFormat } from './audio'

export interface EncodeRequest {
  samples: Float32Array
  sampleRate: number
  format: AudioFormat
  title: string
  lofi?: LofiParams
}

export type EncodeResponse = { ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false; error: string }

self.onmessage = async (e: MessageEvent<EncodeRequest>) => {
  const { samples, sampleRate, format, title, lofi } = e.data
  try {
    const audio = { samples: lofi ? lofiRender(samples, sampleRate, lofi) : samples, loop: null }
    const bytes = format === 'wav' ? wavFile(audio, sampleRate) : await oggFile(audio, sampleRate, title)
    postMessage({ ok: true, bytes } satisfies EncodeResponse, { transfer: [bytes.buffer] })
  } catch (err) {
    postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) } satisfies EncodeResponse)
  }
}
