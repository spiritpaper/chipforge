// Messages between the main thread and the chip AudioWorklet.

export type ToWorklet =
  | { type: 'song'; bytes: Uint8Array<ArrayBuffer> }
  | { type: 'play'; order: number; row: number }
  | { type: 'stop' }
  | { type: 'loopPattern'; on: boolean }
  | { type: 'mute'; channel: number; muted: boolean }
  | { type: 'preview'; channel: number; note: number; instrument: number }
  | { type: 'previewOff'; channel: number }

export type FromWorklet =
  | { type: 'ready' }
  | { type: 'songError'; code: number }
  | { type: 'frame'; position: { order: number; row: number } | null; scopes: Float32Array[] }

/** How many rendered samples between scope/playhead updates (≈47 per second at 48 kHz). */
export const FRAME_INTERVAL = 1024
