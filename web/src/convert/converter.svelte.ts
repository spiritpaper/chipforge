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
import { AudioFileError, decodeFile, decodeStereo, MAX_SPLIT_SECONDS, type DecodedAudio } from './audio-file'
import { LOFI_PRESETS, type LofiParams } from './lofi'
import { arrangeChip, type ArrangeOptions, type ChipResult } from './arrange'
import type { DrumHit } from './drums'
import { nearestBeat, type Rhythm } from './rhythm'
import { TRANSCRIBE_RATE, type HeardNote } from './transcribe'
import type { ListenMessage, ListenRequest, PartNotes } from './transcribe-worker'
import type { Backend, SeparateMessage, SeparateRequest } from './separate/worker'
import SeparateWorker from './separate/worker.ts?worker'
import { SOURCES, type Source } from './separate/demucs'
import { weightsCached } from './separate/weights'
import ListenWorker from './transcribe-worker.ts?worker'
import RenderWorker from '../export/render-worker.ts?worker'
import type { RenderRequest, RenderResponse } from '../export/render-worker'
import { loadChipModule } from '../audio/wasm'
import { encodeSong } from '../song/encode'
import { composer } from '../composer/composer.svelte'

export interface Heard {
  notes: HeardNote[]
  /** Notes per part, when the song was split. */
  parts?: PartNotes
  rhythm: Rhythm
  hits: DrumHit[]
  backend: string
}

/** Resamples mono audio with the browser's own high-quality resampler. */
async function resample(samples: Float32Array, from: number, to: number): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.ceil((samples.length * to) / from), to)
  const buffer = ctx.createBuffer(1, samples.length, from)
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
  const source = new AudioBufferSourceNode(ctx, { buffer })
  source.connect(ctx.destination)
  source.start()
  return (await ctx.startRendering()).getChannelData(0)
}

const OVERVIEW_BARS = 600

/** The parts a song splits into, in the order the panel lists them. */
export const PART_ORDER: { id: Source; label: string; channel: string }[] = [
  { id: 'vocals', label: 'Vocals', channel: 'melody on Pulse 1' },
  { id: 'other', label: 'Other instruments', channel: 'harmony on Pulse 2' },
  { id: 'bass', label: 'Bass', channel: 'Triangle' },
  { id: 'drums', label: 'Drums', channel: 'Noise' },
]

export interface Separating {
  stage: 'decoding' | 'download' | 'loading' | 'separating'
  fraction: number
  backend?: Backend
  /** Processor threads, when it runs on the processor. */
  threads?: number
}

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

  /** Which conversion the screen shows. */
  mode = $state<'lofi' | 'chip'>(readPref('convert.mode') === 'chip' ? 'chip' : 'lofi')
  listening = $state<{ stage: 'loading' | 'notes' | 'rhythm'; fraction: number; backend?: string } | null>(null)
  listenError = $state<string | null>(null)
  heard = $state.raw<Heard | null>(null)
  options = $state<ArrangeOptions>({ bpm: 120, origin: 0, detail: 'balanced', chords: true, drums: true })
  result = $state.raw<ChipResult | null>(null)
  /** Playing the chip version (through the song engine) rather than the recording. */
  chipPlaying = $state(false)

  /** Split the song into parts (Demucs) before listening for notes. */
  split = $state(readPref('convert.split') === 'on')
  /** Whether the Demucs model is already downloaded, so splitting is instant to start. */
  splitReady = $state(false)
  separating = $state<Separating | null>(null)
  /** The split song: each part as mono samples at the recording's rate. */
  parts = $state.raw<Record<Source, Float32Array> | null>(null)
  /** The part being listened to on its own, if any. */
  partPlaying = $state<Source | null>(null)
  private file: File | null = null

  private source: AudioBufferSourceNode | null = null
  private node: AudioWorkletNode | null = null
  private buffer: AudioBuffer | null = null
  private startedAt = 0
  private offset = 0
  private ctx: AudioContext | null = null

  get seconds() {
    return this.audio ? this.audio.samples.length / this.audio.sampleRate : 0
  }

  /** Seconds per row of the arranged song as it plays (its BPM is rounded). */
  private get chipRowSeconds() {
    return this.result ? 60 / this.result.song.bpm / this.result.song.rowsPerBeat : 0.125
  }

  /** Current playback position in seconds, in the recording's timeline. */
  position(): number {
    if (this.chipPlaying && engine.position && this.result) {
      const row = engine.position.order * this.result.song.patternLength + engine.position.row
      return this.options.origin + row * this.chipRowSeconds
    }
    if (this.partPlaying && this.partCtx) return Math.min(this.seconds, this.offset + this.partCtx.currentTime - this.startedAt)
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
      this.file = file
      this.parts = null
      this.overview = peaks(audio.samples, OVERVIEW_BARS)
      this.heard = null
      this.result = null
      this.listenError = null
      this.stopChip()
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
    if (this.mode === 'chip' && this.result) {
      if (this.chipPlaying || this.playing || this.partPlaying) this.stopAll()
      else if (this.original) void this.play()
      else void this.playChip()
      return
    }
    if (this.playing) this.pause()
    else void this.play()
  }

  seek(seconds: number) {
    const t = Math.min(Math.max(0, seconds), this.seconds)
    if (this.chipPlaying) void this.playChip(t)
    else if (this.playing) void this.play(t)
    else this.offset = t
  }

  private stopChip() {
    if (this.chipPlaying) engine.stop()
    this.chipPlaying = false
  }

  stopAll() {
    this.offset = this.position()
    this.pause()
    this.stopChip()
    this.stopPart()
  }

  /** Plays the arranged chip version from a time in the recording. */
  async playChip(from = this.offset) {
    const r = this.result
    if (!r) return
    this.offset = from
    this.pause()
    this.offset = from
    const row = Math.max(0, Math.round((from - this.options.origin) / this.chipRowSeconds))
    const order = Math.min(r.song.order.length - 1, Math.floor(row / r.song.patternLength))
    engine.setSong(r.song)
    await engine.play(order, row % r.song.patternLength)
    this.chipPlaying = true
  }

  setMode(mode: 'lofi' | 'chip') {
    this.stopAll()
    this.mode = mode
    writePref('convert.mode', mode)
    // In chip mode the A/B switch starts on the chip version; the filter isn't involved.
    this.setOriginal(false)
  }

  /** In chip mode, switches between the recording and the chip version in place. */
  compare(original: boolean) {
    if (this.mode !== 'chip') return this.setOriginal(original)
    const wasPlaying = this.playing || this.chipPlaying
    const at = this.position()
    this.stopAll()
    this.original = original
    // The recording plays unfiltered when compared with the chip version.
    this.send({ type: 'bypass', on: true })
    if (wasPlaying) void (original ? this.play(at) : this.playChip(at))
  }

  async listen() {
    const audio = this.audio
    if (!audio || this.listening) return
    this.listenError = null
    let parts: ListenRequest['parts']
    if (this.split) {
      const split = this.parts ?? (await this.separate())
      if (!split) return
      const at = async (id: Source) => resample(split[id], audio.sampleRate, TRANSCRIBE_RATE)
      parts = { vocals: await at('vocals'), other: await at('other'), bass: await at('bass'), drums: await at('drums') }
    }
    this.listening = { stage: 'loading', fraction: 0 }
    const worker = new ListenWorker()
    try {
      const samples = await resample(audio.samples, audio.sampleRate, TRANSCRIBE_RATE)
      const heard = await new Promise<Heard>((resolve, reject) => {
        // If the worker goes quiet (a crash inside the model), say so rather than hang.
        let watchdog = setTimeout(() => reject(new Error('the note finder stopped responding')), 60_000)
        worker.onmessage = (e: MessageEvent<ListenMessage>) => {
          const m = e.data
          clearTimeout(watchdog)
          watchdog = setTimeout(() => reject(new Error('the note finder stopped responding')), 60_000)
          if (m.type === 'progress') this.listening = { stage: m.stage, fraction: m.fraction, backend: m.backend }
          else if (m.type === 'done') resolve(m)
          else reject(new Error(m.error))
        }
        worker.onerror = () => reject(new Error('The note finder stopped unexpectedly.'))
        const request: ListenRequest = { samples, parts }
        const buffers = [samples, ...(parts ? Object.values(parts) : [])].map((a) => a.buffer)
        worker.postMessage(request, buffers)
      })
      this.heard = heard
      this.options = { ...this.options, bpm: Math.round(heard.rhythm.bpm * 10) / 10, origin: nearestBeat(heard.rhythm) }
      this.arrange()
    } catch (err) {
      this.listenError = err instanceof Error ? err.message : String(err)
    } finally {
      worker.terminate()
      this.listening = null
    }
  }

  setOptions(patch: Partial<ArrangeOptions>) {
    this.stopAll()
    this.options = { ...this.options, ...patch }
    this.arrange()
  }

  private arrange() {
    if (!this.heard || !this.audio) return
    this.result = arrangeChip(this.heard.notes, this.heard.hits, $state.snapshot(this.options), this.audio.name, this.heard.parts)
  }

  setSplit(on: boolean) {
    this.split = on
    writePref('convert.split', on ? 'on' : 'off')
    if (on) void this.checkSplitReady()
  }

  async checkSplitReady() {
    this.splitReady = await weightsCached().catch(() => false)
  }

  /** Splits the loaded song with Demucs; returns the parts, or null on failure. */
  private async separate(): Promise<Record<Source, Float32Array> | null> {
    const audio = this.audio
    const file = this.file
    if (!audio || !file) return null
    if (this.seconds > MAX_SPLIT_SECONDS) {
      this.listenError = `Songs up to ${MAX_SPLIT_SECONDS / 60} minutes can be split into parts; this one is ${Math.round(this.seconds / 60)}. Turn off "Split into parts" to convert it whole.`
      return null
    }
    this.separating = { stage: 'decoding', fraction: 0 }
    const worker = new SeparateWorker()
    try {
      const [left, right] = await decodeStereo(file)
      const same = left === right
      const request: SeparateRequest = { left, right: same ? left.slice() : right }
      const parts = await new Promise<Float32Array[]>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<SeparateMessage>) => {
          const m = e.data
          if (m.type === 'progress') this.separating = { stage: m.stage, fraction: m.fraction, backend: m.backend, threads: m.threads }
          else if (m.type === 'done') resolve(m.parts)
          else reject(new Error(m.error))
        }
        worker.onerror = () => reject(new Error('The part splitter stopped unexpectedly (the device may be out of memory).'))
        worker.postMessage(request, [request.left.buffer, request.right.buffer])
      })
      const split = Object.fromEntries(SOURCES.map((id, i) => [id, parts[i]])) as Record<Source, Float32Array>
      // Only keep them if the same song is still loaded.
      if (this.audio === audio) this.parts = split
      this.splitReady = true
      return split
    } catch (err) {
      this.listenError = `Splitting failed: ${err instanceof Error ? err.message : String(err)}`
      return null
    } finally {
      worker.terminate()
      this.separating = null
    }
  }

  /** Listens to one part on its own (or stops it). */
  async togglePart(id: Source) {
    const playing = this.partPlaying
    this.stopAll()
    if (playing === id || !this.parts || !this.audio) return
    const out = await engine.output()
    if (!out) return
    const buffer = out.ctx.createBuffer(1, this.parts[id].length, this.audio.sampleRate)
    buffer.copyToChannel(this.parts[id] as Float32Array<ArrayBuffer>, 0)
    const source = new AudioBufferSourceNode(out.ctx, { buffer })
    source.connect(out.input)
    source.onended = () => {
      if (this.partSource === source) this.stopPart()
    }
    this.offset = Math.min(this.offset, Math.max(0, this.seconds - 0.05))
    source.start(0, this.offset)
    this.startedAt = out.ctx.currentTime
    this.partCtx = out.ctx
    this.partSource = source
    this.partPlaying = id
  }

  private partSource: AudioBufferSourceNode | null = null
  private partCtx: AudioContext | null = null

  private stopPart() {
    const s = this.partSource
    this.partSource = null
    this.partPlaying = null
    s?.stop()
  }

  /** Starts over with the split setting changed: the notes have to be heard again. */
  redo() {
    this.stopAll()
    this.heard = null
    this.result = null
    void this.listen()
  }

  /** Includes or leaves out a part of the split song, and re-arranges. */
  usePart(id: Source, on: boolean) {
    const parts = { vocals: true, other: true, bass: true, drums: true, ...this.options.parts, [id]: on }
    this.setOptions({ parts })
  }

  async exportPart(id: Source) {
    const audio = this.audio
    const samples = this.parts?.[id]
    if (!audio || !samples) return
    writePref('convert.format', this.exportFormat)
    this.exporting = true
    const worker = new EncodeWorker()
    try {
      const request: EncodeRequest = {
        samples: samples.slice(),
        sampleRate: audio.sampleRate,
        format: this.exportFormat,
        title: `${audio.name} (${id})`,
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
      const file = `${slugify(audio.name)}-${id}.${this.exportFormat}`
      download(reply.bytes, file, this.exportFormat === 'wav' ? 'audio/wav' : 'audio/ogg')
      toast.show(`Saved ${file}`)
    } finally {
      worker.terminate()
      this.exporting = false
    }
  }

  async openInComposer() {
    if (!this.result) return
    this.stopAll()
    await composer.init()
    await composer.create(structuredClone(this.result.song))
    location.hash = '#/compose'
  }

  async exportChip() {
    const r = this.result
    if (!r) return
    writePref('convert.format', this.exportFormat)
    this.exporting = true
    const worker = new RenderWorker()
    try {
      const request: RenderRequest = {
        module: await loadChipModule(),
        song: encodeSong(r.song),
        title: r.song.title,
        sampleRate: 44_100,
        format: this.exportFormat,
        ending: 'loop',
      }
      const reply = await new Promise<RenderResponse>((resolve) => {
        worker.onmessage = (e: MessageEvent<RenderResponse>) => resolve(e.data)
        worker.onerror = () => resolve({ ok: false, error: 'The renderer stopped unexpectedly.' })
        worker.postMessage(request, [request.song.buffer])
      })
      if (!reply.ok) {
        toast.show(`Export failed: ${reply.error}`)
        return
      }
      const file = `${slugify(r.song.title)}-chip.${this.exportFormat}`
      download(reply.bytes, file, this.exportFormat === 'wav' ? 'audio/wav' : 'audio/ogg')
      toast.show(`Saved ${file}`)
    } finally {
      worker.terminate()
      this.exporting = false
    }
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
