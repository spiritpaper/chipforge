// The Demucs network in ONNX Runtime: the graph shipped with the app, with its weights
// read from the author's own file (tools/demucs-onnx/export.py points every weight at
// its place in that file).

import type * as Ort from 'onnxruntime-web'
import { SEGMENT } from './demucs'
import type { Network } from './run'

/** The weights: Alexandre Défossez's HTDemucs on Hugging Face, at a fixed revision. */
export const WEIGHTS = {
  file: '955717e8.safetensors',
  url: 'https://huggingface.co/adefossez/HTDemucs/resolve/cbc8a9b1a87023b7fd74e7b3412e6321c0eab003/955717e8.safetensors',
  bytes: 84_025_440,
  sha256: 'd9fa14133cfcc034a6758923bb3a8ca9f8dfd0b582134643bbf83f72c17576dd',
} as const

export async function createNetwork(
  ort: typeof Ort,
  graph: Uint8Array,
  weights: Uint8Array,
  executionProviders: string[],
): Promise<Network> {
  const session = await ort.InferenceSession.create(graph, {
    executionProviders,
    externalData: [{ path: WEIGHTS.file, data: weights }],
    graphOptimizationLevel: 'all',
  })
  return {
    async run(mix, mag, freqs, frames) {
      const out = await session.run({
        mix: new ort.Tensor('float32', mix, [1, 2, SEGMENT]),
        mag: new ort.Tensor('float32', mag, [1, 4, freqs, frames]),
      })
      return { freq: (await out.freq.getData()) as Float32Array, time: (await out.time.getData()) as Float32Array }
    },
  }
}
