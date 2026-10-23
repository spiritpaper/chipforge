import { describe, expect, it } from 'vitest'
import { isTypingTarget, sfxShortcut } from './keys'
import { soloMask } from './mix'

describe('sfxShortcut', () => {
  it('maps number keys to presets and letters to actions', () => {
    expect(sfxShortcut('Digit1', false)).toEqual({ action: 'preset', code: 'Digit1' })
    expect(sfxShortcut('Digit0', false)).toEqual({ action: 'preset', code: 'Digit0' })
    expect(sfxShortcut('KeyR', false)).toEqual({ action: 'preset', code: 'KeyR' })
    expect(sfxShortcut('KeyM', false)).toEqual({ action: 'mutate' })
    expect(sfxShortcut('ArrowDown', false)).toEqual({ action: 'move', delta: 1 })
    expect(sfxShortcut('Space', false)).toEqual({ action: 'play' })
  })

  it('leaves shifted keys and unknown keys alone', () => {
    expect(sfxShortcut('KeyS', true)).toBeNull()
    expect(sfxShortcut('KeyQ', false)).toBeNull()
  })
})

describe('soloMask', () => {
  it('passes mutes through when nothing is soloed', () => {
    expect(soloMask([false, true, false, false], null)).toEqual([false, true, false, false])
  })

  it('mutes everything except the soloed channel, even if it was muted', () => {
    expect(soloMask([true, false, false, false], 0)).toEqual([false, true, true, true])
  })
})

describe('isTypingTarget', () => {
  it('ignores non-element targets', () => {
    expect(isTypingTarget(null, 'KeyE')).toBe(false)
  })
})
