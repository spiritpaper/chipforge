import { strToU8, zipSync, type Zippable } from 'fflate'
import { encodeWav } from './wav'
import { uniqueFileNames, type SfxEntry } from './library-core'
import { isDesktop, saveFile } from '../lib/desktop'
import { toast } from '../lib/toast.svelte'

export interface RenderedSound {
  entry: SfxEntry
  samples: Float32Array
}

/**
 * A zip of sound files plus `sfx.json`, a manifest a game's build step can read. WAVs
 * are made here; for OGG pass the `encoded` files (one per sound).
 */
export function zipSounds(
  sounds: RenderedSound[],
  sampleRate: number,
  format: 'wav' | 'ogg' = 'wav',
  encoded?: Uint8Array[],
): Uint8Array<ArrayBuffer> {
  const files = uniqueFileNames(sounds.map((s) => s.entry.name), format)
  const zip: Zippable = {}
  const manifest = sounds.map(({ entry, samples }, i) => {
    zip[files[i]] = [encoded?.[i] ?? encodeWav(samples, sampleRate), { level: 0 }]
    return {
      name: entry.name,
      file: files[i],
      seconds: Number((samples.length / sampleRate).toFixed(4)),
      sampleRate,
      engine: entry.engine ?? 'chip',
      preset: entry.preset,
      seed: entry.seed,
      params: entry.params,
    }
  })
  zip['sfx.json'] = strToU8(JSON.stringify({ generator: 'ChipForge', version: 1, sounds: manifest }, null, 2))
  return zipSync(zip) as Uint8Array<ArrayBuffer>
}

export function download(data: BlobPart, filename: string, type: string) {
  if (isDesktop) {
    // Webviews don't save <a download> links; the desktop app opens a Save dialog.
    saveFile(data, filename).catch((err) => toast.show(`Couldn't save ${filename}: ${err}`))
    return
  }
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
