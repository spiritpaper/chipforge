/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { instantiateChip, renderSong, type ChipExports } from '../audio/chip-wasm'
import { encodeSong } from './encode'
import { TEMPLATES } from './templates'
import { validateSong } from './validate'

let wasm: ChipExports
beforeAll(async () => {
  wasm = await instantiateChip(await WebAssembly.compile(readFileSync(new URL('../audio/chipcore.wasm', import.meta.url))))
})

const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length)

describe('templates', () => {
  it.each(TEMPLATES)('$title builds a valid song', ({ create }) => {
    const song = create()
    expect(validateSong(JSON.parse(JSON.stringify(song)))).toEqual(song)
  })

  it.each(TEMPLATES.filter((t) => t.id !== 'empty'))('$title plays on the chip and loops', ({ create }) => {
    const r = renderSong(wasm, encodeSong(create()), 22_050)!
    expect(r.looped).toBe(true)
    expect(rms(r.samples)).toBeGreaterThan(0.05)
  })

  it('gives each song fresh instruments', () => {
    const [a, b] = [TEMPLATES[1].create(), TEMPLATES[1].create()]
    a.instruments[0].volume.values.push(1)
    expect(b.instruments[0].volume.values).not.toEqual(a.instruments[0].volume.values)
  })
})
