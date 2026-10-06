// Short-time magnitude spectra, shared by tempo and drum detection.

import { fft } from '../sfx/analysis'

export const FFT_SIZE = 1024
export const HOP = 512

export interface Spectra {
  /** frames × bins magnitudes, frame-major. */
  mags: Float32Array
  frames: number
  bins: number
  /** Frames per second. */
  fps: number
  /** Hz per bin. */
  binHz: number
}

export function stft(samples: Float32Array, sampleRate: number): Spectra {
  const bins = FFT_SIZE / 2
  const frames = Math.max(0, Math.floor((samples.length - FFT_SIZE) / HOP) + 1)
  const mags = new Float32Array(frames * bins)
  const re = new Float32Array(FFT_SIZE)
  const im = new Float32Array(FFT_SIZE)
  const window = Float32Array.from({ length: FFT_SIZE }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)))
  for (let f = 0; f < frames; f++) {
    const o = f * HOP
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = samples[o + i] * window[i]
      im[i] = 0
    }
    fft(re, im)
    for (let b = 0; b < bins; b++) mags[f * bins + b] = Math.hypot(re[b], im[b])
  }
  return { mags, frames, bins, fps: sampleRate / HOP, binHz: sampleRate / FFT_SIZE }
}

/** Positive log-magnitude change per frame, summed over bins in [loHz, hiHz). */
export function bandFlux(s: Spectra, loHz: number, hiHz: number): Float32Array {
  const lo = Math.max(1, Math.floor(loHz / s.binHz))
  const hi = Math.min(s.bins, Math.ceil(hiHz / s.binHz))
  const out = new Float32Array(s.frames)
  for (let f = 1; f < s.frames; f++) {
    let sum = 0
    for (let b = lo; b < hi; b++) {
      const d = Math.log1p(10 * s.mags[f * s.bins + b]) - Math.log1p(10 * s.mags[(f - 1) * s.bins + b])
      if (d > 0) sum += d
    }
    out[f] = sum
  }
  return out
}

/** Local maxima above a moving-median threshold: candidate onsets, as frame indexes. */
export function pickPeaks(env: Float32Array, sensitivity = 1.5, radius = 8, minGap = 3): number[] {
  const peaks: number[] = []
  const mean = env.reduce((s, v) => s + v, 0) / Math.max(1, env.length)
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] < env[i - 1] || env[i] < env[i + 1]) continue
    const window = Array.from(env.subarray(Math.max(0, i - radius), i + radius + 1)).sort((a, b) => a - b)
    const median = window[window.length >> 1]
    if (env[i] > median * sensitivity + mean * 0.3 && (!peaks.length || i - peaks.at(-1)! >= minGap)) peaks.push(i)
  }
  return peaks
}
