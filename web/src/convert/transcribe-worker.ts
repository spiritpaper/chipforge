// Listens to a recording off the main thread: notes (Basic Pitch on the GPU when the
// browser allows it), tempo, beat and drum hits.

import './worker-shim'
import modelJsonUrl from '@spotify/basic-pitch/model/model.json?url'
import weightsUrl from '@spotify/basic-pitch/model/group1-shard1of1.bin?url'
import { detectDrums, type DrumHit } from './drums'
import { loadModel, pickBackend } from './model'
import { detectRhythm, type Rhythm } from './rhythm'
import { TRANSCRIBE_RATE, transcribe, type HeardNote } from './transcribe'
import { measureAttacks } from './attack'
import { stft } from './stft'

export interface ListenRequest {
  /** Mono, at TRANSCRIBE_RATE. */
  samples: Float32Array
  /** The song split into parts (also mono at TRANSCRIBE_RATE), when it was split. */
  parts?: SplitParts
}

export interface SplitParts {
  vocals: Float32Array
  other: Float32Array
  bass: Float32Array
  drums: Float32Array
}

/** Notes heard in each melodic part. */
export interface PartNotes {
  vocals: HeardNote[]
  other: HeardNote[]
  bass: HeardNote[]
}

export type ListenMessage =
  | { type: 'progress'; stage: 'loading' | 'notes' | 'rhythm'; fraction: number; backend?: string }
  | { type: 'done'; notes: HeardNote[]; parts?: PartNotes; rhythm: Rhythm; hits: DrumHit[]; backend: string }
  | { type: 'error'; error: string }

const post = (m: ListenMessage) => postMessage(m)

// Errors thrown asynchronously inside TensorFlow.js escape the try/catch below and
// would leave the page waiting forever; report them instead.
self.addEventListener('error', (e) => post({ type: 'error', error: `${e.message} ${e.error?.stack ?? ''}` }))
self.addEventListener('unhandledrejection', (e) => post({ type: 'error', error: String(e.reason?.stack ?? e.reason) }))

self.onmessage = async (e: MessageEvent<ListenRequest>) => {
  try {
    post({ type: 'progress', stage: 'loading', fraction: 0 })
    const backend = await pickBackend()
    const [json, weights] = await Promise.all([
      fetch(modelJsonUrl).then((r) => r.json()),
      fetch(weightsUrl).then((r) => r.arrayBuffer()),
    ])
    const model = loadModel(json, weights)
    const { samples, parts } = e.data
    // Each melodic part is transcribed on its own; without parts, the whole mix.
    const sources = parts ? [parts.vocals, parts.other, parts.bass] : [samples]
    const heard: HeardNote[][] = []
    for (const [i, source] of sources.entries()) {
      const notes = await transcribe(model, source, (f) =>
        post({ type: 'progress', stage: 'notes', fraction: (i + f) / sources.length, backend }),
      )
      heard.push(measureAttacks(notes, stft(source, TRANSCRIBE_RATE)))
    }
    post({ type: 'progress', stage: 'rhythm', fraction: 1, backend })
    const rhythm = detectRhythm(samples, TRANSCRIBE_RATE)
    // The drum part has the hits without the rest of the band in the way.
    const hits = detectDrums(parts?.drums ?? samples, TRANSCRIBE_RATE)
    const partNotes = parts ? { vocals: heard[0], other: heard[1], bass: heard[2] } : undefined
    post({ type: 'done', notes: heard.flat(), parts: partNotes, rhythm, hits, backend })
  } catch (err) {
    post({ type: 'error', error: err instanceof Error ? err.message : String(err) })
  }
}
