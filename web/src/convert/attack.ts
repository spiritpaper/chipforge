// How sharply each note starts: the rise in energy around its fundamental at its
// onset, in dB. A real attack jumps; a note the model split off a sustained one (often
// at a drum hit) barely changes, which lets cleanNotes join the pieces back up.

import { HOP, type Spectra } from './stft'
import type { HeardNote } from './transcribe'

export function measureAttacks(notes: HeardNote[], s: Spectra): HeardNote[] {
  return notes.map((n) => {
    const f0 = 440 * 2 ** ((n.pitch - 69) / 12)
    // ±1/3 semitone around the fundamental, at least one bin either side.
    const lo = Math.max(1, Math.floor((f0 * 0.98) / s.binHz) - 1)
    const hi = Math.min(s.bins - 1, Math.ceil((f0 * 1.02) / s.binHz) + 1)
    const energy = (frame: number) => {
      if (frame < 0 || frame >= s.frames) return 0
      let e = 0
      for (let b = lo; b <= hi; b++) e += s.mags[frame * s.bins + b] ** 2
      return e
    }
    // Frames are centred half a hop after they start.
    const f = Math.round((n.start * s.fps * HOP) / HOP - 1)
    const before = Math.max(energy(f - 3), energy(f - 2))
    const after = Math.max(energy(f), energy(f + 1), energy(f + 2))
    return { ...n, attack: 10 * Math.log10((after + 1e-9) / (before + 1e-9)) }
  })
}
