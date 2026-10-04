import { describe, expect, it } from 'vitest'
import { trackerAction, type KeyInput } from './keys'

const key = (code: string, key = '', mods: Partial<KeyInput> = {}): KeyInput => ({
  code, key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods,
})

describe('trackerAction', () => {
  it('plays a two-octave piano from the letter rows', () => {
    expect(trackerAction(key('KeyZ'), 'note', 4)).toEqual({ type: 'note', note: 60 })
    expect(trackerAction(key('KeyS'), 'note', 4)).toEqual({ type: 'note', note: 61 })
    expect(trackerAction(key('KeyQ'), 'note', 4)).toEqual({ type: 'note', note: 72 })
    expect(trackerAction(key('KeyP'), 'note', 3)).toEqual({ type: 'note', note: 76 })
    expect(trackerAction(key('KeyP'), 'note', 9)).toBeNull()
  })

  it('enters offs and releases in the note column only', () => {
    expect(trackerAction(key('Digit1', '1'), 'note', 4)).toEqual({ type: 'noteOff' })
    expect(trackerAction(key('Equal', '='), 'note', 4)).toEqual({ type: 'release' })
    expect(trackerAction(key('Digit1', '1'), 'volume', 4)).toEqual({ type: 'hex', value: 1 })
  })

  it('types hex digits and effect letters', () => {
    expect(trackerAction(key('KeyB', 'b'), 'instLo', 4)).toEqual({ type: 'hex', value: 11 })
    expect(trackerAction(key('KeyG', 'g'), 'paramHi', 4)).toBeNull()
    expect(trackerAction(key('KeyA', 'a'), 'effect', 4)).toEqual({ type: 'effect', letter: 'A' })
    expect(trackerAction(key('KeyS', 's'), 'effect', 4)).toEqual({ type: 'effect', letter: 'S' })
    expect(trackerAction(key('KeyZ', 'z'), 'effect', 4)).toBeNull()
  })

  it('navigates and selects', () => {
    expect(trackerAction(key('ArrowDown'), 'note', 4)).toEqual({ type: 'move', rows: 1, columns: 0, select: false })
    expect(trackerAction(key('ArrowLeft', '', { shiftKey: true }), 'note', 4)).toEqual({ type: 'move', rows: 0, columns: -1, select: true })
    expect(trackerAction(key('PageDown'), 'note', 4)).toEqual({ type: 'move', rows: 16, columns: 0, select: false })
    expect(trackerAction(key('Tab', '', { shiftKey: true }), 'note', 4)).toEqual({ type: 'channel', delta: -1 })
  })

  it('maps editing commands', () => {
    expect(trackerAction(key('KeyC', 'c', { ctrlKey: true }), 'note', 4)).toEqual({ type: 'copy' })
    expect(trackerAction(key('KeyV', 'v', { metaKey: true }), 'note', 4)).toEqual({ type: 'paste' })
    expect(trackerAction(key('ArrowUp', '', { ctrlKey: true, shiftKey: true }), 'note', 4)).toEqual({ type: 'transpose', semitones: 12 })
    expect(trackerAction(key('Backspace'), 'note', 4)).toEqual({ type: 'deleteRow' })
    expect(trackerAction(key('KeyZ', 'z', { ctrlKey: true }), 'note', 4)).toBeNull()
    expect(trackerAction(key('KeyZ', 'z', { altKey: true }), 'note', 4)).toBeNull()
  })
})
