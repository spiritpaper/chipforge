// Finds kick, snare and hi-hat hits in a full mix. Every onset is found once from the
// overall onset envelope, then classified by which frequency bands jump at that moment
// and how noise-like they are. Tuned to be conservative: missing a hit is better than
// turning every chord into a snare.

import type { DrumKind } from '../song/voices'
import { onsetEnvelope } from './rhythm'
import { bandFlux, pickPeaks, stft, HOP, type Spectra } from './stft'

export interface DrumHit {
  time: number
  kind: Exclude<DrumKind, 'open'>
}

const BANDS = {
  low: [30, 150],
  mid: [1500, 6000],
  high: [7000, 16_000],
} as const

type Band = keyof typeof BANDS

function bandRange(s: Spectra, [loHz, hiHz]: readonly [number, number]) {
  return [Math.max(1, Math.floor(loHz / s.binHz)), Math.min(s.bins, Math.ceil(hiHz / s.binHz))] as const
}

/** Energy per frame in a band. */
function bandEnergy(s: Spectra, band: Band): Float32Array {
  const [lo, hi] = bandRange(s, BANDS[band])
  const out = new Float32Array(s.frames)
  for (let f = 0; f < s.frames; f++) {
    let e = 0
    for (let b = lo; b < hi; b++) e += s.mags[f * s.bins + b] ** 2
    out[f] = e
  }
  return out
}

/** 0 (pure tones) .. 1 (white noise) over a band in one frame. */
function flatness(s: Spectra, frame: number, band: Band): number {
  const [lo, hi] = bandRange(s, BANDS[band])
  let logSum = 0
  let sum = 0
  for (let b = lo; b < hi; b++) {
    const m = s.mags[frame * s.bins + b] + 1e-9
    logSum += Math.log(m)
    sum += m
  }
  const n = hi - lo
  return Math.exp(logSum / n) / (sum / n)
}

const percentile = (x: Float32Array, p: number) => {
  const sorted = Float32Array.from(x).sort()
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0
}

/** Jump needed in a band, in dB, for it to count as struck. */
const RISE_DB = 6

export function detectDrums(samples: Float32Array, sampleRate: number): DrumHit[] {
  const s = stft(samples, sampleRate)
  if (s.frames < 4) return []
  const bands = Object.keys(BANDS) as Band[]
  const energy = Object.fromEntries(bands.map((b) => [b, bandEnergy(s, b)])) as Record<Band, Float32Array>
  const loud = Object.fromEntries(bands.map((b) => [b, percentile(energy[b], 0.98)])) as Record<Band, number>
  const hits: DrumHit[] = []

  // Onsets from the full band (hats are onsets too), plus the low band on its own: a
  // lone kick is quiet next to hats and snares in a full-band envelope.
  const onsets = [...pickPeaks(onsetEnvelope(s, 16_000), 1.3, 8, 3), ...pickPeaks(bandFlux(s, ...BANDS.low), 1.5, 8, 3)]
    .sort((a, b) => a - b)
    .filter((f, i, all) => i === 0 || f - all[i - 1] > 2)

  for (const f of onsets) {
    const now = (b: Band) => Math.max(energy[b][f], energy[b][f + 1] ?? 0)
    const before = (b: Band) => Math.min(energy[b][f - 2] ?? 0, energy[b][f - 1] ?? 0)
    const struck = (b: Band) =>
      now(b) > 0.05 * loud[b] && 10 * Math.log10((now(b) + 1e-9) / (before(b) + 1e-9)) > RISE_DB
    const total = now('low') + now('mid') + now('high') + 1e-9
    const time = (f * HOP + HOP) / sampleRate

    // Kicks put most of their energy down low; noise and snares don't.
    if (struck('low') && now('low') / total > 0.5) hits.push({ time, kind: 'kick' })
    // Snares spread their noise around 1–6 kHz; hats sit higher. The balance between
    // the two bands tells them apart even over sustained chords.
    const hatLike = now('high') > 1.5 * now('mid')
    if (!hatLike && struck('mid') && flatness(s, f, 'mid') > 0.25) hits.push({ time, kind: 'snare' })
    else if (hatLike && struck('high') && flatness(s, f, 'high') > 0.25) hits.push({ time, kind: 'hat' })
  }
  return hits
}
