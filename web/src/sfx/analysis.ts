/** Largest absolute sample in each of `buckets` equal slices. */
export function peaks(samples: ArrayLike<number>, buckets: number): Float32Array {
  const out = new Float32Array(buckets)
  if (samples.length === 0) return out
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor((b * samples.length) / buckets)
    const end = Math.max(start + 1, Math.floor(((b + 1) * samples.length) / buckets))
    let m = 0
    for (let i = start; i < end && i < samples.length; i++) m = Math.max(m, Math.abs(samples[i]))
    out[b] = m
  }
  return out
}

/** In-place iterative radix-2 FFT. `re.length` must be a power of two. */
export function fft(re: Float32Array, im: Float32Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len
    const wr = Math.cos(angle)
    const wi = Math.sin(angle)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = a + len / 2
        const tr = re[b] * cr - im[b] * ci
        const ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
        ;[cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr]
      }
    }
  }
}

export interface Spectrogram {
  columns: number
  bins: number
  /** columns × bins loudness values in 0..1, column-major. */
  data: Float32Array
}

/** Short-time spectrum with `columns` evenly spaced frames, in a 72 dB window. */
export function spectrogram(samples: Float32Array, columns: number, fftSize = 1024): Spectrogram {
  const bins = fftSize / 2
  const data = new Float32Array(columns * bins)
  const re = new Float32Array(fftSize)
  const im = new Float32Array(fftSize)
  const window = Float32Array.from({ length: fftSize }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1)))
  for (let c = 0; c < columns; c++) {
    const center = Math.floor(((c + 0.5) * samples.length) / columns)
    const start = center - fftSize / 2
    for (let i = 0; i < fftSize; i++) {
      re[i] = (samples[start + i] ?? 0) * window[i]
      im[i] = 0
    }
    fft(re, im)
    for (let b = 0; b < bins; b++) {
      const mag = Math.hypot(re[b], im[b]) / (fftSize / 4)
      const db = 20 * Math.log10(mag + 1e-9)
      data[c * bins + b] = Math.min(1, Math.max(0, (db + 72) / 72))
    }
  }
  return { columns, bins, data }
}
