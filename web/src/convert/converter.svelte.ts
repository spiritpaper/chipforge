// Convert mode: the loaded recording, live playback through the Lo-fi Filter, export.

import { engine } from '../audio/engine.svelte'
import { readPref, writePref } from '../lib/prefs'
import { toast } from '../lib/toast.svelte'
import { download } from '../sfx/export'
import { slugify } from '../sfx/library-core'
import { peaks } from '../sfx/analysis'
import type { AudioFormat } from '../export/audio'
import type { EncodeRequest, EncodeResponse } from '../export/encode-worker'
import EncodeWorker from '../export/encode-worker.ts?worker'
import lofiWorkletUrl from './lofi-worklet.ts?worker&url'
import type { ToLofi } from './lofi-worklet'
import { AudioFileError, decodeFile, type DecodedAudio } from './audio-file'
import { LOFI_PRESETS, type LofiParams } from './lofi'

const OVERVIEW_BARS = 600

class Converter {
  status = $state<'empty' | 'decoding' | 'ready' | 'error'>('empty')
  error = $state<string | null>(null)
  audio = $state.raw<DecodedAudio | null>(null)
  overview = $state.raw<Float32Array>(new Float32Array(0))
  params = $state<LofiParams>({ ...LOFI_PRESETS[0].params })
  presetId = $state<string | null>(LOFI_PRESETS[0].id)
  /** A/B: hear the original instead of the filtered version. */
  original = $state(false)
  playing = $state(false)
  exportFormat = $state<AudioFormat>(readPref('convert.format') === 'ogg' ? 'ogg' : 'wav')
  exporting = $state(false)

  private source: AudioBufferSourceNode | null = null
  private node: AudioWorkletNode | null = null
  private buffer: AudioBuffer | null = null
  private startedAt = 0
  private offset = 0
  private ctx: AudioContext | null = null

  get seconds() {
    return this.audio ? this.audio.samples.length / this.audio.sampleRate : 0
  }

  /** Current playback position in seconds. */
  position(): number {
    if (!this.playing || !this.ctx) return this.offset
    return Math.min(this.seconds, this.offset + this.ctx.currentTime - this.startedAt)
  }

  async load(file: File) {
    this.pause()
    this.status = 'decoding'
    this.error = null
    try {
      const audio = await decodeFile(file)
      this.audio = audio
      this.overview = peaks(audio.samples, OVERVIEW_BARS)
      this.buffer = null
      this.offset = 0
      this.status = 'ready'
    } catch (err) {
      this.status = this.audio ? 'ready' : 'error'
      this.error = err instanceof AudioFileError ? err.message : 'That file could not be opened.'
    }
  }

  private async graph() {
    const out = await engine.output()
    if (!out || !this.audio) return null
    if (this.ctx !== out.ctx) {
      await out.ctx.audioWorklet.addModule(lofiWorkletUrl)
      this.node = new AudioWorkletNode(out.ctx, 'lofi', { outputChannelCount: [1] })
      this.node.connect(out.input)
      this.ctx = out.ctx
      this.sendAll()
    }
    if (!this.buffer || this.buffer.sampleRate !== this.audio.sampleRate) {
      const buf = out.ctx.createBuffer(1, this.audio.samples.length, this.audio.sampleRate)
      buf.copyToChannel(this.audio.samples as Float32Array<ArrayBuffer>, 0)
      this.buffer = buf
    }
    return { ctx: out.ctx, node: this.node! }
  }

  private send(msg: ToLofi) {
    this.node?.port.postMessage(msg)
  }

  private sendAll() {
    this.send({ type: 'params', params: $state.snapshot(this.params) })
    this.send({ type: 'bypass', on: this.original })
  }

  async play(from = this.offset) {
    const g = await this.graph()
    if (!g || !this.buffer) return
    this.stopSource()
    const source = new AudioBufferSourceNode(g.ctx, { buffer: this.buffer })
    source.connect(g.node)
    source.onended = () => {
      if (this.source === source) {
        this.playing = false
        this.offset = 0
        this.source = null
      }
    }
    this.offset = Math.min(Math.max(0, from), Math.max(0, this.seconds - 0.05))
    source.start(0, this.offset)
    this.startedAt = g.ctx.currentTime
    this.source = source
    this.playing = true
  }

  private stopSource() {
    const s = this.source
    this.source = null
    s?.stop()
  }

  pause() {
    if (!this.playing) return
    this.offset = this.position()
    this.stopSource()
    this.playing = false
  }

  togglePlay() {
    if (this.playing) this.pause()
    else void this.play()
  }

  seek(seconds: number) {
    const t = Math.min(Math.max(0, seconds), this.seconds)
    if (this.playing) void this.play(t)
    else this.offset = t
  }

  setOriginal(on: boolean) {
    this.original = on
    this.send({ type: 'bypass', on })
  }

  setParams(p: Partial<LofiParams>, presetId: string | null = null) {
    Object.assign(this.params, p)
    this.presetId = presetId
    this.send({ type: 'params', params: $state.snapshot(this.params) })
  }

  async exportFile() {
    const audio = this.audio
    if (!audio) return
    writePref('convert.format', this.exportFormat)
    this.exporting = true
    const worker = new EncodeWorker()
    try {
      const request: EncodeRequest = {
        samples: audio.samples.slice(),
        sampleRate: audio.sampleRate,
        format: this.exportFormat,
        title: `${audio.name} (8-bit)`,
        lofi: $state.snapshot(this.params),
      }
      const reply = await new Promise<EncodeResponse>((resolve) => {
        worker.onmessage = (e: MessageEvent<EncodeResponse>) => resolve(e.data)
        worker.onerror = () => resolve({ ok: false, error: 'The encoder stopped unexpectedly.' })
        worker.postMessage(request, [request.samples.buffer])
      })
      if (!reply.ok) {
        toast.show(`Export failed: ${reply.error}`)
        return
      }
      const file = `${slugify(audio.name)}-8bit.${this.exportFormat}`
      download(reply.bytes, file, this.exportFormat === 'wav' ? 'audio/wav' : 'audio/ogg')
      toast.show(`Saved ${file}`)
    } finally {
      worker.terminate()
      this.exporting = false
    }
  }
}

export const converter = new Converter()
