/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { instantiateChip, renderSong, unpackPosition, withBytes, type ChipExports } from '../audio/chip-wasm'
import { buildPattern, parseTrack } from './build'
import { encodeSong } from './encode'
import { EMPTY_CELL, NOTE_OFF, NOTE_RELEASE, emptySong, noteLabel, parseNote, songSeconds, type Song } from './model'
import { firstLight } from './templates'

let wasm: ChipExports

beforeAll(async () => {
  const bytes = readFileSync(new URL('../audio/chipcore.wasm', import.meta.url))
  wasm = await instantiateChip(await WebAssembly.compile(bytes))
})

const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length)

function playFor(song: Song, seconds: number, sampleRate = 48_000): Float32Array {
  const chip = wasm.chip_new(sampleRate)
  expect(withBytes(wasm, encodeSong(song), (p, l) => wasm.chip_load_song(chip, p, l))).toBe(0)
  wasm.chip_play_from(chip, 0, 0)
  const out = new Float32Array(Math.floor(seconds * sampleRate))
  for (let i = 0; i < out.length; i += 1024) {
    const n = Math.min(1024, out.length - i)
    out.set(new Float32Array(wasm.memory.buffer, wasm.chip_render(chip, n), n), i)
  }
  wasm.chip_free(chip)
  return out
}

describe('song notation', () => {
  it('parses notes, offs, releases, drums and modifiers', () => {
    const cells = parseTrack('C4 . - = k F#3:8:047', 1, { k: { note: 1, instrument: 5 } })
    expect(cells.map((c) => c.note)).toEqual([60, null, NOTE_OFF, NOTE_RELEASE, 1, 54])
    expect(cells[4].instrument).toBe(5)
    expect(cells[5]).toMatchObject({ instrument: 1, volume: 8, effect: '0', param: 0x47 })
  })

  it('rejects unknown tokens', () => {
    expect(() => parseTrack('H4', 0)).toThrow(/Unknown token/)
    expect(() => parseTrack('C4:zz', 0)).toThrow(/Unknown modifier/)
  })

  it('pads patterns and refuses overlong tracks', () => {
    expect(buildPattern(4, [parseTrack('C4', 0)]).channels[0][3]).toBe(EMPTY_CELL)
    expect(() => buildPattern(1, [parseTrack('C4 D4', 0)])).toThrow()
  })

  it('labels notes the tracker way', () => {
    expect(noteLabel(60)).toBe('C-4')
    expect(noteLabel(61)).toBe('C#4')
    expect(noteLabel(NOTE_OFF)).toBe('---')
    expect(noteLabel(NOTE_RELEASE)).toBe('===')
    expect(noteLabel(null)).toBe('...')
    expect(parseNote('Bb2')).toBe(46)
    expect(parseNote('X1')).toBeNull()
  })
})

describe('songs on the real chip (WASM)', () => {
  it('loads and plays the demo song', () => {
    expect(rms(playFor(firstLight(), 2))).toBeGreaterThan(0.05)
  })

  it('stays silent for an empty song', () => {
    expect(rms(playFor(emptySong(), 0.5))).toBe(0)
  })

  it('reports the playback position', () => {
    const chip = wasm.chip_new(48_000)
    withBytes(wasm, encodeSong(firstLight()), (p, l) => wasm.chip_load_song(chip, p, l))
    expect(unpackPosition(wasm.chip_position(chip))).toBeNull()
    wasm.chip_play_from(chip, 0, 8)
    wasm.chip_render(chip, 128)
    expect(unpackPosition(wasm.chip_position(chip))).toEqual({ order: 0, row: 8 })
    wasm.chip_free(chip)
  })

  it('rejects damaged songs with an error code', () => {
    const chip = wasm.chip_new(48_000)
    const bytes = encodeSong(firstLight())
    expect(withBytes(wasm, bytes.slice(0, 40), (p, l) => wasm.chip_load_song(chip, p, l))).toBe(-3)
    bytes[0] = 0
    expect(withBytes(wasm, bytes, (p, l) => wasm.chip_load_song(chip, p, l))).toBe(-1)
    wasm.chip_free(chip)
  })

  it('renders a song once through with its loop point', () => {
    const song: Song = {
      ...firstLight(),
      patterns: [firstLight().patterns[0], buildPattern(64, [parseTrack('E5', 0)])],
      order: [1, 0],
      loopPoint: 1,
    }
    const r = renderSong(wasm, encodeSong(song), 44_100)!
    const pattern = songSeconds(song) / 2
    expect(r.looped).toBe(true)
    expect(r.samples.length / 44_100).toBeCloseTo(2 * pattern, 2)
    expect(r.loopStart / 44_100).toBeCloseTo(pattern, 2)
  })

  it('returns null when asked to render garbage', () => {
    expect(renderSong(wasm, new Uint8Array([1, 2, 3]), 44_100)).toBeNull()
  })
})
