// How each SFX parameter is presented. Ranges and defaults come from chipcore; this
// file only adds plain-language labels, grouping and formatting.

import type { Engine, SfxParams } from './synth'
import type { GlyphName } from '../components/PixelIcon.svelte'

export type GroupId = 'sound' | 'pitch' | 'shape' | 'wobble' | 'grit' | 'filter' | 'flanger'

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'sound', label: 'Sound' },
  { id: 'pitch', label: 'Pitch' },
  { id: 'shape', label: 'Shape over time' },
  { id: 'wobble', label: 'Wobble' },
  { id: 'grit', label: 'Grit' },
  { id: 'filter', label: 'Filters' },
  { id: 'flanger', label: 'Flanger' },
]

export interface ParamMeta {
  label: string
  /** The technical name, shown in the tooltip for people who know sfxr or trackers. */
  tech: string
  group: GroupId
  control?: 'wave' | 'toggle'
  scale?: 'log'
  format: (v: number) => string
  /** Hide the control when it has no effect on the current sound. */
  when?: (p: SfxParams) => boolean
}

export const WAVES: { label: string; color: string; icon: GlyphName }[] = [
  { label: 'Pulse', color: 'var(--pulse1)', icon: 'pulseWave' },
  { label: 'Triangle', color: 'var(--tri)', icon: 'triWave' },
  { label: 'Noise', color: 'var(--noise)', icon: 'noiseWave' },
]

/** The classic engine's waves, in sfxr's order. */
export const CLASSIC_WAVES: { label: string; color: string; icon: GlyphName }[] = [
  { label: 'Square', color: 'var(--pulse1)', icon: 'pulseWave' },
  { label: 'Saw', color: 'var(--pulse2)', icon: 'sawWave' },
  { label: 'Sine', color: 'var(--tri)', icon: 'sineWave' },
  { label: 'Noise', color: 'var(--noise)', icon: 'noiseWave' },
]

export const wavesFor = (engine: Engine) => (engine === 'classic' ? CLASSIC_WAVES : WAVES)
/** The wave parameter's value: `wave` in the chip engine, `wave_type` in sfxr. */
export const waveOf = (p: SfxParams, engine: Engine) => (engine === 'classic' ? p.wave_type : p.wave) ?? 0
export const waveColor = (p: SfxParams, engine: Engine = 'chip') => wavesFor(engine)[waveOf(p, engine)]?.color ?? WAVES[0].color

const signed = (v: number, digits: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`
const seconds = (v: number) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`)
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} kHz` : `${Math.round(v)} Hz`)
const percent = (v: number) => `${Math.round(v * 100)}%`
const offOr = (f: (v: number) => string) => (v: number) => (v === 0 ? 'Off' : f(v))
const isPulse = (p: SfxParams) => p.wave === 0
const isNoise = (p: SfxParams) => p.wave === 2

export const PARAM_META: Record<string, ParamMeta> = {
  wave: { label: 'Wave', tech: 'Oscillator', group: 'sound', control: 'wave', format: (v) => WAVES[v]?.label ?? '' },
  duty: { label: 'Tone color', tech: 'Pulse duty cycle', group: 'sound', format: percent, when: isPulse },
  dutySweep: {
    label: 'Tone drift',
    tech: 'Duty sweep, per second',
    group: 'sound',
    format: (v) => (v === 0 ? 'Off' : `${signed(v * 100, 0)}%/s`),
    when: isPulse,
  },
  metallic: { label: 'Metallic', tech: 'Short noise mode (93-step LFSR)', group: 'sound', control: 'toggle', format: (v) => (v ? 'On' : 'Off'), when: isNoise },
  volume: { label: 'Volume', tech: 'Output level', group: 'sound', format: percent },

  pitch: { label: 'Pitch', tech: 'Start frequency', group: 'pitch', scale: 'log', format: hz },
  slide: { label: 'Slide', tech: 'Pitch slide, octaves per second', group: 'pitch', format: offOr((v) => `${signed(v, 1)} oct/s`) },
  slideCurve: { label: 'Slide curve', tech: 'Delta slide, octaves per second²', group: 'pitch', format: offOr((v) => signed(v, 1)) },
  stopBelow: { label: 'Stop below', tech: 'Frequency cutoff: the sound ends when pitch falls below it', group: 'pitch', format: offOr(hz) },
  jumpBy: { label: 'Jump by', tech: 'Arpeggio interval, semitones', group: 'pitch', format: offOr((v) => `${signed(v, 0)} semitones`) },
  jumpAfter: { label: 'Jump after', tech: 'Arpeggio delay', group: 'pitch', format: offOr(seconds), when: (p) => p.jumpBy !== 0 },

  attack: { label: 'Fade in', tech: 'Attack', group: 'shape', format: seconds },
  sustain: { label: 'Hold', tech: 'Sustain', group: 'shape', format: seconds },
  punch: { label: 'Punch', tech: 'Sustain punch', group: 'shape', format: percent },
  decay: { label: 'Fade out', tech: 'Decay', group: 'shape', format: seconds },

  wobbleDepth: { label: 'Depth', tech: 'Vibrato depth, semitones', group: 'wobble', format: offOr((v) => `${v.toFixed(2)} st`) },
  wobbleSpeed: { label: 'Speed', tech: 'Vibrato rate', group: 'wobble', format: (v) => `${v.toFixed(1)} Hz`, when: (p) => p.wobbleDepth > 0 },
  repeat: { label: 'Repeat every', tech: 'Retrigger period: restarts the pitch movement', group: 'wobble', format: offOr(seconds) },

  crunch: { label: 'Crunch', tech: 'Sample-rate reduction', group: 'grit', format: offOr(percent) },
  brightness: { label: 'Brightness', tech: 'Low-pass filter cutoff', group: 'grit', scale: 'log', format: (v) => (v >= 19_999 ? 'Full' : hz(v)) },
  cutLows: { label: 'Cut lows', tech: 'High-pass filter cutoff', group: 'grit', format: offOr(hz) },
}

// ---- the classic (sfxr) engine ------------------------------------------------
// Values are sfxr's 0..1 slider positions; these turn them into the units jsfxr's
// synth actually uses (see core/src/sfxr.rs), so the readouts say what you'll hear.

const RATE = 44_100
const SUPER = 8 * RATE
const samples = (v: number) => Math.floor(v * v * 100_000) / RATE
const sfxrHz = (v: number) => (SUPER * (v * v + 0.001)) / 100
const signedOr0 = (v: number, f: (v: number) => string) => (Math.abs(v) < 1e-6 ? 'Off' : f(v))
const isSquareOrSaw = (p: SfxParams) => p.wave_type === 0 || p.wave_type === 1
const perSecond = (factorPerTick: number, ticks: number) => {
  const octaves = Math.log2(factorPerTick) * ticks
  return `${signed(octaves, 1)} oct/s`
}

export const CLASSIC_PARAM_META: Record<string, ParamMeta> = {
  wave_type: { label: 'Wave', tech: 'wave_type', group: 'sound', control: 'wave', format: (v) => CLASSIC_WAVES[v]?.label ?? '' },
  p_duty: {
    label: 'Tone color',
    tech: 'p_duty: square duty (for saw, where the ramp turns)',
    group: 'sound',
    format: (v) => percent(0.5 - Math.max(0, v) * 0.5),
    when: isSquareOrSaw,
  },
  p_duty_ramp: {
    label: 'Tone drift',
    tech: 'p_duty_ramp: duty sweep',
    group: 'sound',
    format: (v) => signedOr0(v, () => `${signed(-v * 0.00005 * RATE * 100, 0)}%/s`),
    when: isSquareOrSaw,
  },
  sound_vol: { label: 'Volume', tech: 'sound_vol', group: 'sound', format: (v) => (v === 0 ? 'Off' : `${(20 * Math.log10(Math.exp(v) - 1)).toFixed(1)} dB`) },

  p_base_freq: { label: 'Pitch', tech: 'p_base_freq: start frequency', group: 'pitch', format: (v) => hz(sfxrHz(v)) },
  p_freq_limit: { label: 'Stop below', tech: 'p_freq_limit: min frequency cutoff', group: 'pitch', format: (v) => (v === 0 ? 'Off' : hz(sfxrHz(v))) },
  p_freq_ramp: {
    label: 'Slide',
    tech: 'p_freq_ramp',
    group: 'pitch',
    format: (v) => signedOr0(v, () => perSecond(1 / (1 - v ** 3 * 0.01), RATE)),
  },
  p_freq_dramp: {
    label: 'Slide curve',
    tech: 'p_freq_dramp: delta slide',
    group: 'pitch',
    format: (v) => signedOr0(v, () => signed(v ** 3 * 100, 2)),
  },
  p_arp_mod: {
    label: 'Jump by',
    tech: 'p_arp_mod: change amount',
    group: 'pitch',
    format: (v) => {
      const mult = v >= 0 ? 1 - v * v * 0.9 : 1 + v * v * 10
      return signedOr0(v, () => `${signed(12 * Math.log2(1 / mult), 1)} semitones`)
    },
  },
  p_arp_speed: {
    label: 'Jump after',
    tech: 'p_arp_speed: change speed',
    group: 'pitch',
    format: (v) => (v === 1 ? 'Off' : seconds((Math.floor((1 - v) ** 2 * 20_000) + 32) / RATE)),
    when: (p) => p.p_arp_mod !== 0,
  },

  p_env_attack: { label: 'Fade in', tech: 'p_env_attack', group: 'shape', format: (v) => seconds(samples(v)) },
  p_env_sustain: { label: 'Hold', tech: 'p_env_sustain', group: 'shape', format: (v) => seconds(samples(v)) },
  p_env_punch: { label: 'Punch', tech: 'p_env_punch: sustain punch', group: 'shape', format: (v) => `+${Math.round(v * 200)}%` },
  p_env_decay: { label: 'Fade out', tech: 'p_env_decay', group: 'shape', format: (v) => seconds(samples(v)) },

  p_vib_strength: { label: 'Depth', tech: 'p_vib_strength: vibrato depth', group: 'wobble', format: (v) => (v === 0 ? 'Off' : `±${Math.round(v * 50)}%`) },
  p_vib_speed: {
    label: 'Speed',
    tech: 'p_vib_speed: vibrato speed',
    group: 'wobble',
    format: (v) => `${((v * v * 0.01 * RATE) / (2 * Math.PI)).toFixed(1)} Hz`,
    when: (p) => p.p_vib_strength > 0,
  },
  p_repeat_speed: {
    label: 'Repeat every',
    tech: 'p_repeat_speed: restarts the pitch',
    group: 'wobble',
    format: (v) => (v === 0 ? 'Off' : seconds((Math.floor((1 - v) ** 2 * 20_000) + 32) / RATE)),
  },

  p_lpf_freq: {
    label: 'Brightness',
    tech: 'p_lpf_freq: low-pass cutoff',
    group: 'filter',
    format: (v) => {
      const w = v ** 3 * 0.1
      return v >= 1 ? 'Full' : hz((SUPER * w) / (1 - w) / (2 * Math.PI))
    },
  },
  p_lpf_ramp: { label: 'Brightness sweep', tech: 'p_lpf_ramp', group: 'filter', format: (v) => signedOr0(v, () => perSecond(1 + v * 0.0001, SUPER)) },
  p_lpf_resonance: { label: 'Resonance', tech: 'p_lpf_resonance', group: 'filter', format: percent },
  p_hpf_freq: {
    label: 'Cut lows',
    tech: 'p_hpf_freq: high-pass cutoff',
    group: 'filter',
    format: (v) => {
      const w = v * v * 0.1
      return v === 0 ? 'Off' : hz((SUPER * w) / (1 - w) / (2 * Math.PI))
    },
  },
  p_hpf_ramp: { label: 'Cut lows sweep', tech: 'p_hpf_ramp', group: 'filter', format: (v) => signedOr0(v, () => perSecond(1 + v * 0.0003, RATE)) },

  p_pha_offset: {
    label: 'Offset',
    tech: 'p_pha_offset: phaser offset',
    group: 'flanger',
    format: (v) => signedOr0(v, () => `${signed((Math.sign(v) * v * v * 1020 * 1000) / SUPER, 2)} ms`),
  },
  p_pha_ramp: {
    label: 'Sweep',
    tech: 'p_pha_ramp: phaser sweep',
    group: 'flanger',
    format: (v) => signedOr0(v, () => `${signed((Math.sign(v) * v * v * RATE * 1000) / SUPER, 1)} ms/s`),
  },
}

export const metaFor = (engine: Engine) => (engine === 'classic' ? CLASSIC_PARAM_META : PARAM_META)

export interface PresetMeta {
  label: string
  /** Key shown to the user and the KeyboardEvent.code that triggers it. */
  key: string
  code: string
}

export const PRESET_META: Record<string, PresetMeta> = {
  coin: { label: 'Coin', key: '1', code: 'Digit1' },
  jump: { label: 'Jump', key: '2', code: 'Digit2' },
  laser: { label: 'Laser', key: '3', code: 'Digit3' },
  explosion: { label: 'Explosion', key: '4', code: 'Digit4' },
  powerUp: { label: 'Power-up', key: '5', code: 'Digit5' },
  hit: { label: 'Hit', key: '6', code: 'Digit6' },
  blip: { label: 'Blip', key: '7', code: 'Digit7' },
  select: { label: 'Select', key: '8', code: 'Digit8' },
  hurt: { label: 'Hurt', key: '9', code: 'Digit9' },
  door: { label: 'Door', key: '0', code: 'Digit0' },
  random: { label: 'Random', key: 'R', code: 'KeyR' },
}

/** jsfxr's presets, on the same keys as the chip engine's where they match. */
export const CLASSIC_PRESET_META: Record<string, PresetMeta> = {
  pickupCoin: { label: 'Coin', key: '1', code: 'Digit1' },
  jump: { label: 'Jump', key: '2', code: 'Digit2' },
  laserShoot: { label: 'Laser', key: '3', code: 'Digit3' },
  explosion: { label: 'Explosion', key: '4', code: 'Digit4' },
  powerUp: { label: 'Power-up', key: '5', code: 'Digit5' },
  hitHurt: { label: 'Hit', key: '6', code: 'Digit6' },
  blipSelect: { label: 'Blip', key: '7', code: 'Digit7' },
  synth: { label: 'Synth', key: '8', code: 'Digit8' },
  tone: { label: 'Tone', key: '9', code: 'Digit9' },
  click: { label: 'Click', key: '0', code: 'Digit0' },
  random: { label: 'Random', key: 'R', code: 'KeyR' },
}

export const presetsFor = (engine: Engine) => (engine === 'classic' ? CLASSIC_PRESET_META : PRESET_META)

const OTHER_LABELS: Record<string, string> = { shared: 'Shared', imported: 'Imported' }

export const presetLabel = (preset: string) =>
  PRESET_META[preset]?.label ?? CLASSIC_PRESET_META[preset]?.label ?? OTHER_LABELS[preset] ?? 'Sound'

/** Why a sound renders silent, in words that say how to fix it; null if it isn't. */
export function silenceReason(p: SfxParams, samples: Float32Array, sampleRate: number, engine: Engine = 'chip'): string | null {
  let peak = 0
  for (const v of samples) peak = Math.max(peak, Math.abs(v))
  if (samples.length >= sampleRate * 0.01 && peak > 0.002) return null
  if (engine === 'classic') {
    if (p.p_freq_limit > 0 && p.p_base_freq <= p.p_freq_limit) {
      return 'Pitch starts below Stop below, so the sound ends at once. Raise Pitch or lower Stop below.'
    }
    if (p.sound_vol === 0) return 'Volume is off. Turn it up to hear this sound.'
    if (p.p_lpf_freq < 0.05) return 'Brightness is all the way down, which filters everything out. Raise it.'
    return 'This sound is too short to hear. Lengthen Hold or Fade out.'
  }
  if (p.stopBelow > 0 && p.pitch <= p.stopBelow) {
    return 'Pitch starts below Stop below, so the sound ends at once. Raise Pitch or lower Stop below.'
  }
  if (p.stopBelow > 0) return 'Stop below cuts this sound off almost at once. Lower Stop below or raise Pitch.'
  if (p.volume === 0) return 'Volume is at 0%. Turn it up to hear this sound.'
  return 'This sound is too short to hear. Lengthen Hold or Fade out.'
}

/** Slider resolution: positions run 0..SLIDER_STEPS. */
export const SLIDER_STEPS = 1000

export function toPosition(value: number, min: number, max: number, scale?: 'log'): number {
  const t = scale === 'log' ? Math.log(value / min) / Math.log(max / min) : (value - min) / (max - min)
  return Math.round(Math.min(1, Math.max(0, t)) * SLIDER_STEPS)
}

export function fromPosition(position: number, min: number, max: number, scale?: 'log'): number {
  const t = position / SLIDER_STEPS
  return scale === 'log' ? min * (max / min) ** t : min + t * (max - min)
}
