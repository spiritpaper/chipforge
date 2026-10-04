// How each SFX parameter is presented. Ranges and defaults come from chipcore; this
// file only adds plain-language labels, grouping and formatting.

import type { SfxParams } from './synth'
import type { GlyphName } from '../components/PixelIcon.svelte'

export type GroupId = 'sound' | 'pitch' | 'shape' | 'wobble' | 'grit'

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'sound', label: 'Sound' },
  { id: 'pitch', label: 'Pitch' },
  { id: 'shape', label: 'Shape over time' },
  { id: 'wobble', label: 'Wobble' },
  { id: 'grit', label: 'Grit' },
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

export const waveColor = (p: SfxParams) => WAVES[p.wave]?.color ?? WAVES[0].color

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

export const presetLabel = (preset: string) =>
  PRESET_META[preset]?.label ?? (preset === 'shared' ? 'Shared' : 'Sound')

/** Why a sound renders silent, in words that say how to fix it; null if it isn't. */
export function silenceReason(p: SfxParams, samples: Float32Array, sampleRate: number): string | null {
  let peak = 0
  for (const v of samples) peak = Math.max(peak, Math.abs(v))
  if (samples.length >= sampleRate * 0.01 && peak > 0.002) return null
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
