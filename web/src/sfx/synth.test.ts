/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { SfxSynth } from './synth'
import { PARAM_META, PRESET_META } from './params'
import { decodeShare, encodeShare } from './share'

let synth: SfxSynth

beforeAll(async () => {
  // Built by `pnpm wasm`, which runs before tests in CI and dev.
  const bytes = readFileSync(new URL('../audio/chipcore.wasm', import.meta.url))
  synth = await SfxSynth.create(await WebAssembly.compile(bytes))
})

describe('SfxSynth (real chipcore WASM)', () => {
  it('has UI metadata for exactly the parameters the core defines', () => {
    expect(synth.specs.map((s) => s.key).sort()).toEqual(Object.keys(PARAM_META).sort())
  })

  it('has a button for exactly the presets the core defines', () => {
    expect([...synth.presets].sort()).toEqual(Object.keys(PRESET_META).sort())
  })

  it('generates the same sound for the same seed', () => {
    expect(synth.generate('coin', 42)).toEqual(synth.generate('coin', 42))
    expect(synth.generate('coin', 42)).not.toEqual(synth.generate('coin', 43))
  })

  it('renders every preset to audible, bounded audio', () => {
    for (const preset of synth.presets) {
      const samples = synth.render(synth.generate(preset, 1), 44_100)
      expect(samples.length).toBeGreaterThan(0)
      expect(Math.max(...samples.map(Math.abs))).toBeGreaterThan(0.05)
      expect(samples.every((s) => Number.isFinite(s) && Math.abs(s) <= 1)).toBe(true)
    }
  })

  it('renders at the requested sample rate', () => {
    const p = { ...synth.defaults(), attack: 0, sustain: 0.5, decay: 0.5 }
    expect(synth.render(p, 44_100).length).toBe(44_100)
    expect(synth.render(p, 48_000).length).toBe(48_000)
  })

  it('clamps like the core', () => {
    expect(synth.clamp('pitch', 1e6)).toBe(3000)
    expect(synth.clamp('jumpBy', 3.4)).toBe(3)
    expect(synth.clamp('volume', Number.NaN)).toBe(synth.spec('volume')!.default)
  })

  it('round-trips share links closely enough to sound identical', () => {
    for (const preset of synth.presets) {
      const params = synth.generate(preset, 7)
      const code = encodeShare(params, synth.specs)
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
      const back = decodeShare(code, synth.specs)!
      for (const s of synth.specs) {
        expect(Math.abs(back[s.key] - params[s.key])).toBeLessThanOrEqual((s.max - s.min) / 0xffff + 1e-6)
      }
    }
  })

  it('rejects damaged share codes', () => {
    expect(decodeShare('', synth.specs)).toBeNull()
    expect(decodeShare('!!!', synth.specs)).toBeNull()
    expect(decodeShare('AgAA', synth.specs)).toBeNull() // wrong version
  })
})
