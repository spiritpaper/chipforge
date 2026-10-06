import { describe, expect, it } from 'vitest'
import { detectRhythm, nearestBeat } from './rhythm'
import { detectDrums } from './drums'
import { arrangeChip, cleanNotes } from './arrange'
import { measureAttacks } from './attack'
import { stft } from './stft'
import { validateSong } from '../song/validate'
import { segments } from '../lib/grid'

const SR = 22_050

/** Deterministic noise so tests don't flake. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1
}

function kick(out: Float32Array, at: number, amp = 0.8) {
  const s0 = Math.floor(at * SR)
  // Long enough to decay to silence: a hard cut would itself be a click.
  for (let i = 0; i < 0.5 * SR && s0 + i < out.length; i++) {
    const t = i / SR
    out[s0 + i] += amp * Math.exp(-t * 25) * Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-t * 30)) * t)
  }
}

function noise(out: Float32Array, at: number, amp: number, decay: number, highpass: boolean, rand: () => number) {
  const s0 = Math.floor(at * SR)
  let prev = 0
  for (let i = 0; i < (8 / decay) * SR && s0 + i < out.length; i++) {
    const x = rand()
    out[s0 + i] += amp * Math.exp(-(i / SR) * decay) * (highpass ? x - prev : x)
    prev = x
  }
}

function tone(out: Float32Array, at: number, dur: number, midi: number, amp = 0.2) {
  const f = 440 * 2 ** ((midi - 69) / 12)
  const s0 = Math.floor(at * SR)
  for (let i = 0; i < dur * SR && s0 + i < out.length; i++) {
    const t = i / SR
    // Fade the last 50 ms so the tone ends without a click.
    const tail = Math.min(1, (dur - t) / 0.05)
    out[s0 + i] += amp * Math.min(1, t * 200) * tail * Math.exp(-t * 2) * (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t))
  }
}

/** A beat at `bpm`: kick on 1 and 3, snare on 2 and 4, hats on eighths, starting late. */
function groove(bpm: number, seconds: number, offset: number, withChords = false) {
  const out = new Float32Array(Math.floor(seconds * SR))
  const rand = rng(7)
  const beat = 60 / bpm
  for (let b = 0; offset + b * beat < seconds - 0.2; b++) {
    const t = offset + b * beat
    if (b % 2 === 0) kick(out, t)
    else noise(out, t, 0.4, 30, false, rand)
    noise(out, t + beat / 2, 0.15, 90, true, rand)
    if (withChords && b % 4 === 0) [60, 64, 67].forEach((m) => tone(out, t + 0.01, beat * 2, m))
  }
  return out
}

describe('rhythm', () => {
  it.each([96, 120, 128, 150])('finds %i BPM and the beat grid', (bpm) => {
    const offset = 0.37
    const r = detectRhythm(groove(bpm, 12, offset), SR)
    expect(Math.abs(r.bpm - bpm)).toBeLessThan(1.5)
    const beat = 60 / bpm
    const phaseError = Math.abs(((r.firstBeat - offset) / beat + 0.5) % 1 - 0.5) * beat
    expect(phaseError).toBeLessThan(0.03)
  })
})

describe('drums', () => {
  it('tells kicks, snares and hats apart, and ignores chords', () => {
    const bpm = 120
    const hits = detectDrums(groove(bpm, 8, 0.5, true), SR)
    const near = (t: number, kind: string) => hits.some((h) => h.kind === kind && Math.abs(h.time - t) < 0.04)
    const beat = 60 / bpm
    let kicks = 0
    let snares = 0
    let hats = 0
    let expected = 0
    for (let b = 0; 0.5 + b * beat < 7.8; b++) {
      const t = 0.5 + b * beat
      expected++
      if (b % 2 === 0 && near(t, 'kick')) kicks++
      if (b % 2 === 1 && near(t, 'snare')) snares++
      if (near(t + beat / 2, 'hat')) hats++
    }
    expect(kicks).toBeGreaterThanOrEqual(Math.floor(expected / 2) - 1)
    expect(snares).toBeGreaterThanOrEqual(Math.floor(expected / 2) - 1)
    expect(hats).toBeGreaterThanOrEqual(expected - 3)
    // No snare where only a chord starts without a drum (chords land with kicks here).
    const falseSnares = hits.filter((h) => h.kind === 'snare' && !Array.from({ length: expected }, (_, b) => 0.5 + b * beat).some((t) => Math.abs(t - h.time) < 0.04))
    expect(falseSnares.length).toBeLessThanOrEqual(1)
  })
})

describe('arrangeChip', () => {
  const rowSec = 60 / 120 / 4
  const note = (row: number, len: number, pitch: number, amplitude = 0.8) => ({ start: row * rowSec, duration: len * rowSec, pitch, amplitude })

  it('splits melody, chords and bass across channels', () => {
    const notes = [note(0, 4, 72), note(0, 4, 64), note(0, 4, 67), note(0, 8, 48), note(4, 4, 74), note(8, 2, 76)]
    const { song } = arrangeChip(notes, [], { bpm: 120, origin: 0, detail: 'balanced', chords: true, drums: true }, 'Test')
    expect(validateSong(JSON.parse(JSON.stringify(song)))).not.toBeNull()
    const ch = song.patterns[song.order[0]].channels
    expect(segments(ch[0]).map((s) => [s.start, s.note])).toEqual([[0, 72], [4, 74], [8, 76]])
    expect(ch[1][0]).toMatchObject({ note: 64, effect: '0', param: 0x30 })
    expect(segments(ch[2]).map((s) => [s.start, s.length, s.note])).toEqual([[0, 8, 48]])
  })

  it('skips quiet notes at lower detail and drops drums when asked', () => {
    const notes = [note(0, 4, 72), note(4, 4, 74, 0.25)]
    const hits = [{ time: 0, kind: 'kick' as const }]
    const simple = arrangeChip(notes, hits, { bpm: 120, origin: 0, detail: 'simple', chords: false, drums: false }, 'T')
    const detailed = arrangeChip(notes, hits, { bpm: 120, origin: 0, detail: 'detailed', chords: false, drums: true }, 'T')
    expect(segments(simple.song.patterns[0].channels[0])).toHaveLength(1)
    expect(segments(detailed.song.patterns[0].channels[0])).toHaveLength(2)
    expect(simple.song.patterns[0].channels[3][0].note).toBeNull()
    expect(detailed.song.patterns[0].channels[3][0].note).toBe(1)
  })

  it('places notes relative to the first beat and drops pickups before it', () => {
    const notes = [note(-1, 1, 70), { ...note(0, 2, 72), start: 0.25 }]
    const { song } = arrangeChip(notes, [], { bpm: 120, origin: 0.25, detail: 'balanced', chords: false, drums: false }, 'T')
    expect(song.patterns[0].channels[0][0].note).toBe(72)
  })
})

describe('cleanNotes', () => {
  const n = (start: number, duration: number, pitch: number, amplitude: number) => ({ start, duration, pitch, amplitude })

  it('drops quieter overtones of a louder note', () => {
    const out = cleanNotes([n(0, 0.5, 60, 0.9), n(0.01, 0.4, 72, 0.4), n(0, 0.4, 79, 0.3), n(0, 0.5, 64, 0.5)])
    expect(out.map((x) => x.pitch).sort()).toEqual([60, 64])
  })

  it('drops octave errors below a bass note, but keeps a real bass under the melody', () => {
    const out = cleanNotes([n(0, 1, 43, 0.8), n(0, 1, 31, 0.3), n(0, 0.5, 72, 0.9), n(0, 0.9, 48, 0.5)])
    expect(out.map((x) => x.pitch).sort((a, b) => a - b)).toEqual([43, 48, 72])
  })

  it('keeps a repeated note that starts near the end of the last one', () => {
    expect(cleanNotes([n(0, 1.02, 48, 0.8), n(1, 0.9, 48, 0.8)])).toHaveLength(2)
  })

  it('joins a quieter tail split off where the note ended', () => {
    const out = cleanNotes([n(0, 0.25, 72, 0.8), n(0.25, 0.2, 72, 0.4)])
    expect(out).toHaveLength(1)
    expect(out[0].duration).toBeCloseTo(0.45)
  })

  it('keeps a real octave that is as loud as its partner', () => {
    expect(cleanNotes([n(0, 0.5, 60, 0.8), n(0, 0.5, 72, 0.75)])).toHaveLength(2)
  })

  it('merges a pitch re-detected while it still sounds', () => {
    const out = cleanNotes([n(0, 0.45, 67, 0.8), n(0.25, 0.4, 67, 0.5), n(1, 0.2, 67, 0.7)])
    expect(out.map((x) => [x.start, Number(x.duration.toFixed(2))])).toEqual([[0, 0.65], [1, 0.2]])
  })
})

describe('nearestBeat', () => {
  it('chooses the beat closest to the start, even slightly before it', () => {
    expect(nearestBeat({ bpm: 120, firstBeat: 0.49, confidence: 1 })).toBeCloseTo(-0.01)
    expect(nearestBeat({ bpm: 120, firstBeat: 0.12, confidence: 1 })).toBeCloseTo(0.12)
    expect(nearestBeat({ bpm: 120, firstBeat: 1.37, confidence: 1 })).toBeCloseTo(-0.13)
  })
})

describe('measureAttacks', () => {
  it('tells a re-struck note from one that just keeps ringing', () => {
    const out = new Float32Array(SR * 2)
    // One long note from 0 s, and the same pitch struck twice: at 1.0 s and 1.5 s.
    tone(out, 0, 0.98, 60, 0.3)
    tone(out, 1, 0.48, 64, 0.3)
    tone(out, 1.5, 0.48, 64, 0.3)
    const notes = [
      { start: 0, duration: 0.5, pitch: 60, amplitude: 0.8 },
      { start: 0.5, duration: 0.45, pitch: 60, amplitude: 0.8 },
      { start: 1, duration: 0.48, pitch: 64, amplitude: 0.8 },
      { start: 1.5, duration: 0.48, pitch: 64, amplitude: 0.8 },
    ]
    const [, ringing, , restruck] = measureAttacks(notes, stft(out, SR))
    expect(ringing.attack).toBeLessThan(2)
    expect(restruck.attack).toBeGreaterThan(6)
    // And cleanNotes uses it: the ringing piece joins, the re-strike stays.
    expect(cleanNotes(measureAttacks(notes, stft(out, SR))).map((n) => [n.start, n.pitch])).toEqual([[0, 60], [1, 64], [1.5, 64]])
  })
})
