// Order-list (arrangement) edits. The loop point follows the entry it points at.

import { LIMITS, emptyPattern, type Song } from './model'

const full = (song: Song) => song.order.length >= LIMITS.order

/** Inserts `pattern` into the order after `at`. */
function insertEntry(song: Song, at: number, pattern: number): Song {
  const order = [...song.order.slice(0, at + 1), pattern, ...song.order.slice(at + 1)]
  return { ...song, order, loopPoint: song.loopPoint > at ? song.loopPoint + 1 : song.loopPoint }
}

/** A new empty pattern, played after order entry `at`. */
export function addPatternAfter(song: Song, at: number): Song {
  if (full(song) || song.patterns.length >= LIMITS.patterns) return song
  const patterns = [...song.patterns, emptyPattern(song.patternLength)]
  return insertEntry({ ...song, patterns }, at, patterns.length - 1)
}

/** A copy of the pattern at order entry `at`, played right after it. */
export function duplicatePatternAt(song: Song, at: number): Song {
  if (full(song) || song.patterns.length >= LIMITS.patterns) return song
  const source = song.patterns[song.order[at]]
  const patterns = [...song.patterns, { channels: source.channels.map((c) => c.slice()) }]
  return insertEntry({ ...song, patterns }, at, patterns.length - 1)
}

/** Plays the same pattern again right after entry `at` (edits affect both). */
export function repeatAt(song: Song, at: number): Song {
  return full(song) ? song : insertEntry(song, at, song.order[at])
}

export function removeEntry(song: Song, at: number): Song {
  if (song.order.length <= 1) return song
  const order = song.order.filter((_, i) => i !== at)
  const loopPoint = song.loopPoint > at ? song.loopPoint - 1 : Math.min(song.loopPoint, order.length - 1)
  return { ...song, order, loopPoint }
}

/** Moves entry `from` to position `to`, keeping the loop on the same entry. */
export function moveEntry(song: Song, from: number, to: number): Song {
  const target = Math.min(song.order.length - 1, Math.max(0, to))
  if (from === target) return song
  const ids = song.order.map((_, i) => i)
  const [moved] = ids.splice(from, 1)
  ids.splice(target, 0, moved)
  return { ...song, order: ids.map((i) => song.order[i]), loopPoint: ids.indexOf(song.loopPoint) }
}

/** Points entry `at` at another pattern, creating empty ones if needed. */
export function setEntryPattern(song: Song, at: number, pattern: number): Song {
  const p = Math.min(LIMITS.patterns - 1, Math.max(0, pattern))
  let patterns = song.patterns
  if (p >= patterns.length) {
    patterns = [...patterns, ...Array.from({ length: p - patterns.length + 1 }, () => emptyPattern(song.patternLength))]
  }
  const order = song.order.slice()
  order[at] = p
  return { ...song, patterns, order }
}

export function setLoopPoint(song: Song, at: number): Song {
  return { ...song, loopPoint: Math.min(song.order.length - 1, Math.max(0, at)) }
}

/** How many order entries play each pattern. */
export function patternUses(song: Song): number[] {
  const uses = song.patterns.map(() => 0)
  for (const p of song.order) uses[p]++
  return uses
}
