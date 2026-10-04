import { strToU8, zipSync, type Zippable } from 'fflate'
import { encodeWav } from './wav'
import { uniqueFileNames, type SfxEntry } from './library-core'

export interface RenderedSound {
  entry: SfxEntry
  samples: Float32Array
}

/** A zip of WAVs plus `sfx.json`, a manifest a game's build step can read. */
export function zipSounds(sounds: RenderedSound[], sampleRate: number): Uint8Array<ArrayBuffer> {
  const files = uniqueFileNames(sounds.map((s) => s.entry.name), 'wav')
  const zip: Zippable = {}
  const manifest = sounds.map(({ entry, samples }, i) => {
    zip[files[i]] = [encodeWav(samples, sampleRate), { level: 0 }]
    return {
      name: entry.name,
      file: files[i],
      seconds: Number((samples.length / sampleRate).toFixed(4)),
      sampleRate,
      preset: entry.preset,
      seed: entry.seed,
      params: entry.params,
    }
  })
  zip['sfx.json'] = strToU8(JSON.stringify({ generator: 'ChipForge', version: 1, sounds: manifest }, null, 2))
  return zipSync(zip) as Uint8Array<ArrayBuffer>
}

export function download(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
