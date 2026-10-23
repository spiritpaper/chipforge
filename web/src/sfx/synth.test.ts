/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { SfxSynth } from './synth'
import { CLASSIC_PARAM_META, CLASSIC_PRESET_META, PARAM_META, PRESET_META } from './params'
import { fromJsfxrCode, SFXR_ORDER } from './jsfxr'
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

describe('the classic (sfxr) engine (real chipcore WASM)', () => {
  let classic: SfxSynth

  beforeAll(async () => {
    const bytes = readFileSync(new URL('../audio/chipcore.wasm', import.meta.url))
    classic = (await SfxSynth.both(await WebAssembly.compile(bytes))).classic
  })

  it('has UI metadata and a button for exactly what the core defines', () => {
    expect(classic.specs.map((s) => s.key).sort()).toEqual(Object.keys(CLASSIC_PARAM_META).sort())
    expect([...classic.presets].sort()).toEqual(Object.keys(CLASSIC_PRESET_META).sort())
    // Every parameter of a jsfxr code has a slider.
    for (const key of SFXR_ORDER) expect(classic.spec(key), key).toBeDefined()
  })

  it('renders presets audibly and repeatably', () => {
    for (const preset of classic.presets.filter((p) => p !== 'random')) {
      const params = classic.generate(preset, 7)
      expect(classic.generate(preset, 7)).toEqual(params)
      const out = classic.render(params, 44_100)
      expect(Math.max(...out.map(Math.abs)), preset).toBeGreaterThan(0.01)
      expect(classic.render(params, 44_100)).toEqual(out)
    }
  })

  it('plays an imported jsfxr sound, with odd values brought into range', () => {
    const code =
      '34T6Pm1xpoiBpuarXsQgP5hwmU6rGBqmgwdi8eVVa5awiqEaqXhGshiJhyjsUYxzSN9cMbgE2CmY96CMJ9RzoXvYnku8L5S5FP3wAxFcfjiEf4CLpadSX8osV'
    const params = classic.canonical({ ...classic.defaults(), ...fromJsfxrCode(code)! })
    expect(params.wave_type).toBe(1)
    // jsfxr stops this laser at its frequency floor after 2144 samples (44.1 kHz).
    expect(classic.render(params, 44_100).length).toBe(2144)
    expect(classic.render(params, 48_000).length).toBe(2333)
    // Values sfxr only squares come back positive; the sound is the same.
    const odd = classic.canonical({ ...params, p_env_decay: -0.4 })
    expect(odd.p_env_decay).toBeCloseTo(0.4)
  })

  it('reads every value back in real units', () => {
    const params = classic.generate('tone', 1)
    expect(CLASSIC_PARAM_META.p_base_freq.format(params.p_base_freq)).toBe('440 Hz')
    expect(CLASSIC_PARAM_META.p_env_sustain.format(params.p_env_sustain)).toBe('1.00 s')
    for (const s of classic.specs) {
      for (const v of [s.min, s.default, s.max]) expect(CLASSIC_PARAM_META[s.key].format(v), s.key).not.toMatch(/NaN|Infinity/)
    }
  })
})
