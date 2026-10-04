// Main-thread wrapper around chipcore's SFX functions.

import { instantiateChip, type ChipExports } from '../audio/chip-wasm'

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

export class SfxSynth {
  readonly specs: ParamSpec[]
  readonly presets: string[]
  private readonly ws: number

  constructor(private readonly wasm: ChipExports) {
    const str = (ptr: number, len: number) =>
      decoder.decode(new Uint8Array(wasm.memory.buffer, ptr, len))
    this.specs = Array.from({ length: wasm.sfx_param_count() }, (_, i) => ({
      key: str(wasm.sfx_param_key(i), wasm.sfx_param_key_len(i)),
      index: i,
      min: wasm.sfx_param_min(i),
      max: wasm.sfx_param_max(i),
      default: wasm.sfx_param_default(i),
      integer: wasm.sfx_param_integer(i) === 1,
    }))
    this.presets = Array.from({ length: wasm.sfx_preset_count() }, (_, i) =>
      str(wasm.sfx_preset_key(i), wasm.sfx_preset_key_len(i)),
    )
    this.ws = wasm.sfx_new()
  }

  static async create(module: WebAssembly.Module): Promise<SfxSynth> {
    return new SfxSynth(await instantiateChip(module))
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

  // Views are created per call: wasm memory can grow and detach older views.
  private paramView() {
    return new Float32Array(this.wasm.memory.buffer, this.wasm.sfx_params(this.ws), this.specs.length)
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
    this.wasm.sfx_generate(this.ws, index < 0 ? this.presets.length - 1 : index, seed >>> 0)
    return this.read()
  }

  mutate(params: SfxParams, seed: number, amount = 0.1): SfxParams {
    this.write(params)
    this.wasm.sfx_mutate(this.ws, seed >>> 0, amount)
    return this.read()
  }

  render(params: SfxParams, sampleRate: number): Float32Array {
    this.write(params)
    const length = this.wasm.sfx_render(this.ws, sampleRate)
    return new Float32Array(this.wasm.memory.buffer, this.wasm.sfx_samples(this.ws), length).slice()
  }
}
