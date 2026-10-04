// Live Lo-fi Filter on the audio thread, driven by the same LofiProcessor as export.

import { LofiProcessor, type LofiParams } from './lofi'

declare const sampleRate: number
declare function registerProcessor(name: string, ctor: unknown): void
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}

export type ToLofi = { type: 'params'; params: Partial<LofiParams> } | { type: 'bypass'; on: boolean }

class LofiWorklet extends AudioWorkletProcessor {
  private dsp = new LofiProcessor(sampleRate)
  private mono = new Float32Array(128)

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<ToLofi>) => {
      if (e.data.type === 'params') this.dsp.set(e.data.params)
      else this.dsp.bypass = e.data.on
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]
    const out = outputs[0]
    if (!input?.length) {
      for (const ch of out) ch.fill(0)
      return true
    }
    if (this.mono.length !== input[0].length) this.mono = new Float32Array(input[0].length)
    // Mix down: a chip speaker is mono.
    this.mono.set(input[0])
    for (let c = 1; c < input.length; c++) for (let i = 0; i < this.mono.length; i++) this.mono[i] += input[c][i]
    if (input.length > 1) for (let i = 0; i < this.mono.length; i++) this.mono[i] /= input.length
    this.dsp.process(this.mono, this.mono)
    for (const ch of out) ch.set(this.mono)
    return true
  }
}

registerProcessor('lofi', LofiWorklet)
