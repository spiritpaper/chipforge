// The parts of HTDemucs that run around its network: the spectrogram going in, the
// inverse spectrogram coming out, and cutting a song into overlapping segments. A port
// of demucs/htdemucs.py (_spec, _ispec, _mask with cac) and demucs/apply.py
// (apply_model with split=True, shifts=0) from https://github.com/adefossez/demucs,
// MIT license, Copyright (c) Meta Platforms, Inc. and affiliates. The network itself is
// tools/demucs-onnx/export.py's ONNX graph.

import { fft } from '../../sfx/analysis'

export const SAMPLE_RATE = 44_100
export const NFFT = 4096
export const HOP = NFFT / 4
/** Samples the network takes at once: 7.8 seconds. */
export const SEGMENT = Math.floor(SAMPLE_RATE * 7.8)
export const SOURCES = ['drums', 'bass', 'other', 'vocals'] as const
export type Source = (typeof SOURCES)[number]
/** Neighbouring segments overlap by a quarter, cross-faded. */
const OVERLAP = 0.25

/** torch.hann_window (periodic). */
export function hann(n: number): Float32Array {
  return Float32Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n))
}

/** torch reflect padding: mirrors around the edge samples without repeating them. */
export function reflectPad(x: Float32Array, left: number, right: number): Float32Array {
  const n = x.length
  const out = new Float32Array(n + left + right)
  out.set(x, left)
  for (let i = 1; i <= left; i++) out[left - i] = x[i]
  for (let i = 1; i <= right; i++) out[left + n - 1 + i] = x[n - 1 - i]
  return out
}

/** A complex spectrogram, freqs × frames, frame-minor (index f * frames + t). */
export interface Spectrogram {
  re: Float32Array
  im: Float32Array
  freqs: number
  frames: number
}

/**
 * HTDemucs._spec for one channel: torch.stft(normalized, centered, reflect) after
 * Demucs's own padding, without the top (Nyquist) bin and trimmed to
 * ceil(length / hop) frames, so frames line up with the time branch.
 */
export function spec(x: Float32Array, nfft = NFFT): Spectrogram {
  const hop = nfft / 4
  const frames = Math.ceil(x.length / hop)
  const pad = (hop / 2) * 3
  const padded = reflectPad(x, pad, pad + frames * hop - x.length)
  // torch.stft(center=True) reflects another nfft / 2 on each side.
  const centered = reflectPad(padded, nfft / 2, nfft / 2)
  const freqs = nfft / 2
  const window = hann(nfft)
  const scale = 1 / Math.sqrt(nfft)
  const re = new Float32Array(freqs * frames)
  const im = new Float32Array(freqs * frames)
  const fr = new Float32Array(nfft)
  const fi = new Float32Array(nfft)
  for (let t = 0; t < frames; t++) {
    // Demucs keeps stft frames 2 .. 2 + frames.
    const start = (t + 2) * hop
    for (let i = 0; i < nfft; i++) {
      fr[i] = centered[start + i] * window[i]
      fi[i] = 0
    }
    fft(fr, fi)
    for (let f = 0; f < freqs; f++) {
      re[f * frames + t] = fr[f] * scale
      im[f * frames + t] = fi[f] * scale
    }
  }
  return { re, im, freqs, frames }
}

/** HTDemucs._ispec for one channel: the inverse of `spec`, `length` samples long. */
export function ispec(z: Spectrogram, length: number): Float32Array {
  const nfft = z.freqs * 2
  const hop = nfft / 4
  // Demucs adds the Nyquist bin back (zero) and two empty frames on each side.
  const frames = z.frames + 4
  const pad = (hop / 2) * 3
  const total = hop * Math.ceil(length / hop) + 2 * pad
  const window = hann(nfft)
  const signal = nfft + hop * (frames - 1)
  const out = new Float32Array(signal)
  const norm = new Float32Array(signal)
  const fr = new Float32Array(nfft)
  const fi = new Float32Array(nfft)
  // torch.istft(normalized=True): undo the 1/sqrt(nfft), then irfft divides by nfft.
  const scale = Math.sqrt(nfft) / nfft
  for (let t = 0; t < frames; t++) {
    const src = t - 2
    fr.fill(0)
    fi.fill(0)
    if (src >= 0 && src < z.frames) {
      // Hermitian spectrum, conjugated for an inverse transform with a forward FFT.
      for (let f = 0; f < z.freqs; f++) {
        const r = z.re[f * z.frames + src]
        const i = z.im[f * z.frames + src]
        fr[f] = r
        fi[f] = -i
        if (f > 0) {
          fr[nfft - f] = r
          fi[nfft - f] = i
        }
      }
      // irfft ignores the imaginary part of the DC and Nyquist bins.
      fi[0] = 0
    }
    fft(fr, fi)
    const at = t * hop
    for (let i = 0; i < nfft; i++) {
      out[at + i] += fr[i] * scale * window[i]
      norm[at + i] += window[i] * window[i]
    }
  }
  // Centred: the signal starts nfft / 2 in. Then Demucs drops its own padding.
  const result = new Float32Array(length)
  const from = nfft / 2 + pad
  for (let i = 0; i < length; i++) {
    const j = from + i
    if (j < signal && i + pad < total) result[i] = norm[j] > 1e-11 ? out[j] / norm[j] : 0
  }
  return result
}

/**
 * The network's inputs for one stereo segment of SEGMENT samples: the waveform
 * (channels × samples) and the spectrogram as real channels (left re, left im,
 * right re, right im) × freqs × frames.
 */
export function networkInputs(left: Float32Array, right: Float32Array) {
  const mix = new Float32Array(2 * SEGMENT)
  mix.set(left, 0)
  mix.set(right, SEGMENT)
  const l = spec(left)
  const r = spec(right)
  const size = l.freqs * l.frames
  const mag = new Float32Array(4 * size)
  mag.set(l.re, 0)
  mag.set(l.im, size)
  mag.set(r.re, 2 * size)
  mag.set(r.im, 3 * size)
  return { mix, mag, freqs: l.freqs, frames: l.frames }
}

/**
 * Turns the network's outputs into each source's stereo waveform: the frequency
 * branch (sources × [re, im per channel] × freqs × frames) through the inverse
 * spectrogram, plus the time branch (sources × channels × samples).
 */
export function networkOutputs(freq: Float32Array, time: Float32Array, freqs: number, frames: number): Float32Array[][] {
  const size = freqs * frames
  return SOURCES.map((_, s) =>
    [0, 1].map((c) => {
      const base = (s * 4 + c * 2) * size
      const wave = ispec({ re: freq.subarray(base, base + size), im: freq.subarray(base + size, base + 2 * size), freqs, frames }, SEGMENT)
      const t = time.subarray((s * 2 + c) * SEGMENT, (s * 2 + c + 1) * SEGMENT)
      for (let i = 0; i < SEGMENT; i++) wave[i] += t[i]
      return wave
    }),
  )
}

/** Where each segment starts; neighbours overlap by a quarter (apply_model's split). */
export function segmentOffsets(length: number): number[] {
  const stride = Math.floor((1 - OVERLAP) * SEGMENT)
  const out: number[] = []
  for (let o = 0; o < length; o += stride) out.push(o)
  return out
}

/** The cross-fade weight: a triangle peaking mid-segment, normalised to 1. */
export function segmentWeight(): Float32Array {
  const half = Math.floor(SEGMENT / 2)
  const w = new Float32Array(SEGMENT)
  for (let i = 0; i < half; i++) w[i] = i + 1
  for (let i = half; i < SEGMENT; i++) w[i] = SEGMENT - i
  const max = Math.max(half, SEGMENT - half)
  for (let i = 0; i < SEGMENT; i++) w[i] /= max
  return w
}

/**
 * The segment at `offset` as the network sees it (TensorChunk.padded): a short last
 * segment is centred in SEGMENT samples, filled with the song around it, then zeros.
 * Returns the samples and where the segment's own audio starts within them.
 */
export function segmentInput(channel: Float32Array, offset: number): { samples: Float32Array; length: number; trim: number } {
  const length = Math.min(SEGMENT, channel.length - offset)
  const delta = SEGMENT - length
  const start = offset - Math.floor(delta / 2)
  const samples = new Float32Array(SEGMENT)
  const from = Math.max(0, start)
  const to = Math.min(channel.length, start + SEGMENT)
  samples.set(channel.subarray(from, to), from - start)
  // center_trim keeps the middle `length` samples, the extra one dropped on the right.
  return { samples, length, trim: Math.floor(delta / 2) }
}

/** apply.py normalises the whole song by its mono mean and deviation first. */
export function songStats(left: Float32Array, right: Float32Array): { mean: number; std: number } {
  const n = left.length
  let sum = 0
  for (let i = 0; i < n; i++) sum += (left[i] + right[i]) / 2
  const mean = sum / n
  let sq = 0
  for (let i = 0; i < n; i++) {
    const d = (left[i] + right[i]) / 2 - mean
    sq += d * d
  }
  // torch.std is the unbiased estimate.
  return { mean, std: Math.sqrt(sq / Math.max(1, n - 1)) + 1e-8 }
}
