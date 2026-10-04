// Decoding user audio files into mono samples.

export const DECODE_RATE = 44_100
/** Longer files are refused: the browser has to hold the whole song in memory. */
export const MAX_SECONDS = 15 * 60

export interface DecodedAudio {
  name: string
  samples: Float32Array
  sampleRate: number
}

export class AudioFileError extends Error {}

/** Mixes channels down to mono. */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0].slice()
  const out = new Float32Array(channels[0].length)
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i]
  for (let i = 0; i < out.length; i++) out[i] /= channels.length
  return out
}

export async function decodeFile(file: File): Promise<DecodedAudio> {
  const bytes = await file.arrayBuffer()
  // An OfflineAudioContext decodes without needing a click first and resamples for us.
  const ctx = new OfflineAudioContext(1, 1, DECODE_RATE)
  let buffer: AudioBuffer
  try {
    buffer = await ctx.decodeAudioData(bytes)
  } catch {
    throw new AudioFileError('This browser cannot read that file. Try MP3, WAV, OGG, FLAC or M4A.')
  }
  if (buffer.duration > MAX_SECONDS) {
    throw new AudioFileError(`That recording is ${Math.round(buffer.duration / 60)} minutes long; the limit is ${MAX_SECONDS / 60}.`)
  }
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
  return { name: file.name.replace(/\.[^.]+$/, ''), samples: toMono(channels), sampleRate: buffer.sampleRate }
}
