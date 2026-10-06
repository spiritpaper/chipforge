// Loads the Basic Pitch transcription model (about 0.9 MB) from files bundled with the app.

import * as tf from '@tensorflow/tfjs'

/** Builds the model from its JSON and weights, wherever they are served from. */
export async function loadModel(modelJson: unknown, weights: ArrayBuffer): Promise<tf.GraphModel> {
  const json = modelJson as { modelTopology: object; weightsManifest: { weights: tf.io.WeightsManifestEntry[] }[]; format?: string; generatedBy?: string; convertedBy?: string }
  const artifacts: tf.io.ModelArtifacts = {
    modelTopology: json.modelTopology,
    weightSpecs: json.weightsManifest.flatMap((group) => group.weights),
    weightData: weights,
    format: json.format,
    generatedBy: json.generatedBy,
    convertedBy: json.convertedBy,
  }
  return tf.loadGraphModel(tf.io.fromMemory(artifacts))
}

/** Picks the fastest backend available: the GPU via WebGL, else plain JavaScript. */
export async function pickBackend(): Promise<'webgl' | 'cpu'> {
  try {
    if (await tf.setBackend('webgl')) {
      await tf.ready()
      return 'webgl'
    }
  } catch {
    // No WebGL here (e.g. a worker without OffscreenCanvas): fall through.
  }
  await tf.setBackend('cpu')
  await tf.ready()
  return 'cpu'
}
