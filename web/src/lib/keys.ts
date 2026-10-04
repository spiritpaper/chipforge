import { PRESET_META } from '../sfx/params'

export type SongShortcut =
  | { action: 'togglePlay' }
  | { action: 'mute'; channel: number }
  | { action: 'solo'; channel: number }

/** Sound check shortcuts, keyed by physical key so they work on any layout. */
export function songShortcut(code: string, shift: boolean): SongShortcut | null {
  if (code === 'Space') return { action: 'togglePlay' }
  const digit = /^Digit([1-4])$/.exec(code)
  if (digit) {
    const channel = Number(digit[1]) - 1
    return shift ? { action: 'solo', channel } : { action: 'mute', channel }
  }
  return null
}

export type SfxShortcut =
  | { action: 'play' | 'mutate' | 'keep' | 'export' | 'copyLink' | 'fineTune' }
  | { action: 'preset'; preset: string }
  | { action: 'move'; delta: number }

const SFX_KEYS: Record<string, SfxShortcut> = {
  Space: { action: 'play' },
  KeyM: { action: 'mutate' },
  KeyS: { action: 'keep' },
  KeyE: { action: 'export' },
  KeyL: { action: 'copyLink' },
  KeyF: { action: 'fineTune' },
  ArrowUp: { action: 'move', delta: -1 },
  ArrowDown: { action: 'move', delta: 1 },
}

export function sfxShortcut(code: string, shift: boolean): SfxShortcut | null {
  if (shift) return null
  const preset = Object.entries(PRESET_META).find(([, m]) => m.code === code)
  if (preset) return { action: 'preset', preset: preset[0] }
  return SFX_KEYS[code] ?? null
}

/** Keys each kind of focused control needs for itself. */
const SLIDER_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'])
const TOGGLE_KEYS = new Set(['Space'])

/**
 * Whether the focused element should receive this key instead of a shortcut. Text
 * fields keep every key; sliders and checkboxes only keep the keys they use, so
 * shortcuts still work right after dragging a slider.
 */
export function isTypingTarget(target: EventTarget | null, code: string): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false
  if (target.isContentEditable || ['TEXTAREA', 'SELECT'].includes(target.tagName)) return true
  if (target.tagName !== 'INPUT') return false
  const type = (target as HTMLInputElement).type
  if (type === 'range') return SLIDER_KEYS.has(code)
  if (type === 'checkbox' || type === 'radio') return TOGGLE_KEYS.has(code)
  return true
}
