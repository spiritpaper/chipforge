// Messages between the main thread and the chip AudioWorklet.

export type ToWorklet =
  | { type: 'play' }
  | { type: 'stop' }
  | { type: 'bpm'; bpm: number }
  | { type: 'mute'; channel: number; muted: boolean }
  | { type: 'noteOn'; channel: number; note: number; volume: number }
  | { type: 'noteOff'; channel: number }

export type FromWorklet =
  | { type: 'ready' }
  | { type: 'frame'; step: number; scopes: Float32Array[] }

/** Encoded song cells, as returned by `chip_cell`. */
export const CELL_HOLD = -1
export const CELL_OFF = -2
export const CELL_KICK = 128
export const CELL_SNARE = 129
export const CELL_HAT = 130

/** How many rendered samples between scope/playhead updates (≈47 per second at 48 kHz). */
export const FRAME_INTERVAL = 1024
