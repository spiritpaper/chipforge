import { describe, expect, it } from 'vitest'
import { isTypingTarget, sfxShortcut, songShortcut } from './keys'
import { soloMask } from './mix'

describe('songShortcut', () => {
  it('maps space, digits and shift+digits', () => {
    expect(songShortcut('Space', false)).toEqual({ action: 'togglePlay' })
    expect(songShortcut('Digit3', false)).toEqual({ action: 'mute', channel: 2 })
    expect(songShortcut('Digit1', true)).toEqual({ action: 'solo', channel: 0 })
    expect(songShortcut('Digit5', false)).toBeNull()
    expect(songShortcut('KeyA', false)).toBeNull()
  })
})

describe('sfxShortcut', () => {
  it('maps number keys to presets and letters to actions', () => {
    expect(sfxShortcut('Digit1', false)).toEqual({ action: 'preset', preset: 'coin' })
    expect(sfxShortcut('Digit0', false)).toEqual({ action: 'preset', preset: 'door' })
    expect(sfxShortcut('KeyR', false)).toEqual({ action: 'preset', preset: 'random' })
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
