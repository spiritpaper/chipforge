// Stems: the song once per channel with the others silent, for video editors (turn the
// melody down under a voice-over) and game audio tools (layers that fade in and out).

import { channelsFor } from '../audio/channels'
import { CHANNEL_COUNT, EMPTY_CELL, type Cell, type Song } from '../song/model'

/** Effects that change where or how fast the song plays; silent channels keep them. */
const TIMING = new Set(['B', 'D', 'F'])

function silent(cell: Cell): Cell {
  return cell.effect !== null && TIMING.has(cell.effect) ? { ...EMPTY_CELL, effect: cell.effect, param: cell.param } : EMPTY_CELL
}

/** The song with only `channel` playing (its timing stays identical to the full song). */
export function soloChannel(song: Song, channel: number): Song {
  return {
    ...song,
    patterns: song.patterns.map((p) => ({
      channels: p.channels.map((cells, ch) => (ch === channel ? cells : cells.map(silent))),
    })),
  }
}

/** One song per channel that has notes, named after the channel ("pulse-1", "noise"…). */
export function stemSongs(song: Song): { name: string; song: Song }[] {
  const names = channelsFor(song.chip).map((c) => c.name.toLowerCase().replace(/\s+/g, '-'))
  return Array.from({ length: CHANNEL_COUNT }, (_, ch) => ch)
    .filter((ch) => song.order.some((p) => song.patterns[p].channels[ch].some((c) => c.note !== null && c.note >= 0)))
    .map((ch) => ({ name: names[ch], song: soloChannel(song, ch) }))
}
