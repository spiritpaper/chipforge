// Main-thread wrapper around chipcore's two SFX engines: the chip synth (sounds a NES
// could make) and the classic sfxr synth (jsfxr-compatible: saw and sine waves,
// resonant filter, flanger).

import { instantiateChip, type ChipExports } from '../audio/chip-wasm'

/** Which synth a sound is made with. */
export type Engine = 'chip' | 'classic'

export interface ParamSpec {
  key: string
  index: number
  min: number
  max: number
  default: number
  integer: boolean
}

/** A sound effect, keyed by parameter name so saved data survives reordering. */
export type SfxParams = Record<string, number>

const decoder = new TextDecoder()

/** The wasm calls one engine needs; both engines export the same set. */
interface EngineCalls {
  new_(): number
  params(ws: number): number
  generate(ws: number, preset: number, seed: number): void
  mutate(ws: number, seed: number, amount: number): void
  render(ws: number, sampleRate: number): number
  samples(ws: number): number
  paramCount(): number
  paramMin(i: number): number
  paramMax(i: number): number
  paramDefault(i: number): number
  paramInteger(i: number): number
  paramKey(i: number): number
  paramKeyLen(i: number): number
  presetCount(): number
  presetKey(i: number): number
  presetKeyLen(i: number): number
  canonical?(ws: number): void
}

function calls(w: ChipExports, engine: Engine): EngineCalls {
  if (engine === 'chip') {
    return {
      new_: w.sfx_new, params: w.sfx_params, generate: w.sfx_generate, mutate: w.sfx_mutate,
      render: w.sfx_render, samples: w.sfx_samples, paramCount: w.sfx_param_count, paramMin: w.sfx_param_min,
      paramMax: w.sfx_param_max, paramDefault: w.sfx_param_default, paramInteger: w.sfx_param_integer,
      paramKey: w.sfx_param_key, paramKeyLen: w.sfx_param_key_len, presetCount: w.sfx_preset_count,
      presetKey: w.sfx_preset_key, presetKeyLen: w.sfx_preset_key_len,
    }
  }
  return {
    new_: w.sfxr_new, params: w.sfxr_params, generate: w.sfxr_generate, mutate: w.sfxr_mutate,
    render: w.sfxr_render, samples: w.sfxr_samples, paramCount: w.sfxr_param_count, paramMin: w.sfxr_param_min,
    paramMax: w.sfxr_param_max, paramDefault: w.sfxr_param_default, paramInteger: w.sfxr_param_integer,
    paramKey: w.sfxr_param_key, paramKeyLen: w.sfxr_param_key_len, presetCount: w.sfxr_preset_count,
    presetKey: w.sfxr_preset_key, presetKeyLen: w.sfxr_preset_key_len, canonical: w.sfxr_canonical,
  }
}

export class SfxSynth {
  readonly specs: ParamSpec[]
  readonly presets: string[]
  private readonly ws: number
  private readonly c: EngineCalls

  constructor(
    private readonly wasm: ChipExports,
    readonly engine: Engine = 'chip',
  ) {
    this.c = calls(wasm, engine)
    const str = (ptr: number, len: number) => decoder.decode(new Uint8Array(wasm.memory.buffer, ptr, len))
    this.specs = Array.from({ length: this.c.paramCount() }, (_, i) => ({
      key: str(this.c.paramKey(i), this.c.paramKeyLen(i)),
      index: i,
      min: this.c.paramMin(i),
      max: this.c.paramMax(i),
      default: this.c.paramDefault(i),
      integer: this.c.paramInteger(i) === 1,
    }))
    this.presets = Array.from({ length: this.c.presetCount() }, (_, i) => str(this.c.presetKey(i), this.c.presetKeyLen(i)))
    this.ws = this.c.new_()
  }

  static async create(module: WebAssembly.Module, engine: Engine = 'chip'): Promise<SfxSynth> {
    return new SfxSynth(await instantiateChip(module), engine)
  }

  /** Both engines, sharing one wasm instance. */
  static async both(module: WebAssembly.Module): Promise<Record<Engine, SfxSynth>> {
    const wasm = await instantiateChip(module)
    return { chip: new SfxSynth(wasm, 'chip'), classic: new SfxSynth(wasm, 'classic') }
  }

  spec(key: string): ParamSpec | undefined {
    return this.specs.find((s) => s.key === key)
  }

  defaults(): SfxParams {
    return Object.fromEntries(this.specs.map((s) => [s.key, s.default]))
  }

  /** Clamp (and round) a value the same way the core does. */
  clamp(key: string, value: number): number {
    const s = this.spec(key)
    if (!s) return value
    if (!Number.isFinite(value)) return s.default
    const v = Math.min(s.max, Math.max(s.min, value))
    return s.integer ? Math.round(v) : v
  }

  /**
   * Imported values in range, keeping the sound: the classic engine maps values sfxr
   * allows outside its sliders to ones that sound the same; the chip engine clamps.
   */
  canonical(params: SfxParams): SfxParams {
    this.write(params)
    if (this.c.canonical) {
      this.c.canonical(this.ws)
      return this.read()
    }
    return Object.fromEntries(this.specs.map((s) => [s.key, this.clamp(s.key, params[s.key] ?? s.default)]))
  }

  // Views are created per call: wasm memory can grow and detach older views.
  private paramView() {
    return new Float32Array(this.wasm.memory.buffer, this.c.params(this.ws), this.specs.length)
  }

  private read(): SfxParams {
    const view = this.paramView()
    return Object.fromEntries(this.specs.map((s) => [s.key, view[s.index]]))
  }

  private write(params: SfxParams) {
    const view = this.paramView()
    for (const s of this.specs) view[s.index] = params[s.key] ?? s.default
  }

  generate(preset: string, seed: number): SfxParams {
    const index = this.presets.indexOf(preset)
    this.c.generate(this.ws, index < 0 ? this.presets.length - 1 : index, seed >>> 0)
    return this.read()
  }

  mutate(params: SfxParams, seed: number, amount = 0.1): SfxParams {
    this.write(params)
    this.c.mutate(this.ws, seed >>> 0, amount)
    return this.read()
  }

  render(params: SfxParams, sampleRate: number): Float32Array {
    this.write(params)
    const length = this.c.render(this.ws, sampleRate)
    return new Float32Array(this.wasm.memory.buffer, this.c.samples(this.ws), length).slice()
  }
}
