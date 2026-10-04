// SFX Lab controller: ties the synth, the library and audio playback together.

import { engine } from '../audio/engine.svelte'
import { loadChipModule } from '../audio/wasm'
import { readPref, writePref } from '../lib/prefs'
import { toast } from '../lib/toast.svelte'
import { download, zipSounds } from './export'
import { library } from './library.svelte'
import { editName, nextName, slugify } from './library-core'
import { presetLabel } from './params'
import { decodeShare, encodeShare } from './share'
import { SfxSynth } from './synth'
import { encodeWav } from './wav'

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]

export const EXPORT_RATES = [44_100, 48_000] as const

class SfxLab {
  synth = $state.raw<SfxSynth | null>(null)
  status = $state<'loading' | 'ready' | 'error'>('loading')
  /** The selected sound, rendered at `renderedRate` for drawing and playback. */
  samples = $state.raw<Float32Array>(new Float32Array(0))
  renderedRate = $state(48_000)
  fineTuneOpen = $state(readPref('sfx.fineTune') === 'open')
  exportRate = $state<number>(Number(readPref('sfx.exportRate')) === 48_000 ? 48_000 : 44_100)

  /** The entry slider edits go into; editing anything else forks it first. */
  private draftId: string | null = null
  private booting: Promise<void> | null = null

  init(shareCode: string | null): Promise<void> {
    this.booting ??= this.boot(shareCode)
    return this.booting
  }

  private async boot(shareCode: string | null) {
    try {
      const synth = await SfxSynth.create(await loadChipModule())
      this.synth = synth
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

  openShared(code: string) {
    const params = this.synth && decodeShare(code, this.synth.specs)
    if (!params) {
      this.notify('That share link is incomplete, so the sound could not be opened.')
      return
    }
    library.add({ name: nextName(library.entries, 'Shared'), preset: 'shared', seed: null, params })
    this.draftId = null
    this.rerender()
    this.notify('Opened a shared sound. Press Space to hear it.')
  }

  rerender(rate = this.renderedRate) {
    const current = this.current
    if (!current || !this.synth) {
      this.samples = new Float32Array(0)
      return
    }
    this.samples = this.synth.render(current.params, rate)
    this.renderedRate = rate
  }

  private create(preset: string, play = true) {
    if (!this.synth) return
    const seed = randomSeed()
    const params = this.synth.generate(preset, seed)
    library.add({ name: nextName(library.entries, presetLabel(preset)), preset, seed, params })
    this.draftId = null
    this.rerender()
    if (play) void this.play()
  }

  generate(preset: string) {
    this.create(preset)
  }

  mutate() {
    const current = this.current
    if (!current || !this.synth) return
    const params = this.synth.mutate(current.params, randomSeed())
    library.add({ name: nextName(library.entries, presetLabel(current.preset)), preset: current.preset, seed: null, params })
    this.draftId = null
    this.rerender()
    void this.play()
  }

  setParam(key: string, value: number, commit: boolean) {
    let current = this.current
    if (!current || !this.synth) return
    if (this.draftId !== current.id) {
      current = library.add({ ...current, name: editName(current.name), seed: null, params: { ...current.params } })
      this.draftId = current.id
    }
    library.update(current.id, { params: { ...current.params, [key]: this.synth.clamp(key, value) } })
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

  exportWav() {
    const current = this.current
    if (!current || !this.synth) return
    const samples = this.synth.render(current.params, this.exportRate)
    const file = `${slugify(current.name)}.wav`
    download(encodeWav(samples, this.exportRate), file, 'audio/wav')
    this.notify(`Saved ${file}`)
  }

  exportKept() {
    const synth = this.synth
    if (!synth) return
    const kept = library.entries.filter((e) => e.starred)
    if (kept.length === 0) {
      this.notify('Keep a sound first: press S or its star.')
      return
    }
    const zip = zipSounds(
      kept.map((entry) => ({ entry, samples: synth.render(entry.params, this.exportRate) })),
      this.exportRate,
    )
    download(zip, 'chipforge-sfx.zip', 'application/zip')
    this.notify(`Saved chipforge-sfx.zip with ${kept.length} ${kept.length === 1 ? 'sound' : 'sounds'}`)
  }

  shareUrl(): string | null {
    const current = this.current
    if (!current || !this.synth) return null
    const code = encodeShare(current.params, this.synth.specs)
    return `${location.origin}${location.pathname}#/sfx?s=${code}`
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
