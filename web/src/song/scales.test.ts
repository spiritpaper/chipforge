import { describe, expect, it } from 'vitest'
import { detectKey, inScale, snapToScale } from './scales'
import { TEMPLATES } from './templates'
import { validateSong } from './validate'
import { emptySong } from './model'

describe('scales', () => {
  const aMinor = { root: 9, scale: 'minor' as const }

  it('knows which notes are in a scale', () => {
    expect([69, 71, 72, 73].map((n) => inScale(n, aMinor))).toEqual([true, true, true, false])
    expect(inScale(61, { root: 1, scale: 'majorPentatonic' })).toBe(true)
  })

  it('snaps notes to the nearest note of the scale', () => {
    expect(snapToScale(73, aMinor)).toBe(74) // C# → D (ties go up)
    expect(snapToScale(70, aMinor)).toBe(71) // A# → B
    expect(snapToScale(69, aMinor)).toBe(69)
    expect(snapToScale(61, { root: 0, scale: 'minorPentatonic' })).toBe(60) // C# → C (E♭ is further)
  })

  it('finds the key of every template', () => {
    const found = Object.fromEntries(TEMPLATES.filter((t) => t.id !== 'empty').map((t) => [t.id, detectKey(t.create())]))
    expect(found['first-light']).toEqual({ root: 9, scale: 'minor' }) // A minor
    expect(found.overworld).toEqual({ root: 0, scale: 'major' }) // C major
    expect(found.dungeon).toEqual({ root: 2, scale: 'minor' }) // D minor
    expect(found.boss).toEqual({ root: 4, scale: 'minor' }) // E minor
    expect(found['title-screen']).toEqual({ root: 2, scale: 'major' }) // D major
    expect(found.town).toEqual({ root: 5, scale: 'major' }) // F major
    expect(found.menu).toEqual({ root: 7, scale: 'major' }) // G major
    expect(found['game-over']).toEqual({ root: 0, scale: 'minor' }) // C minor
    expect(found['level-clear']).toEqual({ root: 7, scale: 'major' }) // G major
    expect(detectKey(emptySong())).toBeNull()
  })

  it('keeps a song key through saving, and drops a damaged one', () => {
    const song = { ...emptySong(), key: aMinor }
    expect(validateSong(JSON.parse(JSON.stringify(song)))?.key).toEqual(aMinor)
    expect(validateSong({ ...song, key: { root: 14, scale: 'major' } })?.key).toBeUndefined()
    expect(validateSong({ ...song, key: { root: 1, scale: 'nope' } })).not.toBeNull()
  })
})
