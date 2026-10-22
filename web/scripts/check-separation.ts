// Checks the in-app separation against Demucs itself (tools/demucs-onnx/reference.py):
//
//   pnpm exec tsx scripts/check-separation.ts GRAPH.onnx 955717e8.safetensors CLIP.f32 REF_DIR
//
// Runs the same code as the app (src/convert/separate) on ONNX Runtime's WebAssembly
// backend and prints, per part, how close it is to Demucs's own output.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as ort from 'onnxruntime-web'
import { separate, SOURCES } from '../src/convert/separate/run'
import { createNetwork } from '../src/convert/separate/session'

const [graphPath, weightsPath, clipPath, refDir] = process.argv.slice(2)
const f32 = (path: string) => {
  const b = readFileSync(path)
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)
}

const clip = f32(clipPath)
const left = clip.filter((_, i) => i % 2 === 0)
const right = clip.filter((_, i) => i % 2 === 1)
ort.env.wasm.numThreads = 4
const net = await createNetwork(ort, readFileSync(graphPath), readFileSync(weightsPath), ['wasm'])
const started = Date.now()
const parts = await separate(left, right, net, (f) => process.stdout.write(`\r${Math.round(f * 100)}%`))
console.log(`\nseparated ${(left.length / 44100).toFixed(1)} s in ${((Date.now() - started) / 1000).toFixed(1)} s`)

let worst = Infinity
SOURCES.forEach((name, s) => {
  const want = f32(join(refDir, `${name}.f32`))
  const got = parts[s]
  let signal = 0
  let noise = 0
  let max = 0
  for (let i = 0; i < want.length; i++) {
    signal += want[i] * want[i]
    noise += (got[i] - want[i]) ** 2
    max = Math.max(max, Math.abs(got[i] - want[i]))
  }
  // How far the difference sits below the part itself; above 40 dB is inaudible.
  const db = 10 * Math.log10(signal / Math.max(noise, 1e-20))
  if (signal / want.length > 1e-6) worst = Math.min(worst, db)
  console.log(`${name.padEnd(7)} difference ${db.toFixed(1)} dB below the part, max ${max.toExponential(2)}`)
})
if (!(worst > 40)) {
  console.error('The separation differs from Demucs.')
  process.exit(1)
}
