// Audio → notes with Basic Pitch. Runs anywhere TensorFlow.js does (worker or tests).

import type * as tf from '@tensorflow/tfjs'
import { BasicPitch, addPitchBendsToNoteEvents, noteFramesToTime, outputToNotesPoly } from '@spotify/basic-pitch'

/** Basic Pitch listens at this rate, mono. */
export const TRANSCRIBE_RATE = 22_050

export interface HeardNote {
  start: number
  duration: number
  pitch: number
  /** 0..1 loudness the model assigned. */
  amplitude: number
  /** Energy rise at the note's fundamental when it starts, in dB (see attack.ts). */
  attack?: number
}

export async function transcribe(
  model: Promise<tf.GraphModel>,
  samples: Float32Array,
  onProgress: (fraction: number) => void = () => {},
): Promise<HeardNote[]> {
  const basicPitch = new BasicPitch(model)
  const frames: number[][] = []
  const onsets: number[][] = []
  const contours: number[][] = []
  await basicPitch.evaluateModel(
    samples,
    (f, o, c) => {
      frames.push(...f)
      onsets.push(...o)
      contours.push(...c)
    },
    onProgress,
  )
  // Thresholds from Basic Pitch's own defaults; 11 frames ≈ 128 ms minimum note.
  const events = noteFramesToTime(addPitchBendsToNoteEvents(contours, outputToNotesPoly(frames, onsets, 0.5, 0.3, 11)))
  return events
    .map((n) => ({ start: n.startTimeSeconds, duration: n.durationSeconds, pitch: n.pitchMidi, amplitude: n.amplitude }))
    .sort((a, b) => a.start - b.start || b.pitch - a.pitch)
}
