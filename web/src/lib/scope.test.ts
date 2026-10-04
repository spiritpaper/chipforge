import { describe, expect, it } from 'vitest'
import { SCOPE_WINDOW, traceRows, triggerIndex } from './scope'

const square = (length: number, period: number, phase = 0) =>
  Float32Array.from({ length }, (_, i) => (((i + phase) % period) < period / 2 ? 1 : 0))

describe('triggerIndex', () => {
  it('locks onto a rising edge so the trace does not drift', () => {
    for (const phase of [0, 7, 19, 33]) {
      const s = square(1024, 40, phase)
      const i = triggerIndex(s)
      expect(s[i - 1]).toBe(0)
      expect(s[i]).toBe(1)
      expect(i).toBeLessThanOrEqual(1024 - SCOPE_WINDOW)
    }
  })

  it('falls back to the newest window for flat signals', () => {
    expect(triggerIndex(new Float32Array(1024))).toBe(1024 - SCOPE_WINDOW)
  })
})

describe('traceRows', () => {
  it('maps full level to the top row and silence to the bottom row', () => {
    const rows = traceRows(square(1024, 64), 32, 10)
    expect(Math.min(...rows)).toBe(0)
    expect(Math.max(...rows)).toBe(9)
  })

  it('draws silence as a flat bottom line', () => {
    expect([...traceRows(new Float32Array(1024), 8, 6)]).toEqual(Array(8).fill(5))
  })
})
