// Reading and writing classic sfxr sounds in the formats other tools use:
// - jsfxr share codes (base58, as in https://sfxr.me/#code) and its JSON,
// - sfxr's .sfs files (DrPetter's desktop sfxr, versions 100-102),
// - rFXGen's .rfx files.
// All describe the same 23 parameters, which the classic engine keeps by name.

import type { SfxParams } from './synth'

/** jsfxr's parameter order (its `params_order`). */
export const SFXR_ORDER = [
  'wave_type',
  'p_env_attack',
  'p_env_sustain',
  'p_env_punch',
  'p_env_decay',
  'p_base_freq',
  'p_freq_limit',
  'p_freq_ramp',
  'p_freq_dramp',
  'p_vib_strength',
  'p_vib_speed',
  'p_arp_mod',
  'p_arp_speed',
  'p_duty',
  'p_duty_ramp',
  'p_repeat_speed',
  'p_pha_offset',
  'p_pha_ramp',
  'p_lpf_freq',
  'p_lpf_ramp',
  'p_lpf_resonance',
  'p_hpf_freq',
  'p_hpf_ramp',
] as const

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function b58encode(bytes: Uint8Array): string {
  const digits: number[] = []
  for (const byte of bytes) {
    let carry = byte
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] * 256
      digits[j] = carry % 58
      carry = Math.floor(carry / 58)
    }
    while (carry) {
      digits.push(carry % 58)
      carry = Math.floor(carry / 58)
    }
  }
  let out = ''
  for (const byte of bytes) {
    if (byte !== 0) break
    out += '1'
  }
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]]
  return out
}

function b58decode(text: string): Uint8Array | null {
  const bytes: number[] = []
  for (const ch of text) {
    let carry = ALPHABET.indexOf(ch)
    if (carry < 0) return null
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58
      bytes[j] = carry & 0xff
      carry >>= 8
    }
    while (carry) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  for (const ch of text) {
    if (ch !== '1') break
    bytes.push(0)
  }
  return Uint8Array.from(bytes.reverse())
}

/** A jsfxr share code: the wave byte, then 22 little-endian float32s. */
export function toJsfxrCode(params: SfxParams): string {
  const bytes = new Uint8Array(1 + (SFXR_ORDER.length - 1) * 4)
  const view = new DataView(bytes.buffer)
  bytes[0] = params.wave_type ?? 0
  SFXR_ORDER.slice(1).forEach((key, i) => view.setFloat32(1 + i * 4, params[key] ?? 0, true))
  return b58encode(bytes)
}

export function fromJsfxrCode(code: string): SfxParams | null {
  const bytes = b58decode(code.trim().replace(/^#/, ''))
  if (!bytes || bytes.length !== 1 + (SFXR_ORDER.length - 1) * 4 || bytes[0] > 3) return null
  const view = new DataView(bytes.buffer)
  const params: SfxParams = { wave_type: bytes[0] }
  SFXR_ORDER.slice(1).forEach((key, i) => (params[key] = view.getFloat32(1 + i * 4, true)))
  return Object.values(params).every(Number.isFinite) ? params : null
}

/** A link that opens the sound in jsfxr. */
export const jsfxrLink = (params: SfxParams) => `https://sfxr.me/#${toJsfxrCode(params)}`

/** jsfxr's JSON (its "Serialize" output, or a sound saved by its library). */
export function fromJsfxrJson(value: unknown): SfxParams | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  if (typeof o.wave_type !== 'number' || typeof o.p_base_freq !== 'number') return null
  const params: SfxParams = {}
  for (const key of SFXR_ORDER) params[key] = typeof o[key] === 'number' ? (o[key] as number) : key === 'p_lpf_freq' ? 1 : 0
  if (typeof o.sound_vol === 'number') params.sound_vol = o.sound_vol
  return params
}

/**
 * DrPetter's sfxr .sfs file: an int version (100-102), the wave, then floats in its
 * own order (see LoadSettings in sfxr's main.cpp). Version 101 added the delta slide
 * and the arpeggio; 102 the volume.
 */
export function fromSfs(bytes: Uint8Array): SfxParams | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 0
  const int = () => {
    const v = view.getInt32(at, true)
    at += 4
    return v
  }
  const float = () => {
    const v = view.getFloat32(at, true)
    at += 4
    return v
  }
  try {
    const version = int()
    if (version < 100 || version > 102) return null
    const p: SfxParams = { wave_type: int() }
    if (version === 102) p.sound_vol = float()
    p.p_base_freq = float()
    p.p_freq_limit = float()
    p.p_freq_ramp = float()
    p.p_freq_dramp = version >= 101 ? float() : 0
    p.p_duty = float()
    p.p_duty_ramp = float()
    p.p_vib_strength = float()
    p.p_vib_speed = float()
    float() // vibrato delay: stored, never used by sfxr
    p.p_env_attack = float()
    p.p_env_sustain = float()
    p.p_env_decay = float()
    p.p_env_punch = float()
    at += 1 // filter_on (a C++ bool), also unused
    p.p_lpf_resonance = float()
    p.p_lpf_freq = float()
    p.p_lpf_ramp = float()
    p.p_hpf_freq = float()
    p.p_hpf_ramp = float()
    p.p_pha_offset = float()
    p.p_pha_ramp = float()
    p.p_repeat_speed = float()
    p.p_arp_speed = version >= 101 ? float() : 0
    p.p_arp_mod = version >= 101 ? float() : 0
    if (p.wave_type < 0 || p.wave_type > 3 || !Object.values(p).every(Number.isFinite)) return null
    return p
  } catch {
    return null // too short
  }
}

/**
 * rFXGen's .rfx file: "rFX ", u16 version 200, u16 length 96, then its WaveParams
 * (an int seed, the wave, 22 floats in sfxr's meaning but rFXGen's order).
 */
export function fromRfx(bytes: Uint8Array): SfxParams | null {
  if (bytes.length < 8 + 96 || String.fromCharCode(...bytes.slice(0, 4)) !== 'rFX ') return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint16(4, true) !== 200 || view.getUint16(6, true) !== 96) return null
  const wave = view.getInt32(12, true)
  if (wave < 0 || wave > 3) return null
  const order = [
    'p_env_attack', 'p_env_sustain', 'p_env_punch', 'p_env_decay',
    'p_base_freq', 'p_freq_limit', 'p_freq_ramp', 'p_freq_dramp', 'p_vib_strength', 'p_vib_speed',
    'p_arp_mod', 'p_arp_speed', 'p_duty', 'p_duty_ramp', 'p_repeat_speed', 'p_pha_offset', 'p_pha_ramp',
    'p_lpf_freq', 'p_lpf_ramp', 'p_lpf_resonance', 'p_hpf_freq', 'p_hpf_ramp',
  ]
  const p: SfxParams = { wave_type: wave }
  order.forEach((key, i) => (p[key] = view.getFloat32(16 + i * 4, true)))
  return Object.values(p).every(Number.isFinite) ? p : null
}

/**
 * Pasted text: a jsfxr link (anything with the code after "#"), a bare code, or JSON.
 * Returns null if it's none of those.
 */
export function fromText(text: string): SfxParams | null {
  const t = text.trim()
  if (t.startsWith('{')) {
    try {
      return fromJsfxrJson(JSON.parse(t))
    } catch {
      return null
    }
  }
  const code = t.includes('#') ? t.slice(t.lastIndexOf('#') + 1) : t
  return fromJsfxrCode(code)
}

/** A dropped or chosen file, by its contents (not its name). */
export async function fromFile(file: Blob): Promise<SfxParams | null> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return fromRfx(bytes) ?? fromSfs(bytes) ?? fromText(new TextDecoder().decode(bytes))
}
