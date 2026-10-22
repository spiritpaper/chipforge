// The Demucs weights: downloaded from the author's Hugging Face page the first time
// someone splits a song, checked against a known SHA-256, then kept in the browser's
// cache so later splits (and offline use) don't download them again.

import { WEIGHTS } from './session'

const CACHE = 'chipforge-models-v1'

export class WeightsError extends Error {}

async function cache(): Promise<Cache | null> {
  try {
    return await caches.open(CACHE)
  } catch {
    return null // no Cache Storage (private mode in some browsers): download each time
  }
}

/** Whether the weights are already on this device (so splitting needs no download). */
export async function weightsCached(): Promise<boolean> {
  return !!(await (await cache())?.match(WEIGHTS.url))
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function loadWeights(onProgress: (fraction: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  const store = await cache()
  const hit = await store?.match(WEIGHTS.url)
  if (hit) {
    const bytes = new Uint8Array(await hit.arrayBuffer())
    if (bytes.length === WEIGHTS.bytes) return bytes
    await store?.delete(WEIGHTS.url)
  }

  let response: Response
  try {
    response = await fetch(WEIGHTS.url)
  } catch {
    throw new WeightsError("Couldn't download the Demucs model from Hugging Face. Check your connection and try again.")
  }
  if (!response.ok || !response.body) throw new WeightsError(`Hugging Face answered ${response.status} for the Demucs model.`)
  const bytes = new Uint8Array(WEIGHTS.bytes)
  let received = 0
  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (received + value.length > bytes.length) throw new WeightsError('The Demucs model download is larger than expected.')
    bytes.set(value, received)
    received += value.length
    onProgress(received / bytes.length)
  }
  if (received !== bytes.length || (await sha256(bytes)) !== WEIGHTS.sha256) {
    throw new WeightsError("The downloaded Demucs model isn't the expected file, so it wasn't used.")
  }
  await store?.put(WEIGHTS.url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } })).catch(() => {})
  return bytes
}
