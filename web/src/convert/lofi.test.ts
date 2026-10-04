import { describe, expect, it } from 'vitest'
import { LofiProcessor, lofiRender, LOFI_PRESETS } from './lofi'

const SR = 44_100
const sine = (hz: number, seconds = 0.5, amp = 0.8) =>
  Float32Array.from({ length: Math.floor(SR * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR))

describe('Lo-fi Filter', () => {
  it('passes audio through untouched when bypassed or fully dry', () => {
    const x = sine(440)
    const p = new LofiProcessor(SR)
    p.bypass = true
    const out = new Float32Array(x.length)
    p.process(x, out)
    expect(out).toEqual(x)
    expect(lofiRender(x, SR, { ...LOFI_PRESETS[0].params, mix: 0 })).toEqual(x)
  })

  it('holds samples at the crushed rate', () => {
    const out = lofiRender(sine(100), SR, { rate: SR / 4, bits: 8, square: 0, tone: 22_000, mix: 1 })
    // With the low-pass wide open, consecutive held samples change at most every 4.
    let changes = 0
    for (let i = 1000; i < 2000; i++) if (Math.abs(out[i] - out[i - 1]) > 0.02) changes++
    expect(changes).toBeLessThanOrEqual(1000 / 4 + 2)
    expect(changes).toBeGreaterThan(50)
  })

  it('reduces bit depth to few levels', () => {
    const p = new LofiProcessor(SR)
    p.set({ rate: SR, bits: 2, square: 0, tone: 22_000, mix: 1 })
    // Inspect the quantizer through a slow ramp: few distinct plateaus.
    const ramp = Float32Array.from({ length: 4410 }, (_, i) => -0.9 + (1.8 * i) / 4410)
    const out = new Float32Array(ramp.length)
    p.process(ramp, out)
    const steps = new Set(Array.from(out.slice(200), (v) => Math.round(v * 20)))
    expect(steps.size).toBeLessThan(40)
  })

  it('keeps output in range, finite and without DC for every preset', () => {
    for (const preset of LOFI_PRESETS) {
      const out = lofiRender(sine(220, 1, 1), SR, preset.params)
      expect(out.every((v) => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true)
      const mean = out.slice(SR / 2).reduce((s, v) => s + v, 0) / (SR / 2)
      expect(Math.abs(mean)).toBeLessThan(0.02)
    }
  })

  it('pushes a sine toward a square when square is high', () => {
    const crest = (x: Float32Array) => Math.max(...x.map(Math.abs)) / Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length)
    const soft = lofiRender(sine(220), SR, { rate: SR, bits: 8, square: 0, tone: 20_000, mix: 1 })
    const hard = lofiRender(sine(220), SR, { rate: SR, bits: 8, square: 1, tone: 20_000, mix: 1 })
    // A square wave's crest factor is 1; a sine's is about 1.41.
    expect(crest(hard)).toBeLessThan(crest(soft) - 0.15)
  })
})
