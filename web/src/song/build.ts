// A compact text notation for writing songs in code (templates, tests).
//
// Tokens, one per row, separated by whitespace:
//   C5  F#3  Bb2   note (with the track's instrument)
//   .              nothing
//   -              note off       =   release
//   k s h          drum hits defined by the caller
// Any token may carry ":v" (volume, hex digit) and/or ":Fxx" (effect), e.g. "C5:8:047".

import { CHANNEL_COUNT, EMPTY_CELL, NOTE_OFF, NOTE_RELEASE, parseNote, type Cell } from './model'

export type Drums = Record<string, { note: number; instrument: number }>

export function parseTrack(src: string, instrument: number, drums: Drums = {}): Cell[] {
  return src
    .trim()
    .split(/\s+/)
    .map((token) => {
      const [head, ...mods] = token.split(':')
      let cell: Cell = { ...EMPTY_CELL }
      if (head === '-') cell.note = NOTE_OFF
      else if (head === '=') cell.note = NOTE_RELEASE
      else if (drums[head]) cell = { ...cell, ...drums[head] }
      else if (head !== '.') {
        const note = parseNote(head)
        if (note === null) throw new Error(`Unknown token "${token}"`)
        cell = { ...cell, note, instrument }
      }
      for (const mod of mods) {
        if (/^[0-9A-F]$/i.test(mod)) cell.volume = parseInt(mod, 16)
        else if (/^[0-9A-Z][0-9A-F]{2}$/i.test(mod)) cell = { ...cell, effect: mod[0].toUpperCase(), param: parseInt(mod.slice(1), 16) }
        else throw new Error(`Unknown modifier "${mod}" in "${token}"`)
      }
      return Object.freeze(cell)
    })
}

/**
 * A pattern from four tracks; shorter tracks are padded with empty rows unless
 * `strict`, which demands every track fill the pattern exactly (catches miscounts).
 */
export function buildPattern(length: number, tracks: Cell[][], strict = false): { channels: Cell[][] } {
  return {
    channels: Array.from({ length: CHANNEL_COUNT }, (_, ch) => {
      const cells = tracks[ch] ?? []
      if (cells.length > length || (strict && cells.length !== length)) {
        throw new Error(`Track ${ch} has ${cells.length} rows, pattern has ${length}`)
      }
      return [...cells, ...Array<Cell>(length - cells.length).fill(EMPTY_CELL)]
    }),
  }
}
