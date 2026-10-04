// Tracker keyboard map. Pure, so the whole layout is covered by tests.

import { EFFECTS } from '../song/model'

/** Cursor columns within a channel: note, instrument (2 digits), volume, effect, param (2). */
export const COLUMNS = ['note', 'instHi', 'instLo', 'volume', 'effect', 'paramHi', 'paramLo'] as const
export type Column = (typeof COLUMNS)[number]
export const COLUMN_COUNT = COLUMNS.length

/**
 * Two-octave piano on the keyboard, by physical key: the bottom letter row is the
 * current octave (Z = C), the top row is the octave above (Q = C), and the number
 * row holds the black keys, like every PC tracker.
 */
export const PIANO_KEYS: Record<string, number> = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21,
  Digit7: 22, KeyU: 23, KeyI: 24, Digit9: 25, KeyO: 26, Digit0: 27, KeyP: 28,
}

export type TrackerAction =
  | { type: 'note'; note: number }
  | { type: 'noteOff' }
  | { type: 'release' }
  | { type: 'hex'; value: number }
  | { type: 'effect'; letter: string }
  | { type: 'move'; rows: number; columns: number; select: boolean }
  | { type: 'channel'; delta: number }
  | { type: 'jump'; to: 'start' | 'end'; select: boolean }
  | { type: 'clear' }
  | { type: 'deleteRow' }
  | { type: 'insertRow' }
  | { type: 'transpose'; semitones: number }
  | { type: 'copy' }
  | { type: 'cut' }
  | { type: 'paste' }
  | { type: 'selectAll' }
  | { type: 'octave'; delta: number }
  | { type: 'instrument'; delta: number }
  | { type: 'order'; delta: number }
  | { type: 'playRow' }
  | { type: 'escape' }

export interface KeyInput {
  code: string
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}

export const PAGE_ROWS = 16

export function trackerAction(e: KeyInput, column: Column, octave: number): TrackerAction | null {
  if (e.altKey) return null
  const select = e.shiftKey
  if (e.ctrlKey || e.metaKey) {
    switch (e.code) {
      case 'KeyC': return { type: 'copy' }
      case 'KeyX': return { type: 'cut' }
      case 'KeyV': return { type: 'paste' }
      case 'KeyA': return { type: 'selectAll' }
      case 'ArrowUp': return { type: 'transpose', semitones: e.shiftKey ? 12 : 1 }
      case 'ArrowDown': return { type: 'transpose', semitones: e.shiftKey ? -12 : -1 }
      case 'ArrowLeft': return { type: 'order', delta: -1 }
      case 'ArrowRight': return { type: 'order', delta: 1 }
      default: return null
    }
  }
  switch (e.code) {
    case 'ArrowUp': return { type: 'move', rows: -1, columns: 0, select }
    case 'ArrowDown': return { type: 'move', rows: 1, columns: 0, select }
    case 'ArrowLeft': return { type: 'move', rows: 0, columns: -1, select }
    case 'ArrowRight': return { type: 'move', rows: 0, columns: 1, select }
    case 'PageUp': return { type: 'move', rows: -PAGE_ROWS, columns: 0, select }
    case 'PageDown': return { type: 'move', rows: PAGE_ROWS, columns: 0, select }
    case 'Home': return { type: 'jump', to: 'start', select }
    case 'End': return { type: 'jump', to: 'end', select }
    case 'Tab': return { type: 'channel', delta: e.shiftKey ? -1 : 1 }
    case 'Delete': return { type: 'clear' }
    case 'Backspace': return { type: 'deleteRow' }
    case 'Insert': return { type: 'insertRow' }
    case 'Enter': return { type: 'playRow' }
    case 'Escape': return { type: 'escape' }
    case 'BracketLeft': return { type: 'octave', delta: -1 }
    case 'BracketRight': return { type: 'octave', delta: 1 }
    case 'Comma': return { type: 'instrument', delta: -1 }
    case 'Period': return { type: 'instrument', delta: 1 }
  }
  if (column === 'note') {
    if (e.code in PIANO_KEYS) {
      const note = (octave + 1) * 12 + PIANO_KEYS[e.code]
      return note <= 127 ? { type: 'note', note } : null
    }
    if (e.code === 'Digit1') return { type: 'noteOff' }
    if (e.code === 'Equal') return { type: 'release' }
    return null
  }
  if (column === 'effect') {
    const letter = e.key.toUpperCase()
    return (EFFECTS as readonly string[]).includes(letter) ? { type: 'effect', letter } : null
  }
  if (/^[0-9a-f]$/i.test(e.key)) {
    const value = parseInt(e.key, 16)
    return { type: 'hex', value }
  }
  return null
}
