// SFX Lab controller: ties the synth, the library and audio playback together.

import { engine } from '../audio/engine.svelte'
import { loadChipModule } from '../audio/wasm'
import { readPref, writePref } from '../lib/prefs'
import { toast } from '../lib/toast.svelte'
import { download, zipSounds } from './export'
import { library } from './library.svelte'
import { editName, nextName, slugify, type SfxEntry } from './library-core'
import { presetLabel, presetsFor } from './params'
import { decodeShare, encodeShare } from './share'
import { fromFile, fromJsfxrCode, fromText, jsfxrLink, toJsfxrCode } from './jsfxr'
import { SfxSynth, type Engine, type SfxParams } from './synth'
import { encodeWav } from './wav'
import type { EncodeRequest, EncodeResponse } from '../export/encode-worker'
import EncodeWorker from '../export/encode-worker.ts?worker'

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]

export const EXPORT_RATES = [44_100, 48_000] as const
export type SfxFormat = 'wav' | 'ogg'
/** How many takes Variations adds. */
export const VARIATIONS = 8

function readLocks(): Set<string> {
  try {
    return new Set(JSON.parse(readPref('sfx.locks') ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

/** Share links for classic sounds carry a jsfxr code; this marks one in `openShared`. */
export const JSFXR_SHARE = 'jsfxr:'

export const engineOf = (entry: Pick<SfxEntry, 'engine'>): Engine => entry.engine ?? 'chip'

class SfxLab {
  synths = $state.raw<Record<Engine, SfxSynth> | null>(null)
  /** The engine new sounds are made with. */
  engine = $state<Engine>(readPref('sfx.engine') === 'classic' ? 'classic' : 'chip')
  status = $state<'loading' | 'ready' | 'error'>('loading')
  /** The selected sound, rendered at `renderedRate` for drawing and playback. */
  samples = $state.raw<Float32Array>(new Float32Array(0))
  renderedRate = $state(48_000)
  fineTuneOpen = $state(readPref('sfx.fineTune') === 'open')
  exportRate = $state<number>(Number(readPref('sfx.exportRate')) === 48_000 ? 48_000 : 44_100)
  exportFormat = $state<SfxFormat>(readPref('sfx.format') === 'ogg' ? 'ogg' : 'wav')
  /** Settings Mutate, Variations and new presets leave alone, as "engine:key". */
  locked = $state.raw<Set<string>>(readLocks())

  /** The entry slider edits go into; editing anything else forks it first. */
  private draftId: string | null = null
  private booting: Promise<void> | null = null

  init(shareCode: string | null): Promise<void> {
    this.booting ??= this.boot(shareCode)
    return this.booting
  }

  private async boot(shareCode: string | null) {
    try {
      this.synths = await SfxSynth.both(await loadChipModule())
      await library.load()
      if (shareCode) this.openShared(shareCode)
      if (library.entries.length === 0) this.create('coin', false)
      else if (!library.selected) library.select(library.entries[0].id)
      this.rerender()
      this.status = 'ready'
    } catch {
      this.status = 'error'
    }
  }

  get current() {
    return library.selected
  }

  /** The synth for the selected sound (fine-tune sliders come from it). */
  get synth(): SfxSynth | null {
    const current = this.current
    return this.synths && current ? this.synths[engineOf(current)] : null
  }

  private synthOf(entry: Pick<SfxEntry, 'engine'>): SfxSynth | null {
    return this.synths?.[engineOf(entry)] ?? null
  }

  /** Any sound, with its own engine (history thumbnails). */
  renderEntry(entry: SfxEntry, sampleRate: number): Float32Array {
    return this.synthOf(entry)?.render(entry.params, sampleRate) ?? new Float32Array(0)
  }

  setEngine(engine: Engine) {
    this.engine = engine
    writePref('sfx.engine', engine)
  }

  openShared(code: string) {
    if (code.startsWith(JSFXR_SHARE)) {
      const params = fromJsfxrCode(code.slice(JSFXR_SHARE.length))
      if (params) return this.addImported(params, 'Shared', 'shared')
    } else {
      const params = this.synths && decodeShare(code, this.synths.chip.specs)
      if (params) {
        library.add({ name: nextName(library.entries, 'Shared'), preset: 'shared', seed: null, params })
        this.draftId = null
        this.rerender()
        return this.notify('Opened a shared sound. Press Space to hear it.')
      }
    }
    this.notify('That share link is incomplete, so the sound could not be opened.')
  }

  /** Adds a classic sound from another tool (or a classic share link). */
  private addImported(raw: SfxParams, name: string, preset: 'shared' | 'imported') {
    const synth = this.synths?.classic
    if (!synth) return
    const params = synth.canonical({ ...synth.defaults(), ...raw })
    library.add({ name: nextName(library.entries, name), engine: 'classic', preset, seed: null, params })
    this.draftId = null
    this.rerender()
    void this.play()
    this.notify(preset === 'shared' ? 'Opened a shared sound.' : `Imported “${name}”. It plays exactly as it did in sfxr.`)
  }

  /** Pasted text: a jsfxr link or code, or jsfxr JSON. Returns false if it isn't one. */
  importText(text: string): boolean {
    const params = fromText(text)
    if (!params) return false
    this.addImported(params, 'Imported', 'imported')
    return true
  }

  /** .sfs (sfxr), .rfx (rFXGen) or .json / .txt (jsfxr) files. */
  async importFiles(files: Iterable<File>) {
    let failed = 0
    for (const file of files) {
      const params = await fromFile(file).catch(() => null)
      if (params) this.addImported(params, file.name.replace(/\.[^.]+$/, '') || 'Imported', 'imported')
      else failed++
    }
    if (failed) this.notify(`${failed === 1 ? 'One file wasn’t' : `${failed} files weren’t`} an sfxr, jsfxr or rFXGen sound.`)
  }

  rerender(rate = this.renderedRate) {
    const current = this.current
    const synth = current && this.synthOf(current)
    if (!current || !synth) {
      this.samples = new Float32Array(0)
      return
    }
    this.samples = synth.render(current.params, rate)
    this.renderedRate = rate
  }

  isLocked(engine: Engine, key: string): boolean {
    return this.locked.has(`${engine}:${key}`)
  }

  toggleLock(engine: Engine, key: string) {
    const next = new Set(this.locked)
    const id = `${engine}:${key}`
    if (next.has(id)) next.delete(id)
    else next.add(id)
    this.locked = next
    writePref('sfx.locks', JSON.stringify([...next]))
  }

  /** `params` with the locked settings copied from `from` (same engine only). */
  private keepLocked(engine: Engine, params: SfxParams, from: SfxParams | undefined): SfxParams {
    if (!from) return params
    const out = { ...params }
    for (const key of Object.keys(params)) if (this.isLocked(engine, key) && key in from) out[key] = from[key]
    return out
  }

  /** Adds close takes of the current sound to the history, to audition with ↑/↓. */
  variations(count = VARIATIONS) {
    const current = this.current
    const synth = current && this.synthOf(current)
    if (!current || !synth) return
    const engine = engineOf(current)
    // Named after the sound they came from: "Laser 3 take 1", "Laser 3 take 2", …
    const label = `${current.name.replace(/ take \d+$/, '')} take`
    let first: SfxEntry | null = null
    // Added oldest first, so the history lists them in order under the original.
    for (let i = 0; i < count; i++) {
      const params = this.keepLocked(engine, synth.mutate(current.params, randomSeed(), 0.15), current.params)
      const entry = library.add({
        name: nextName(library.entries, label),
        engine: current.engine,
        preset: current.preset,
        seed: null,
        params,
      })
      first ??= entry
    }
    if (first) library.select(first.id)
    this.draftId = null
    this.rerender()
    void this.play()
    this.notify(`Added ${count} variations. Press ↑ and ↓ to hear them, S to keep the ones you like.`)
  }

  private create(preset: string, play = true) {
    const synth = this.synths?.[this.engine]
    if (!synth) return
    const seed = randomSeed()
    const previous = this.current && engineOf(this.current) === this.engine ? this.current.params : undefined
    const params = this.keepLocked(this.engine, synth.generate(preset, seed), previous)
    const engine = this.engine === 'classic' ? ('classic' as const) : undefined
    library.add({ name: nextName(library.entries, presetLabel(preset)), engine, preset, seed, params })
    this.draftId = null
    this.rerender()
    if (play) void this.play()
  }

  generate(preset: string) {
    this.create(preset)
  }

  /** A preset by its key (1-9, 0, R) in the current engine. */
  generateKey(code: string): boolean {
    const preset = Object.entries(presetsFor(this.engine)).find(([, m]) => m.code === code)
    if (preset) this.create(preset[0])
    return !!preset
  }

  mutate() {
    const current = this.current
    const synth = current && this.synthOf(current)
    if (!current || !synth) return
    const params = this.keepLocked(engineOf(current), synth.mutate(current.params, randomSeed()), current.params)
    library.add({
      name: nextName(library.entries, presetLabel(current.preset)),
      engine: current.engine,
      preset: current.preset,
      seed: null,
      params,
    })
    this.draftId = null
    this.rerender()
    void this.play()
  }

  setParam(key: string, value: number, commit: boolean) {
    let current = this.current
    const synth = current && this.synthOf(current)
    if (!current || !synth) return
    if (this.draftId !== current.id) {
      current = library.add({ ...current, name: editName(current.name), seed: null, params: { ...current.params } })
      this.draftId = current.id
    }
    library.update(current.id, { params: { ...current.params, [key]: synth.clamp(key, value) } })
    this.rerender()
    if (commit) void this.play()
  }

  resetParam(key: string) {
    const spec = this.synth?.spec(key)
    if (spec) this.setParam(key, spec.default, true)
  }

  async play() {
    await engine.start()
    if (engine.status !== 'ready') return
    if (engine.sampleRate !== this.renderedRate) this.rerender(engine.sampleRate)
    engine.playSamples(this.samples, this.renderedRate)
  }

  select(id: string, play = true) {
    library.select(id)
    this.draftId = null
    this.rerender()
    if (play) void this.play()
  }

  move(delta: number) {
    const id = library.neighbor(delta)
    if (id && id !== library.selectedId) this.select(id)
  }

  toggleKeep(id = this.current?.id) {
    if (id) library.toggleStar(id)
  }

  rename(name: string) {
    const current = this.current
    if (current && name.trim()) library.update(current.id, { name: name.trim() })
  }

  /** WAV here; OGG in a worker (the Vorbis encoder is WebAssembly). */
  private async encode(samples: Float32Array, title: string, worker?: Worker): Promise<Uint8Array<ArrayBuffer>> {
    if (this.exportFormat === 'wav') return encodeWav(samples, this.exportRate)
    const own = worker ?? new EncodeWorker()
    try {
      const request: EncodeRequest = { samples, sampleRate: this.exportRate, format: 'ogg', title }
      const reply = await new Promise<EncodeResponse>((resolve) => {
        own.onmessage = (e: MessageEvent<EncodeResponse>) => resolve(e.data)
        own.onerror = () => resolve({ ok: false, error: 'The encoder stopped unexpectedly.' })
        own.postMessage(request, [samples.buffer])
      })
      if (!reply.ok) throw new Error(reply.error)
      return reply.bytes
    } finally {
      if (!worker) own.terminate()
    }
  }

  async exportSound() {
    const current = this.current
    const synth = current && this.synthOf(current)
    if (!current || !synth) return
    const samples = synth.render(current.params, this.exportRate)
    const file = `${slugify(current.name)}.${this.exportFormat}`
    try {
      const bytes = await this.encode(samples, current.name)
      download(bytes, file, this.exportFormat === 'wav' ? 'audio/wav' : 'audio/ogg')
      this.notify(`Saved ${file}`)
    } catch (err) {
      this.notify(`Export failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  setExportFormat(format: SfxFormat) {
    this.exportFormat = format
    writePref('sfx.format', format)
  }

  async exportKept() {
    if (!this.synths) return
    const kept = library.entries.filter((e) => e.starred)
    if (kept.length === 0) {
      this.notify('Keep a sound first: press S or its star.')
      return
    }
    const sounds = kept.map((entry) => ({ entry, samples: this.synthOf(entry)!.render(entry.params, this.exportRate) }))
    const worker = this.exportFormat === 'ogg' ? new EncodeWorker() : undefined
    try {
      const encoded: Uint8Array[] = []
      for (const s of sounds) encoded.push(await this.encode(s.samples.slice(), s.entry.name, worker))
      download(zipSounds(sounds, this.exportRate, this.exportFormat, encoded), 'chipforge-sfx.zip', 'application/zip')
      this.notify(`Saved chipforge-sfx.zip with ${kept.length} ${kept.length === 1 ? 'sound' : 'sounds'}`)
    } catch (err) {
      this.notify(`Export failed: ${err instanceof Error ? err.message : err}`)
    } finally {
      worker?.terminate()
    }
  }

  shareUrl(): string | null {
    const current = this.current
    const synth = current && this.synthOf(current)
    if (!current || !synth) return null
    // Classic sounds share as jsfxr codes, so the code also works in jsfxr itself.
    const query = engineOf(current) === 'classic' ? `x=${toJsfxrCode(current.params)}` : `s=${encodeShare(current.params, synth.specs)}`
    return `${location.origin}${location.pathname}#/sfx?${query}`
  }

  /** Copies a link that opens the selected classic sound in jsfxr (sfxr.me). */
  async copyJsfxr() {
    const current = this.current
    if (!current || engineOf(current) !== 'classic') return
    try {
      await navigator.clipboard.writeText(jsfxrLink(current.params))
      this.notify('Copied a jsfxr link (sfxr.me) for this sound.')
    } catch {
      this.notify('Your browser blocked the clipboard.')
    }
  }

  async copyLink() {
    const url = this.shareUrl()
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      this.notify('Link copied. Anyone who opens it hears this exact sound.')
    } catch {
      this.notify('Your browser blocked the clipboard. Copy the link from the address bar instead.')
      history.replaceState(null, '', url)
    }
  }

  toggleFineTune() {
    this.fineTuneOpen = !this.fineTuneOpen
    writePref('sfx.fineTune', this.fineTuneOpen ? 'open' : 'closed')
  }

  setExportRate(rate: number) {
    this.exportRate = rate
    writePref('sfx.exportRate', String(rate))
  }

  notify(text: string) {
    toast.show(text)
  }
}

export const lab = new SfxLab()
