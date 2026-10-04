// Share links: every parameter quantized to 16 bits, in core order, base64url-encoded.
// About 60 characters, no server needed.

import type { ParamSpec, SfxParams } from './synth'

const VERSION = 1

export function encodeShare(params: SfxParams, specs: ParamSpec[]): string {
  const bytes = new Uint8Array(1 + specs.length * 2)
  const view = new DataView(bytes.buffer)
  bytes[0] = VERSION
  for (const s of specs) {
    const v = params[s.key] ?? s.default
    const t = Math.min(1, Math.max(0, (v - s.min) / (s.max - s.min)))
    view.setUint16(1 + s.index * 2, Math.round(t * 0xffff))
  }
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Returns null for anything that isn't a valid share code. */
export function decodeShare(code: string, specs: ParamSpec[]): SfxParams | null {
  let bytes: Uint8Array
  try {
    const binary = atob(code.replace(/-/g, '+').replace(/_/g, '/'))
    bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
  if (bytes[0] !== VERSION || bytes.length < 3 || bytes.length % 2 === 0) return null
  const view = new DataView(bytes.buffer)
  const params: SfxParams = {}
  for (const s of specs) {
    const offset = 1 + s.index * 2
    // Codes from before a parameter existed simply get its default.
    if (offset + 2 > bytes.length) {
      params[s.key] = s.default
      continue
    }
    const v = s.min + (view.getUint16(offset) / 0xffff) * (s.max - s.min)
    params[s.key] = s.integer ? Math.round(v) : v
  }
  return params
}
