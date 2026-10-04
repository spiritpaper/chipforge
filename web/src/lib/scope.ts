/** How many of the most recent samples one scope trace spans (≈10 ms at 48 kHz). */
export const SCOPE_WINDOW = 512

/**
 * Start index for a stable trace: the first rising crossing of the signal's midpoint,
 * searched in the part of the buffer that still leaves a full window after it.
 */
export function triggerIndex(samples: ArrayLike<number>, window = SCOPE_WINDOW): number {
  const last = samples.length - window
  if (last <= 0) return 0
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < samples.length; i++) {
    lo = Math.min(lo, samples[i])
    hi = Math.max(hi, samples[i])
  }
  if (hi - lo < 1e-3) return last
  const mid = (lo + hi) / 2
  for (let i = last; i > 0; i--) {
    if (samples[i - 1] < mid && samples[i] >= mid) return i
  }
  return last
}

/**
 * One y position per pixel column for a trace of raw levels (0..1), where y=0 is the
 * top row. Silence sits on the bottom row, like a level meter.
 */
export function traceRows(
  samples: ArrayLike<number>,
  width: number,
  height: number,
  window = SCOPE_WINDOW,
): Int16Array {
  const rows = new Int16Array(width)
  const start = triggerIndex(samples, window)
  const span = Math.min(window, samples.length - start)
  for (let x = 0; x < width; x++) {
    const v = samples[start + Math.floor((x * span) / width)] ?? 0
    rows[x] = Math.round((1 - Math.min(1, Math.max(0, v))) * (height - 1))
  }
  return rows
}
