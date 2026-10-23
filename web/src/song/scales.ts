// Keys and scales, so people who don't read music can stay in tune: the piano roll
// shades notes outside the song's scale and can snap new notes into it.

import { NOTE_OFF, NOTE_RELEASE, type Song } from './model'

export const SCALES = {
  major: { label: 'Major', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: 'Minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  harmonicMinor: { label: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11] },
  dorian: { label: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  mixolydian: { label: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
  majorPentatonic: { label: 'Major pentatonic', steps: [0, 2, 4, 7, 9] },
  minorPentatonic: { label: 'Minor pentatonic', steps: [0, 3, 5, 7, 10] },
  blues: { label: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
} as const

export type ScaleName = keyof typeof SCALES

export interface SongKey {
  /** 0 = C … 11 = B. */
  root: number
  scale: ScaleName
}

export const ROOT_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

export const keyLabel = (k: SongKey) => `${ROOT_NAMES[k.root]} ${SCALES[k.scale].label.toLowerCase()}`

export function isScaleName(x: unknown): x is ScaleName {
  return typeof x === 'string' && x in SCALES
}

export function inScale(note: number, key: SongKey): boolean {
  return (SCALES[key.scale].steps as readonly number[]).includes((((note - key.root) % 12) + 12) % 12)
}

/** The nearest note of the scale (ties go up, so a sharp moves to its upper neighbour). */
export function snapToScale(note: number, key: SongKey): number {
  for (let d = 0; d < 12; d++) {
    if (inScale(note + d, key)) return note + d
    if (inScale(note - d, key)) return note - d
  }
  return note
}

// Krumhansl-Kessler key profiles: how strongly each scale degree belongs to a key.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

function correlation(a: number[], b: number[]): number {
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length
  const [ma, mb] = [mean(a), mean(b)]
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

/**
 * The major or minor key the song's melodic notes fit best, weighting each note by how
 * long it lasts (the noise channel is ignored). Null for a song with too few notes.
 */
export function detectKey(song: Song): SongKey | null {
  const weight = Array(12).fill(0)
  let notes = 0
  for (const p of song.order) {
    for (const cells of song.patterns[p].channels.slice(0, 3)) {
      let current = -1
      for (const cell of cells) {
        if (cell.note === NOTE_OFF || cell.note === NOTE_RELEASE) current = -1
        else if (cell.note !== null) {
          current = cell.note % 12
          notes++
        }
        if (current >= 0) weight[current]++
      }
    }
  }
  if (notes < 8) return null
  // The first bass note (or first note, without a bass), which usually is the home note.
  const firstOf = (channels: number[]) => {
    for (const p of song.order)
      for (let row = 0; row < song.patternLength; row++)
        for (const ch of channels) {
          const n = song.patterns[p].channels[ch][row].note
          if (n !== null && n >= 0) return n % 12
        }
    return -1
  }
  const home = firstOf([2]) >= 0 ? firstOf([2]) : firstOf([0, 1])
  const total = weight.reduce((a, b) => a + b, 0) || 1
  let best: SongKey | null = null
  let bestScore = -Infinity
  for (let root = 0; root < 12; root++) {
    const rotated = weight.slice(root).concat(weight.slice(0, root))
    for (const [scale, profile] of [['major', MAJOR_PROFILE], ['minor', MINOR_PROFILE]] as const) {
      // Keys whose scale leaves out notes the song plays lose points: the profiles alone
      // can favour a neighbouring key that shares the song's main chords.
      const steps = SCALES[scale].steps as readonly number[]
      const outside = rotated.reduce((sum, w, degree) => sum + (steps.includes(degree) ? 0 : w), 0) / total
      const score = correlation(rotated, profile) - 2 * outside
      if (score > bestScore) [best, bestScore] = [{ root, scale }, score]
    }
  }
  // A major key and its relative minor share every note; the opening bass note decides.
  if (best) {
    const relative: SongKey = best.scale === 'major' ? { root: (best.root + 9) % 12, scale: 'minor' } : { root: (best.root + 3) % 12, scale: 'major' }
    if (home === relative.root && home !== best.root) return relative
  }
  return best
}
