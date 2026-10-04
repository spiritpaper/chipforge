import { describe, expect, it } from 'vitest'
import { addInstrument, blankInstrument, deleteInstrument, instrumentUses, resizeMacro, setMacroValues, toggleMarker, updateInstrument } from './instrument-edit'
import { macro } from './model'
import { firstLight } from './templates'

describe('instrument edits', () => {
  it('renumbers cells when an instrument is deleted', () => {
    const song = firstLight() // 0 lead, 1 echo, 2 bass, 3 kick, 4 snare, 5 hat
    expect(instrumentUses(song, 1)).toBeGreaterThan(0)
    const after = deleteInstrument(song, 1)
    expect(after.instruments.map((i) => i.name)).toEqual(['Lead', 'Triangle bass', 'Kick', 'Snare', 'Hi-hat'])
    const used = new Set(after.patterns[0].channels.flatMap((cells) => cells.map((c) => c.instrument)))
    expect(used).toEqual(new Set([null, 0, 1, 2, 3, 4]))
    // Channel 1 used instrument 1, which no longer exists.
    expect(after.patterns[0].channels[1].every((c) => c.instrument === null)).toBe(true)
    // Bass notes moved from 2 to 1.
    expect(after.patterns[0].channels[2][0].instrument).toBe(1)
  })

  it('keeps at least one instrument', () => {
    const one = { ...firstLight(), instruments: [blankInstrument()] }
    expect(deleteInstrument(one, 0)).toBe(one)
  })

  it('adds copies, not shared references', () => {
    const inst = blankInstrument()
    const song = addInstrument(firstLight(), inst)
    song.instruments.at(-1)!.volume.values.push(1)
    expect(inst.volume.values).toEqual([15])
  })

  it('clamps drawn values to the macro range', () => {
    expect(setMacroValues(macro([0, 0, 0]), 1, [99, -5], 'volume').values).toEqual([0, 15, 0])
    expect(setMacroValues(macro([0]), 0, [-40], 'pitch').values).toEqual([-16])
    expect(setMacroValues(macro([0]), 3, [1], 'duty').values).toEqual([0])
  })

  it('resizes macros and drops markers that fall off', () => {
    expect(resizeMacro(macro([15, 10], 1, null), 4, 'volume')).toEqual(macro([15, 10, 10, 10], 1, null))
    expect(resizeMacro(macro([15, 10, 5], 2, 1), 1, 'volume')).toEqual(macro([15], null, null))
    expect(resizeMacro(macro([]), 2, 'duty').values).toEqual([2, 2])
  })

  it('toggles loop and release markers', () => {
    const m = toggleMarker(macro([1, 2, 3]), 'loop', 1)
    expect(m.loop).toBe(1)
    expect(toggleMarker(m, 'loop', 1).loop).toBeNull()
  })

  it('renames without touching other instruments', () => {
    const song = firstLight()
    const next = updateInstrument(song, 2, { name: 'Bass' })
    expect(next.instruments[2].name).toBe('Bass')
    expect(next.instruments[0]).toBe(song.instruments[0])
  })
})
