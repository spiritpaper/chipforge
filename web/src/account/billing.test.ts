import { describe, expect, it } from 'vitest'
import { PAYMENT_RESULTS, formatPrice, planFeatures } from './billing'

describe('billing display', () => {
  it('formats prices in the gateway currency', () => {
    expect(formatPrice(1_000_000, 'IRR')).toMatch(/1,000,000/)
    expect(formatPrice(5, 'NOT-A-CURRENCY')).toBe('5 NOT-A-CURRENCY')
  })

  it('describes plans in plain words', () => {
    const free = { id: 'free', name: 'Free', maxSongs: 10, share: false, gpuConversion: false, badge: false, prices: {} }
    expect(planFeatures(free)).toEqual(['Sync up to 10 songs', 'Sync your sound library'])
    const pro = { ...free, id: 'pro', maxSongs: null, share: true, gpuConversion: true, badge: true }
    expect(planFeatures(pro)).toContain('Share songs by link')
    expect(planFeatures(pro)[0]).toBe('Sync unlimited songs')
  })

  it('has a message for every payment result the server sends', () => {
    expect(Object.keys(PAYMENT_RESULTS).sort()).toEqual(['cancelled', 'error', 'failed', 'ok', 'unknown'])
  })
})
