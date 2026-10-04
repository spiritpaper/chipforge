// Runs on the audio thread: hosts the chipcore WASM module and renders every block.

import type { FromWorklet, ToWorklet } from './protocol'
import { FRAME_INTERVAL } from './protocol'
import type { ChipExports } from './chip-wasm'

declare const sampleRate: number
declare function registerProcessor(name: string, ctor: unknown): void
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}

class ChipProcessor extends AudioWorkletProcessor {
  private wasm: ChipExports
  private chip: number
  private sinceFrame = 0

  constructor(options: { processorOptions: { module: WebAssembly.Module } }) {
    super()
    const instance = new WebAssembly.Instance(options.processorOptions.module, {})
    this.wasm = instance.exports as unknown as ChipExports
    this.chip = this.wasm.chip_new(sampleRate)
    this.wasm.chip_load_demo(this.chip)
    this.port.onmessage = (e: MessageEvent<ToWorklet>) => this.handle(e.data)
    this.post({ type: 'ready' })
  }

  private post(msg: FromWorklet, transfer: Transferable[] = []) {
    this.port.postMessage(msg, transfer)
  }

  private handle(msg: ToWorklet) {
    const { wasm, chip } = this
    switch (msg.type) {
      case 'play':
        return wasm.chip_play(chip)
      case 'stop':
        return wasm.chip_stop(chip)
      case 'bpm':
        return wasm.chip_set_bpm(chip, msg.bpm)
      case 'mute':
        return wasm.chip_set_muted(chip, msg.channel, msg.muted ? 1 : 0)
      case 'noteOn':
        return wasm.chip_note_on(chip, msg.channel, msg.note, msg.volume)
      case 'noteOff':
        return wasm.chip_note_off(chip, msg.channel)
    }
  }

  private sendFrame() {
    const { wasm, chip } = this
    const len = wasm.chip_scope_len()
    const scopes = Array.from({ length: wasm.chip_channel_count() }, (_, ch) =>
      // Read the view right after the call: memory may have grown and moved.
      new Float32Array(wasm.memory.buffer, wasm.chip_scope(chip, ch), len).slice(),
    )
    this.post(
      { type: 'frame', step: wasm.chip_current_step(chip), scopes },
      scopes.map((s) => s.buffer),
    )
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0]
    const frames = out[0].length
    const ptr = this.wasm.chip_render(this.chip, frames)
    const block = new Float32Array(this.wasm.memory.buffer, ptr, frames)
    for (const channel of out) channel.set(block)

    this.sinceFrame += frames
    if (this.sinceFrame >= FRAME_INTERVAL) {
      this.sinceFrame = 0
      this.sendFrame()
    }
    return true
  }
}

registerProcessor('chip', ChipProcessor)
