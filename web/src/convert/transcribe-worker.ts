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
}

export type ListenMessage =
  | { type: 'progress'; stage: 'loading' | 'notes' | 'rhythm'; fraction: number; backend?: string }
  | { type: 'done'; notes: HeardNote[]; rhythm: Rhythm; hits: DrumHit[]; backend: string }
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
    const { samples } = e.data
    const heard = await transcribe(model, samples, (fraction) => post({ type: 'progress', stage: 'notes', fraction, backend }))
    const notes = measureAttacks(heard, stft(samples, TRANSCRIBE_RATE))
    post({ type: 'progress', stage: 'rhythm', fraction: 1, backend })
    const rhythm = detectRhythm(samples, TRANSCRIBE_RATE)
    const hits = detectDrums(samples, TRANSCRIBE_RATE)
    post({ type: 'done', notes, rhythm, hits, backend })
  } catch (err) {
    post({ type: 'error', error: err instanceof Error ? err.message : String(err) })
  }
}
