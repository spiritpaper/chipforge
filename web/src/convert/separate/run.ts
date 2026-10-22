// Separates a whole song: normalises it, runs the network on overlapping segments and
// cross-fades the results, as Demucs's apply_model does (split=True, shifts=0). The
// network is passed in, so this runs the same in the worker and in tests.

import { networkInputs, networkOutputs, SEGMENT, segmentInput, segmentOffsets, segmentWeight, songStats, SOURCES } from './demucs'

export interface Network {
  /** The ONNX graph: waveform and spectrogram in, frequency and time branches out. */
  run(mix: Float32Array, mag: Float32Array, freqs: number, frames: number): Promise<{ freq: Float32Array; time: Float32Array }>
}

/**
 * Returns each source (drums, bass, other, vocals) as mono samples at the input's
 * sample rate (44.1 kHz). Mono keeps memory down; the parts are for listening to and
 * transcribing, and stereo would double a song's footprint.
 */
export async function separate(
  left: Float32Array,
  right: Float32Array,
  net: Network,
  onProgress: (fraction: number) => void = () => {},
): Promise<Float32Array[]> {
  const n = left.length
  const { mean, std } = songStats(left, right)
  const norm = (x: Float32Array) => x.map((v) => (v - mean) / std)
  const l = norm(left)
  const r = norm(right)
  const out = SOURCES.map(() => new Float32Array(n))
  const total = new Float32Array(n)
  const weight = segmentWeight()
  const offsets = segmentOffsets(n)
  for (const [k, offset] of offsets.entries()) {
    const a = segmentInput(l, offset)
    const b = segmentInput(r, offset)
    const inputs = networkInputs(a.samples, b.samples)
    const { freq, time } = await net.run(inputs.mix, inputs.mag, inputs.freqs, inputs.frames)
    const parts = networkOutputs(freq, time, inputs.freqs, inputs.frames)
    // A short last segment uses the start of the weight, as apply_model does.
    for (let i = 0; i < a.length; i++) total[offset + i] += weight[i]
    parts.forEach(([pl, pr], s) => {
      const dst = out[s]
      for (let i = 0; i < a.length; i++) dst[offset + i] += weight[i] * (pl[a.trim + i] + pr[a.trim + i]) * 0.5
    })
    onProgress((k + 1) / offsets.length)
  }
  for (const dst of out) for (let i = 0; i < n; i++) dst[i] = (dst[i] / total[i]) * std + mean
  return out
}

export { SEGMENT, SOURCES }
