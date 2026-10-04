export interface WavLoop {
  /** First sample of the loop. */
  start: number
  /** Last sample of the loop (inclusive). */
  end: number
}

const SMPL_SIZE = 8 + 36 + 24

/**
 * 16-bit PCM mono WAV. With `loop`, adds a `smpl` chunk with one forward loop, which
 * Godot, Unity, FMOD, Wwise and samplers use to loop seamlessly.
 */
export function encodeWav(samples: Float32Array, sampleRate: number, loop?: WavLoop): Uint8Array<ArrayBuffer> {
  const dataSize = samples.length * 2
  const bytes = new Uint8Array(44 + dataSize + (loop ? SMPL_SIZE : 0))
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, s: string) => [...s].forEach((c, i) => (bytes[offset + i] = c.charCodeAt(0)))
  ascii(0, 'RIFF')
  view.setUint32(4, bytes.length - 8, true)
  ascii(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, s)) * 0x7fff), true))
  if (loop) {
    const o = 44 + dataSize
    ascii(o, 'smpl')
    view.setUint32(o + 4, SMPL_SIZE - 8, true)
    view.setUint32(o + 8 + 8, Math.round(1e9 / sampleRate), true) // sample period, ns
    view.setUint32(o + 8 + 12, 60, true) // MIDI unity note
    view.setUint32(o + 8 + 28, 1, true) // one loop
    const l = o + 8 + 36
    view.setUint32(l + 4, 0, true) // forward
    view.setUint32(l + 8, loop.start, true)
    view.setUint32(l + 12, loop.end, true)
  }
  return bytes
}
