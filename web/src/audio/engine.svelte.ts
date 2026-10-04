// Main-thread side of the audio engine. Owns the AudioContext and exposes reactive
// state for the UI; all sound is made in the worklet.

import workletUrl from './chip-worklet.ts?worker&url'
import type { FromWorklet, ToWorklet } from './protocol'
import { CHANNELS } from './channels'
import { soloMask } from '../lib/mix'
import { loadChipModule } from './wasm'
import { encodeSong } from '../song/encode'
import type { Song } from '../song/model'

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface PlayPosition {
  order: number
  row: number
}

class ChipEngine {
  status = $state<EngineStatus>('idle')
  error = $state<string | null>(null)
  /** Song playback (Compose); one-shot sample playback is tracked separately. */
  playing = $state(false)
  position = $state<PlayPosition | null>(null)
  loopPattern = $state(false)
  volume = $state(0.8)
  muted = $state<boolean[]>(CHANNELS.map(() => false))
  soloed = $state<number | null>(null)
  /** Latest scope samples per channel; not deep-reactive, read in animation frames. */
  scopes: Float32Array[] = []

  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private gain: GainNode | null = null
  private starting: Promise<void> | null = null
  private song: Song | null = null
  private sfxSource: AudioBufferSourceNode | null = null

  /** One-shot sample playback (SFX Lab), for drawing a playhead. */
  sfxPlaying = $state(false)
  sfxStart = 0
  sfxDuration = 0

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
    const [module] = await Promise.all([loadChipModule(), ctx.audioWorklet.addModule(workletUrl)])
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
        } else if (msg.type === 'songError') {
          this.error = `The song could not be loaded (code ${msg.code}).`
        } else {
          // Frames posted before a play/stop request was handled can still arrive, so
          // `playing` only changes on request; a stale "stopped" frame is ignored.
          if (this.playing) this.position = msg.position
          this.scopes = msg.scopes
        }
      }
    })
    Object.assign(this, { ctx, node, gain })
    await ready
    this.applyMutes()
    if (this.song) this.sendSong(this.song)
    this.send({ type: 'loopPattern', on: this.loopPattern })
    this.status = 'ready'
  }

  private send(msg: ToWorklet, transfer: Transferable[] = []) {
    this.node?.port.postMessage(msg, transfer)
  }

  private sendSong(song: Song) {
    const bytes = encodeSong(song)
    this.send({ type: 'song', bytes }, [bytes.buffer])
  }

  /** Hands the engine the song to play; call again after every edit. */
  setSong(song: Song) {
    if (song === this.song) return
    this.song = song
    if (this.status === 'ready') this.sendSong(song)
  }

  async play(order = 0, row = 0) {
    await this.start()
    if (this.status !== 'ready') return
    await this.ctx!.resume()
    this.send({ type: 'play', order, row })
    this.playing = true
  }

  stop() {
    if (!this.playing) return
    this.playing = false
    this.position = null
    this.send({ type: 'stop' })
  }

  async togglePlay(order = 0, row = 0) {
    if (this.playing) this.stop()
    else await this.play(order, row)
  }

  setLoopPattern(on: boolean) {
    this.loopPattern = on
    this.send({ type: 'loopPattern', on })
  }

  /** Sounds a note on one channel with an instrument, e.g. while entering notes. */
  async preview(channel: number, note: number, instrument: number) {
    await this.start()
    if (this.status !== 'ready') return
    void this.ctx!.resume()
    this.send({ type: 'preview', channel, note, instrument })
  }

  previewOff(channel: number) {
    this.send({ type: 'previewOff', channel })
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
    soloMask(this.muted, this.soloed).forEach((muted, channel) => this.send({ type: 'mute', channel, muted }))
  }
}

export const engine = new ChipEngine()
