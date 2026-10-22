import { describe, expect, it } from 'vitest'
import { ispec, reflectPad, SEGMENT, segmentInput, segmentOffsets, segmentWeight, spec } from './demucs'
// Made by Demucs's own code: tools/demucs-onnx/fixtures.py.
import fixtures from './fixtures.json'

const maxDiff = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let m = 0
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]))
  return m
}

describe('Demucs spectrograms', () => {
  it('reflects like torch', () => {
    expect(Array.from(reflectPad(Float32Array.from([1, 2, 3, 4]), 2, 3))).toEqual([3, 2, 1, 2, 3, 4, 3, 2, 1])
  })

  for (const c of fixtures.cases) {
    it(`matches PyTorch's spectrogram (${c.x.length} samples)`, () => {
      const z = spec(Float32Array.from(c.x), fixtures.nfft)
      expect([z.freqs, z.frames]).toEqual([c.freqs, c.frames])
      expect(maxDiff(z.re, c.re)).toBeLessThan(1e-5)
      expect(maxDiff(z.im, c.im)).toBeLessThan(1e-5)
    })

    it(`matches PyTorch's inverse (${c.x.length} samples)`, () => {
      const z = { re: Float32Array.from(c.edited_re), im: Float32Array.from(c.edited_im), freqs: c.freqs, frames: c.frames }
      expect(maxDiff(ispec(z, c.x.length), c.inverse)).toBeLessThan(1e-5)
    })
  }

  it('gets a signal back from its spectrogram, away from the edges', () => {
    // Demucs drops the Nyquist bin and the frames past the ends, so only the middle of
    // a signal without content at Nyquist comes back exactly.
    const x = Float32Array.from({ length: 300 }, (_, i) => Math.sin(i / 3) * Math.cos(i / 17))
    const back = ispec(spec(x, 64), x.length)
    expect(maxDiff(back.subarray(48, 252), x.subarray(48, 252))).toBeLessThan(1e-4)
  })
})

describe('Demucs segments', () => {
  it('covers the song with segments overlapping by a quarter', () => {
    const stride = Math.floor(0.75 * SEGMENT)
    expect(segmentOffsets(SEGMENT * 2)).toEqual([0, stride, 2 * stride])
  })

  it('cross-fades with a triangle that peaks at 1', () => {
    const w = segmentWeight()
    expect(w.length).toBe(SEGMENT)
    expect(Math.max(...w.subarray(SEGMENT / 2 - 2, SEGMENT / 2 + 2))).toBe(1)
    expect(w[0]).toBeCloseTo(2 / SEGMENT, 8)
  })

  it('centres a short last segment in the song around it', () => {
    const song = Float32Array.from({ length: SEGMENT + 1000 }, (_, i) => i)
    const { samples, length, trim } = segmentInput(song, SEGMENT)
    expect(length).toBe(1000)
    // Starts (SEGMENT - 1000) / 2 samples before the segment, then zeros past the end.
    expect(samples[trim]).toBe(SEGMENT)
    expect(samples[0]).toBe(SEGMENT - trim)
    expect(samples[trim + 999]).toBe(SEGMENT + 999)
    expect(samples[trim + 1000]).toBe(0)
  })
})
