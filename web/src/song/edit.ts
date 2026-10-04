// Pure song edits. Every function returns a new Song (or the same one if nothing
// changed) and never mutates its input, so undo is a list of earlier songs.

import { CHANNEL_COUNT, EMPTY_CELL, NOTE_OFF, NOTE_RELEASE, type Cell, type Pattern, type Song } from './model'

/** An inclusive rectangle of cells in one pattern. */
export interface Region {
  fromChannel: number
  toChannel: number
  fromRow: number
  toRow: number
}

/** Copied cells: clip[channel][row]. */
export type Clip = Cell[][]

export function normalizeRegion(r: Region): Region {
  return {
    fromChannel: Math.min(r.fromChannel, r.toChannel),
    toChannel: Math.max(r.fromChannel, r.toChannel),
    fromRow: Math.min(r.fromRow, r.toRow),
    toRow: Math.max(r.fromRow, r.toRow),
  }
}

function withPattern(song: Song, index: number, pattern: Pattern): Song {
  if (song.patterns[index] === pattern) return song
  const patterns = song.patterns.slice()
  patterns[index] = pattern
  return { ...song, patterns }
}

/** Applies `fn` to every cell in the region; unchanged cells keep their identity. */
export function mapRegion(song: Song, patternIndex: number, region: Region, fn: (cell: Cell, channel: number, row: number) => Cell): Song {
  const r = normalizeRegion(region)
  const pattern = song.patterns[patternIndex]
  let changed = false
  const channels = pattern.channels.map((cells, ch) => {
    if (ch < r.fromChannel || ch > r.toChannel) return cells
    let copy: Cell[] | null = null
    for (let row = Math.max(0, r.fromRow); row <= Math.min(cells.length - 1, r.toRow); row++) {
      const next = fn(cells[row], ch, row)
      if (next !== cells[row]) {
        copy ??= cells.slice()
        copy[row] = next
      }
    }
    if (copy) changed = true
    return copy ?? cells
  })
  return changed ? withPattern(song, patternIndex, { channels }) : song
}

export function setCell(song: Song, patternIndex: number, channel: number, row: number, cell: Cell): Song {
  return mapRegion(song, patternIndex, { fromChannel: channel, toChannel: channel, fromRow: row, toRow: row }, () => cell)
}

export function updateCell(song: Song, patternIndex: number, channel: number, row: number, patch: Partial<Cell>): Song {
  const cell = song.patterns[patternIndex].channels[channel][row]
  const next = { ...cell, ...patch }
  const same = (Object.keys(patch) as (keyof Cell)[]).every((k) => cell[k] === next[k])
  return same ? song : setCell(song, patternIndex, channel, row, next)
}

export function clearRegion(song: Song, patternIndex: number, region: Region): Song {
  return mapRegion(song, patternIndex, region, (c) => (c === EMPTY_CELL ? c : EMPTY_CELL))
}

/** Moves notes by `semitones`, leaving offs, releases and the noise channel's range sane. */
export function transposeRegion(song: Song, patternIndex: number, region: Region, semitones: number): Song {
  return mapRegion(song, patternIndex, region, (c) => {
    if (c.note === null || c.note === NOTE_OFF || c.note === NOTE_RELEASE) return c
    const note = Math.min(127, Math.max(0, c.note + semitones))
    return note === c.note ? c : { ...c, note }
  })
}

export function copyRegion(song: Song, patternIndex: number, region: Region): Clip {
  const r = normalizeRegion(region)
  const pattern = song.patterns[patternIndex]
  return pattern.channels.slice(r.fromChannel, r.toChannel + 1).map((cells) => cells.slice(r.fromRow, r.toRow + 1))
}

/** Pastes with the clip's top-left at (channel, row); anything past the edges is dropped. */
export function pasteClip(song: Song, patternIndex: number, channel: number, row: number, clip: Clip): Song {
  const height = clip[0]?.length ?? 0
  const region = { fromChannel: channel, toChannel: channel + clip.length - 1, fromRow: row, toRow: row + height - 1 }
  return mapRegion(song, patternIndex, region, (_, ch, r) => clip[ch - channel]?.[r - row] ?? EMPTY_CELL)
}

/** Inserts an empty row in one channel, pushing the rest down (the last row falls off). */
export function insertRow(song: Song, patternIndex: number, channel: number, row: number): Song {
  const cells = song.patterns[patternIndex].channels[channel]
  const next = [...cells.slice(0, row), EMPTY_CELL, ...cells.slice(row, -1)]
  return replaceChannel(song, patternIndex, channel, next)
}

/** Deletes a row in one channel, pulling the rest up (an empty row appears at the end). */
export function deleteRow(song: Song, patternIndex: number, channel: number, row: number): Song {
  const cells = song.patterns[patternIndex].channels[channel]
  const next = [...cells.slice(0, row), ...cells.slice(row + 1), EMPTY_CELL]
  return replaceChannel(song, patternIndex, channel, next)
}

function replaceChannel(song: Song, patternIndex: number, channel: number, cells: Cell[]): Song {
  const channels = song.patterns[patternIndex].channels.slice()
  channels[channel] = cells
  return withPattern(song, patternIndex, { channels })
}

/** Changes every pattern's length, cutting or padding with empty rows. */
export function resizePatterns(song: Song, length: number): Song {
  if (length === song.patternLength) return song
  const fit = (cells: Cell[]) =>
    cells.length >= length ? cells.slice(0, length) : [...cells, ...Array<Cell>(length - cells.length).fill(EMPTY_CELL)]
  return {
    ...song,
    patternLength: length,
    patterns: song.patterns.map((p) => ({ channels: p.channels.map(fit) })),
  }
}

/** Sets one hex digit (0 = high nibble, 1 = low) of a byte value. */
export function setNibble(value: number, digit: 0 | 1, nibble: number): number {
  return digit === 0 ? ((nibble & 15) << 4) | (value & 15) : (value & 0xf0) | (nibble & 15)
}

export const allChannels = (song: Song, row = 0, toRow = song.patternLength - 1): Region => ({
  fromChannel: 0,
  toChannel: CHANNEL_COUNT - 1,
  fromRow: row,
  toRow,
})
