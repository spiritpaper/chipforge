// Tempo and beat position from audio: an onset envelope, autocorrelation for the
// tempo (gently preferring moderate tempos), then a comb search for the first beat.

import { bandFlux, stft, type Spectra } from './stft'

export interface Rhythm {
  bpm: number
  /** Time of a beat, in seconds; rows are counted from here. */
  firstBeat: number
  /** 0..1, how clearly the tempo stood out. */
  confidence: number
}

/**
 * Sudden increases in energy over time. Beat finding uses the band below 4 kHz, where
 * kicks, snares and note attacks live: off-beat hi-hats would otherwise dominate.
 */
export function onsetEnvelope(s: Spectra, highHz = 4000): Float32Array {
  const env = bandFlux(s, 30, highHz)
  // Remove the slowly varying level so only sudden changes remain.
  const radius = Math.round(s.fps * 0.25)
  const out = new Float32Array(env.length)
  for (let i = 0; i < env.length; i++) {
    let sum = 0
    let n = 0
    for (let k = Math.max(0, i - radius); k <= Math.min(env.length - 1, i + radius); k++, n++) sum += env[k]
    out[i] = Math.max(0, env[i] - sum / n)
  }
  // Onsets are one-frame spikes that fall between frame boundaries; a small blur lets
  // whole-frame lags line up with fractional beat periods.
  const kernel = [1, 3, 4, 3, 1]
  const blurred = new Float32Array(out.length)
  for (let i = 0; i < out.length; i++) {
    let sum = 0
    for (let k = -2; k <= 2; k++) sum += (out[i + k] ?? 0) * kernel[k + 2]
    blurred[i] = sum / 12
  }
  return blurred
}

export function estimateTempo(env: Float32Array, fps: number, min = 70, max = 180): { bpm: number; confidence: number } {
  const minLag = Math.floor((60 * fps) / max)
  const maxLag = Math.ceil((60 * fps) / min)
  // Up to four times the longest lag: scores look at multiples of each candidate.
  const ac = new Float32Array(4 * maxLag + 2)
  for (let lag = 1; lag < ac.length; lag++) {
    let sum = 0
    for (let i = lag; i < env.length; i++) sum += env[i] * env[i - lag]
    ac[lag] = sum / (env.length - lag)
  }
  let best = minLag
  let bestScore = -Infinity
  let total = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * fps) / lag
    // A broad preference for tempos near 120 resolves half/double-time ambiguity.
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2)
    // A true beat period repeats at its multiples too; reward consistent candidates.
    const score = (ac[lag] + ac[2 * lag] / 2 + ac[3 * lag] / 3 + ac[4 * lag] / 4) * prior
    total += Math.max(0, score)
    if (score > bestScore) {
      bestScore = score
      best = lag
    }
  }
  // Parabolic interpolation for a sub-frame lag.
  const [a, b, c] = [ac[best - 1], ac[best], ac[best + 1]]
  const curve = a - 2 * b + c
  const shift = curve < 0 ? (0.5 * (a - c)) / curve : 0
  const bpm = (60 * fps) / (best + Math.max(-0.5, Math.min(0.5, shift)))
  const confidence = total > 0 ? Math.min(1, (bestScore / total) * ((maxLag - minLag) / 8)) : 0
  return { bpm, confidence }
}

/** The offset (within one beat) whose beat grid lines up with the most onset energy. */
export function beatPhase(env: Float32Array, fps: number, bpm: number): number {
  const period = (60 * fps) / bpm
  const steps = Math.max(1, Math.round(period))
  let best = 0
  let bestSum = -1
  for (let s = 0; s < steps; s++) {
    let sum = 0
    for (let t = s; t < env.length; t += period) sum += env[Math.round(t)] ?? 0
    if (sum > bestSum) {
      bestSum = sum
      best = s
    }
  }
  return best / fps
}

/**
 * The beat closest to the start of the recording. Beat phase is circular, so a beat
 * found just before the next one (0.49 s at 120 BPM) really means "at 0": choosing the
 * nearest keeps the song from starting a beat late. May be slightly negative.
 */
export function nearestBeat(r: Rhythm): number {
  const beat = 60 / r.bpm
  const phase = ((r.firstBeat % beat) + beat) % beat
  return phase > beat / 2 ? phase - beat : phase
}

export function detectRhythm(samples: Float32Array, sampleRate: number): Rhythm {
  const s = stft(samples, sampleRate)
  const env = onsetEnvelope(s)
  const { bpm, confidence } = estimateTempo(env, s.fps)
  // Spectral frames are centred half a window after their start.
  const firstBeat = beatPhase(env, s.fps, bpm) + 512 / sampleRate
  return { bpm, firstBeat, confidence }
}
