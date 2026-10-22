// Splits a song into drums, bass, other and vocals off the main thread, with Demucs on
// ONNX Runtime: on the graphics card through WebGPU when the browser has it, otherwise
// on the processor.

import * as ort from 'onnxruntime-web/webgpu'
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import ortMjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import graphUrl from './htdemucs.onnx?url'
import { separate } from './run'
import { createNetwork } from './session'
import { loadWeights } from './weights'

export interface SeparateRequest {
  /** Stereo at 44.1 kHz (the same array twice for a mono recording). */
  left: Float32Array
  right: Float32Array
}

export type SeparateMessage =
  | { type: 'progress'; stage: 'download' | 'loading' | 'separating'; fraction: number; backend?: Backend }
  | { type: 'done'; parts: Float32Array[]; backend: Backend }
  | { type: 'error'; error: string }

export type Backend = 'webgpu' | 'wasm'

const post = (m: SeparateMessage, transfer: Transferable[] = []) => postMessage(m, { transfer })

ort.env.wasm.wasmPaths = { wasm: ortWasm, mjs: ortMjs }
// Several threads need a cross-origin isolated page; one always works.
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1

async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    return !!(gpu && (await gpu.requestAdapter()))
  } catch {
    return false
  }
}

self.onmessage = async (e: MessageEvent<SeparateRequest>) => {
  try {
    const weights = await loadWeights((fraction) => post({ type: 'progress', stage: 'download', fraction }))
    post({ type: 'progress', stage: 'loading', fraction: 0 })
    const graph = new Uint8Array(await (await fetch(graphUrl)).arrayBuffer())
    let backend: Backend = (await hasWebGpu()) ? 'webgpu' : 'wasm'
    let net
    try {
      net = await createNetwork(ort, graph, weights, [backend])
    } catch {
      // A GPU that can't run every layer: the processor can.
      backend = 'wasm'
      net = await createNetwork(ort, graph, weights, ['wasm'])
    }
    const { left, right } = e.data
    const parts = await separate(left, right, net, (fraction) => post({ type: 'progress', stage: 'separating', fraction, backend }))
    post({ type: 'done', parts, backend }, parts.map((p) => p.buffer))
  } catch (err) {
    post({ type: 'error', error: err instanceof Error ? err.message : String(err) })
  }
}
