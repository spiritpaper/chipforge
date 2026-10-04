import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { encodeWav } from './wav'
import { fft, peaks, spectrogram } from './analysis'
import { editName, nextName, prune, slugify, uniqueFileNames, type SfxEntry } from './library-core'
import { fromPosition, silenceReason, toPosition } from './params'
import { zipSounds } from './export'

describe('encodeWav', () => {
  it('writes a valid 16-bit mono header and clamps samples', () => {
    const bytes = encodeWav(Float32Array.from([0, 1, -1, 2]), 44_100)
    const view = new DataView(bytes.buffer)
    expect(strFromU8(bytes.slice(0, 4))).toBe('RIFF')
    expect(strFromU8(bytes.slice(8, 16))).toBe('WAVEfmt ')
    expect(view.getUint32(24, true)).toBe(44_100)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(8)
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32767, 32767])
  })
})

describe('analysis', () => {
  it('finds peaks per bucket', () => {
    expect([...peaks([0.1, -0.5, 0.2, 0.9], 2)]).toEqual([0.5, 0.9].map(Math.fround))
  })

  it('puts a sine in the right FFT bin', () => {
    const n = 256
    const re = Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 10 * i) / n))
    const im = new Float32Array(n)
    fft(re, im)
    const mags = Array.from({ length: n / 2 }, (_, b) => Math.hypot(re[b], im[b]))
    expect(mags.indexOf(Math.max(...mags))).toBe(10)
  })

  it('shows a rising tone climbing through the spectrogram', () => {
    const sr = 48_000
    let phase = 0
    const samples = Float32Array.from({ length: sr }, (_, i) => {
      phase += (2 * Math.PI * (200 + 2000 * (i / sr))) / sr
      return Math.sin(phase)
    })
    const { data, bins } = spectrogram(samples, 8)
    const loudestBin = (c: number) => {
      const col = data.subarray(c * bins, (c + 1) * bins)
      return col.indexOf(Math.max(...col))
    }
    expect(loudestBin(7)).toBeGreaterThan(loudestBin(0) * 3)
  })
})

describe('library rules', () => {
  it('numbers names per label', () => {
    expect(nextName([], 'Coin')).toBe('Coin 1')
    expect(nextName([{ name: 'Coin 3' }, { name: 'Coin 1 edit' }, { name: 'Jump 9' }], 'Coin')).toBe('Coin 4')
  })

  it('does not stack edit suffixes', () => {
    expect(editName('Coin 2')).toBe('Coin 2 edit')
    expect(editName('Coin 2 edit')).toBe('Coin 2 edit')
  })

  it('prunes old unkept sounds but never kept ones', () => {
    const entries = [
      { id: 1, starred: false },
      { id: 2, starred: true },
      { id: 3, starred: false },
      { id: 4, starred: false },
      { id: 5, starred: true },
    ]
    expect(prune(entries, 2).map((e) => e.id)).toEqual([1, 2, 3, 5])
  })

  it('makes safe, unique file names', () => {
    expect(slugify('Power-up 3 edit!')).toBe('power-up-3-edit')
    expect(slugify('???')).toBe('sound')
    expect(uniqueFileNames(['Coin 1', 'coin 1', 'Jump'], 'wav')).toEqual(['coin-1.wav', 'coin-1-2.wav', 'jump.wav'])
  })
})

describe('slider positions', () => {
  it('round-trips linear and log scales', () => {
    expect(toPosition(0.5, 0, 1)).toBe(500)
    expect(fromPosition(500, 0, 1)).toBe(0.5)
    expect(toPosition(300, 30, 3000, 'log')).toBe(500)
    expect(fromPosition(500, 30, 3000, 'log')).toBeCloseTo(300)
  })
})

describe('zipSounds', () => {
  it('bundles WAVs with a manifest', () => {
    const entry: SfxEntry = { id: 'a', name: 'Coin 1', preset: 'coin', seed: 5, params: { pitch: 900 }, starred: true, createdAt: 0 }
    const zip = unzipSync(zipSounds([{ entry, samples: new Float32Array(441) }], 44_100))
    expect(Object.keys(zip).sort()).toEqual(['coin-1.wav', 'sfx.json'])
    const manifest = JSON.parse(strFromU8(zip['sfx.json']))
    expect(manifest.sounds[0]).toMatchObject({ name: 'Coin 1', file: 'coin-1.wav', seconds: 0.01, seed: 5 })
  })
})

describe('silenceReason', () => {
  const tone = Float32Array.from({ length: 4800 }, (_, i) => Math.sin(i / 10) * 0.5)
  const base = { pitch: 440, stopBelow: 0, volume: 0.6, slide: 0 }

  it('is quiet about audible sounds', () => {
    expect(silenceReason(base, tone, 48_000)).toBeNull()
  })

  it('explains the cause of silence', () => {
    const empty = new Float32Array(0)
    expect(silenceReason({ ...base, pitch: 75, stopBelow: 200 }, empty, 48_000)).toMatch(/Pitch starts below Stop below/)
    expect(silenceReason({ ...base, volume: 0 }, new Float32Array(4800), 48_000)).toMatch(/Volume is at 0%/)
    expect(silenceReason(base, new Float32Array(10), 48_000)).toMatch(/too short/)
  })
})
