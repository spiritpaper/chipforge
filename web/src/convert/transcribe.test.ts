/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { loadModel, pickBackend } from './model'
import { TRANSCRIBE_RATE, transcribe } from './transcribe'

const require = createRequire(import.meta.url)
const modelDir = require.resolve('@spotify/basic-pitch/model/model.json').replace(/model\.json$/, '')

/** A plucked, harmonic tone: closer to real instruments than a pure sine. */
function melody(notes: number[], seconds = 0.5): Float32Array {
  const out = new Float32Array(Math.floor(notes.length * seconds * TRANSCRIBE_RATE))
  notes.forEach((midi, k) => {
    const f = 440 * 2 ** ((midi - 69) / 12)
    const s0 = Math.floor(k * seconds * TRANSCRIBE_RATE)
    for (let i = 0; i < seconds * TRANSCRIBE_RATE * 0.9; i++) {
      const t = i / TRANSCRIBE_RATE
      const env = Math.min(1, t * 200) * Math.exp(-t * 3)
      out[s0 + i] += 0.3 * env * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t) + 0.25 * Math.sin(6 * Math.PI * f * t))
    }
  })
  return out
}

describe('transcription (real Basic Pitch model, CPU)', () => {
  it('hears a simple melody', { timeout: 60_000 }, async () => {
    expect(await pickBackend()).toBe('cpu') // no WebGL in Node
    const json = JSON.parse(readFileSync(modelDir + 'model.json', 'utf8'))
    const weights = readFileSync(modelDir + 'group1-shard1of1.bin')
    const model = loadModel(json, weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength))
    const tune = [60, 64, 67, 72, 67, 64]
    const progress: number[] = []
    const notes = await transcribe(model, melody(tune), (p) => progress.push(p))
    expect(progress.at(-1)).toBeCloseTo(1, 1)
    // Strongest note in each half-second slot should be the one we played.
    const heard = tune.map((_, k) => {
      const inSlot = notes.filter((n) => n.start >= k * 0.5 - 0.1 && n.start < k * 0.5 + 0.25)
      return inSlot.sort((a, b) => b.amplitude - a.amplitude)[0]?.pitch
    })
    expect(heard).toEqual(tune)
  })
})
