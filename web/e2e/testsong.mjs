// A small, known "real" song for conversion tests: a harmonic melody (16 quarter
// notes), a bass line (half notes), kick on 1 and 3, snare on 2 and 4, hats on eighths,
// at 120 BPM. Written as 16-bit mono WAV.

import fs from 'node:fs'

export const TEST_SONG = {
  bpm: 120,
  melody: [72, 76, 79, 76, 74, 77, 81, 77, 76, 79, 84, 79, 74, 71, 67, 71],
  bass: [48, 48, 43, 43, 45, 45, 41, 41],
}

export function writeTestSong(path) {
  const SR = 44_100
  const beat = 60 / TEST_SONG.bpm
  const n = Math.floor(SR * beat * 16)
  const out = new Float32Array(n)
  let seed = 1
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1
  const tone = (start, dur, midi, amp, harmonics) => {
    const f = 440 * 2 ** ((midi - 69) / 12)
    const s0 = Math.floor(start * SR)
    for (let i = 0; i < dur * SR && s0 + i < n; i++) {
      const t = i / SR
      const env = Math.min(1, t * 200) * Math.exp(-t * 2.5) * Math.min(1, (dur - t) / 0.03)
      let v = 0
      harmonics.forEach((h, k) => (v += h * Math.sin(2 * Math.PI * f * (k + 1) * t)))
      out[s0 + i] += amp * env * v
    }
  }
  TEST_SONG.melody.forEach((m, k) => tone(k * beat, beat * 0.9, m, 0.18, [1, 0.5, 0.3, 0.15]))
  TEST_SONG.bass.forEach((m, k) => tone(k * 2 * beat, beat * 1.8, m, 0.25, [1, 0.3]))
  for (let b = 0; b < 16; b++) {
    const s0 = Math.floor(b * beat * SR)
    if (b % 2 === 0) {
      for (let i = 0; i < 0.5 * SR && s0 + i < n; i++) {
        const t = i / SR
        out[s0 + i] += 0.5 * Math.exp(-t * 25) * Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-t * 30)) * t)
      }
    } else {
      for (let i = 0; i < 0.3 * SR && s0 + i < n; i++) out[s0 + i] += 0.25 * Math.exp(-(i / SR) * 30) * rand()
    }
    for (const e of [0, 0.5]) {
      const h0 = Math.floor((b + e) * beat * SR)
      let prev = 0
      for (let i = 0; i < 0.1 * SR && h0 + i < n; i++) {
        const x = rand()
        out[h0 + i] += 0.08 * Math.exp(-(i / SR) * 90) * (x - prev)
        prev = x
      }
    }
  }
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  const bytes = Buffer.alloc(44 + n * 2)
  bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + n * 2, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(SR, 24); bytes.writeUInt32LE(SR * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(n * 2, 40)
  out.forEach((v, i) => bytes.writeInt16LE(Math.round((v / peak) * 0.9 * 32767), 44 + i * 2))
  fs.writeFileSync(path, bytes)
}
