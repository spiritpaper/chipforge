/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { instantiateChip, renderSong, type ChipExports } from '../audio/chip-wasm'
import { encodeSong } from '../song/encode'
import { buildPattern, parseTrack } from '../song/build'
import { firstLight } from '../song/templates'
import { oggCrc, readComments, readPages } from './ogg'
import { fitToLength, oggFile, shapeAudio, wavFile } from './audio'

let wasm: ChipExports
const SR = 22_050
// The Ogg encoder binary, as the browser would fetch it.
const oggWasm = readFileSync(new URL('../../node_modules/wasm-media-encoders/wasm/ogg.wasm', import.meta.url))

beforeAll(async () => {
  wasm = await instantiateChip(await WebAssembly.compile(readFileSync(new URL('../audio/chipcore.wasm', import.meta.url))))
})

/** Intro pattern, then a looping pattern: loop starts after one pattern. */
function rendered() {
  const song = firstLight()
  const withIntro = { ...song, patterns: [...song.patterns, buildPattern(64, [parseTrack('E5', 0)])], order: [1, 0], loopPoint: 1 }
  return renderSong(wasm, encodeSong(withIntro), SR)!
}

let ffprobe = true
try {
  execFileSync('ffprobe', ['-version'])
} catch {
  ffprobe = false
}

describe('audio export', () => {
  it('keeps loop points for engines and adds a faded ending for listening', () => {
    const r = rendered()
    const loop = shapeAudio(r, SR, 'loop')
    expect(loop.samples.length).toBe(r.samples.length)
    expect(loop.loop).toEqual({ start: r.loopStart, length: r.samples.length - r.loopStart })
    const fade = shapeAudio(r, SR, 'fade')
    expect(fade.loop).toBeNull()
    expect(fade.samples.length).toBe(2 * r.samples.length - r.loopStart)
    expect(fade.samples.at(-1)).toBe(0)
  })

  it('fits a song to an exact length, repeating its loop and fading out', () => {
    const r = { samples: Float32Array.from({ length: 300 }, (_, i) => (i < 100 ? 0.5 : 1)), loopStart: 100, looped: true }
    const out = fitToLength(r, 100, 7) // 700 samples: intro, then the loop three and a half times
    expect(out.length).toBe(700)
    expect(out[50]).toBe(0.5)
    expect(out[350]).toBe(1) // the loop again, not the intro
    expect(out[699]).toBeCloseTo(1 / 140) // faded over the last fifth
    expect(fitToLength(r, 100, 1).length).toBe(100) // shorter than the song: cut and faded
    expect(fitToLength({ ...r, looped: false }, 100, 7)[350]).toBe(0.5) // no loop: the whole song repeats
  })

  it('writes a smpl loop chunk into WAV files', () => {
    const r = rendered()
    const bytes = wavFile(shapeAudio(r, SR, 'loop'), SR)
    const view = new DataView(bytes.buffer)
    const smpl = 44 + r.samples.length * 2
    expect(new TextDecoder().decode(bytes.subarray(smpl, smpl + 4))).toBe('smpl')
    expect(view.getUint32(4, true)).toBe(bytes.length - 8)
    expect(view.getUint32(smpl + 8 + 28, true)).toBe(1)
    expect(view.getUint32(smpl + 8 + 36 + 8, true)).toBe(r.loopStart)
    expect(view.getUint32(smpl + 8 + 36 + 12, true)).toBe(r.samples.length - 1)
  })

  it('writes Ogg Vorbis with loop tags and valid page checksums', async () => {
    const r = rendered()
    const bytes = await oggFile(shapeAudio(r, SR, 'loop'), SR, 'Test', oggWasm)
    expect(readComments(bytes)).toEqual(['TITLE=Test', 'ENCODER=ChipForge', `LOOPSTART=${r.loopStart}`, `LOOPLENGTH=${r.samples.length - r.loopStart}`])
    let pos = 0
    for (const _ of readPages(bytes)) {
      const n = bytes[pos + 26]
      const len = [...bytes.subarray(pos + 27, pos + 27 + n)].reduce((s, x) => s + x, 0)
      const page = bytes.slice(pos, pos + 27 + n + len)
      const stored = new DataView(page.buffer).getUint32(22, true)
      page.fill(0, 22, 26)
      expect(oggCrc(page)).toBe(stored)
      pos += 27 + n + len
    }
  })

  it.skipIf(!ffprobe)('produces files ffprobe reads, with the right length and tags', async () => {
    const r = rendered()
    const dir = mkdtempSync(join(tmpdir(), 'chipforge-'))
    const ogg = join(dir, 'song.ogg')
    const wav = join(dir, 'song.wav')
    writeFileSync(ogg, await oggFile(shapeAudio(r, SR, 'loop'), SR, 'Test', oggWasm))
    writeFileSync(wav, wavFile(shapeAudio(r, SR, 'loop'), SR))
    const probe = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', f]).toString())
    const o = probe(ogg)
    expect(o.streams[0].codec_name).toBe('vorbis')
    expect(Number(o.format.duration)).toBeCloseTo(r.samples.length / SR, 1)
    const tags = Object.fromEntries(Object.entries(o.streams[0].tags ?? o.format.tags).map(([k, v]) => [k.toUpperCase(), v]))
    expect(tags.LOOPSTART).toBe(String(r.loopStart))
    const w = probe(wav)
    expect(Number(w.streams[0].sample_rate)).toBe(SR)
    expect(Number(w.format.duration)).toBeCloseTo(r.samples.length / SR, 2)
  })
})
