// The Lo-fi Filter: turns any recording into something that sounds like it's coming
// out of an old console. Pure and allocation-free per block, so the same class runs in
// the live AudioWorklet, in the export worker and in tests.

export interface LofiParams {
  /** Effective sample rate in Hz (sample-and-hold), e.g. 4000..32000. */
  rate: number
  /** Bit depth of the output, 2..8. */
  bits: number
  /** 0..1: how hard the signal is pushed toward square waves. */
  square: number
  /** Low-pass cutoff in Hz after crushing (softens aliasing fizz). */
  tone: number
  /** 0..1 dry/wet. */
  mix: number
}

export const DEFAULT_LOFI: LofiParams = { rate: 11_025, bits: 4, square: 0.4, tone: 7000, mix: 1 }

export const LOFI_PRESETS: { id: string; label: string; description: string; params: LofiParams }[] = [
  { id: 'nes', label: 'NES', description: 'Four-bit steps and a gritty edge.', params: { rate: 11_025, bits: 4, square: 0.4, tone: 7000, mix: 1 } },
  { id: 'gameboy', label: 'Game Boy speaker', description: 'Tiny, buzzy and narrow.', params: { rate: 8000, bits: 4, square: 0.65, tone: 3500, mix: 1 } },
  { id: 'arcade', label: 'Arcade cabinet', description: 'Brighter, more bits, heavy drive.', params: { rate: 16_000, bits: 6, square: 0.7, tone: 9000, mix: 1 } },
  { id: 'gentle', label: 'Gentle lo-fi', description: 'Crunchy but still the original song.', params: { rate: 22_050, bits: 7, square: 0.15, tone: 11_000, mix: 0.7 } },
]

export class LofiProcessor {
  private params: LofiParams = { ...DEFAULT_LOFI }
  private holdPhase = 1
  private held = 0
  private lp = 0
  private lpCoef = 0
  private dcIn = 0
  private dcOut = 0
  bypass = false

  constructor(private readonly sampleRate: number) {
    this.set(DEFAULT_LOFI)
  }

  set(p: Partial<LofiParams>) {
    this.params = { ...this.params, ...p }
    this.lpCoef = Math.exp((-2 * Math.PI * Math.min(this.params.tone, this.sampleRate * 0.45)) / this.sampleRate)
  }

  /** Processes mono samples; `input` and `output` may be the same array. */
  process(input: Float32Array, output: Float32Array) {
    const { rate, bits, square, mix } = this.params
    if (this.bypass) {
      output.set(input)
      return
    }
    const step = Math.min(1, rate / this.sampleRate)
    const levels = 2 ** Math.round(Math.min(8, Math.max(2, bits))) / 2
    // Square-ish waveshaping: x^k with k → 0 approaches sign(x).
    const k = 1 - 0.92 * Math.min(1, Math.max(0, square))
    const drive = 1 + square * 2
    for (let i = 0; i < input.length; i++) {
      const dry = input[i]
      this.holdPhase += step
      if (this.holdPhase >= 1) {
        this.holdPhase -= 1
        const x = Math.max(-1, Math.min(1, dry * drive))
        const shaped = Math.sign(x) * Math.abs(x) ** k
        this.held = Math.round(shaped * levels) / levels
      }
      this.lp = this.held + this.lpCoef * (this.lp - this.held)
      // Remove DC that waveshaping and quantizing can introduce.
      const wet = this.lp - this.dcIn + 0.995 * this.dcOut
      this.dcIn = this.lp
      this.dcOut = wet
      output[i] = Math.max(-1, Math.min(1, dry + (wet * 0.8 - dry) * mix))
    }
  }
}

/** Runs the filter over a whole recording (export). */
export function lofiRender(samples: Float32Array, sampleRate: number, params: LofiParams): Float32Array {
  const p = new LofiProcessor(sampleRate)
  p.set(params)
  const out = new Float32Array(samples.length)
  p.process(samples, out)
  return out
}
