// Main-thread side of the audio engine. Owns the AudioContext and exposes reactive
// state for the UI; all sound is made in the worklet.

import workletUrl from './chip-worklet.ts?worker&url'
import type { FromWorklet, ToWorklet } from './protocol'
import { CHANNELS } from './channels'
import { soloMask } from '../lib/mix'
import { instantiateChip, readGrid } from './chip-wasm'
import { loadChipModule } from './wasm'

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error'

class ChipEngine {
  status = $state<EngineStatus>('idle')
  error = $state<string | null>(null)
  playing = $state(false)
  bpm = $state(140)
  step = $state(-1)
  volume = $state(0.8)
  muted = $state<boolean[]>(CHANNELS.map(() => false))
  soloed = $state<number | null>(null)
  grid = $state.raw<Int32Array[]>([])
  /** Latest scope samples per channel; not deep-reactive, read in animation frames. */
  scopes: Float32Array[] = []

  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private gain: GainNode | null = null
  private starting: Promise<void> | null = null
  private sfxSource: AudioBufferSourceNode | null = null

  /** One-shot sample playback (SFX Lab), for drawing a playhead. */
  sfxPlaying = $state(false)
  sfxStart = 0
  sfxDuration = 0

  /**
   * Reads the song on the main thread so it can be shown before audio is allowed to
   * start. Failures are left for start() to report.
   */
  async preload() {
    try {
      const wasm = await instantiateChip(await loadChipModule())
      const chip = wasm.chip_new(48_000)
      wasm.chip_load_demo(chip)
      this.grid = readGrid(wasm, chip)
      this.bpm = wasm.chip_bpm(chip)
      wasm.chip_free(chip)
    } catch {
      // start() reports the failure when the user asks for sound.
    }
  }

  /** Must be called from a user gesture (browsers block audio until then). */
  start(): Promise<void> {
    this.starting ??= this.boot().catch((err: unknown) => {
      this.status = 'error'
      this.error = err instanceof Error ? err.message : String(err)
      this.starting = null
    })
    return this.starting
  }

  private async boot() {
    this.status = 'loading'
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    const [module] = await Promise.all([
      loadChipModule(),
      ctx.audioWorklet.addModule(workletUrl),
    ])
    const node = new AudioWorkletNode(ctx, 'chip', {
      numberOfInputs: 0,
      outputChannelCount: [2],
      processorOptions: { module },
    })
    const gain = new GainNode(ctx, { gain: this.volume })
    node.connect(gain).connect(ctx.destination)

    const ready = new Promise<void>((resolve) => {
      node.port.onmessage = (e: MessageEvent<FromWorklet>) => {
        const msg = e.data
        if (msg.type === 'ready') {
          resolve()
        } else {
          this.step = msg.step
          this.scopes = msg.scopes
        }
      }
    })
    Object.assign(this, { ctx, node, gain })
    await ready
    this.applyMutes()
    this.send({ type: 'bpm', bpm: this.bpm })
    this.status = 'ready'
  }

  private send(msg: ToWorklet) {
    this.node?.port.postMessage(msg)
  }

  async togglePlay() {
    await this.start()
    if (this.status !== 'ready') return
    await this.ctx!.resume()
    this.playing = !this.playing
    this.send({ type: this.playing ? 'play' : 'stop' })
    if (!this.playing) this.step = -1
  }

  /** Stops the demo song (e.g. when leaving the screen that plays it). */
  stopSong() {
    if (!this.playing) return
    this.playing = false
    this.step = -1
    this.send({ type: 'stop' })
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48_000
  }

  now(): number {
    return this.ctx?.currentTime ?? 0
  }

  /** Plays rendered mono samples, cutting off any sound already playing. */
  playSamples(samples: Float32Array, sampleRate: number) {
    const ctx = this.ctx
    if (!ctx || !this.gain || samples.length === 0) return
    void ctx.resume()
    this.sfxSource?.stop()
    const buffer = ctx.createBuffer(1, samples.length, sampleRate)
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
    const source = new AudioBufferSourceNode(ctx, { buffer })
    source.connect(this.gain)
    source.onended = () => {
      if (this.sfxSource === source) this.sfxPlaying = false
    }
    source.start()
    this.sfxSource = source
    this.sfxStart = ctx.currentTime
    this.sfxDuration = buffer.duration
    this.sfxPlaying = true
  }

  setBpm(bpm: number) {
    if (!Number.isFinite(bpm)) return
    this.bpm = Math.round(Math.min(300, Math.max(30, bpm)))
    this.send({ type: 'bpm', bpm: this.bpm })
  }

  setVolume(volume: number) {
    this.volume = volume
    this.gain?.gain.setTargetAtTime(volume, this.ctx!.currentTime, 0.01)
  }

  toggleMute(channel: number) {
    this.soloed = null
    this.muted[channel] = !this.muted[channel]
    this.applyMutes()
  }

  toggleSolo(channel: number) {
    this.soloed = this.soloed === channel ? null : channel
    this.applyMutes()
  }

  /** Whether a channel is currently heard, after mute and solo. */
  audible(channel: number): boolean {
    return !soloMask(this.muted, this.soloed)[channel]
  }

  private applyMutes() {
    soloMask(this.muted, this.soloed).forEach((muted, channel) =>
      this.send({ type: 'mute', channel, muted }),
    )
  }
}

export const engine = new ChipEngine()
