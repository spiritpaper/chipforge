import { describe, expect, it } from 'vitest'
import { mergeLibraries, planSync } from './plan'

const synced = (version: number) => ({ version, dirty: false })
const edited = (version: number | null) => ({ version, dirty: true })

describe('planSync', () => {
  it('pulls songs that are new or changed elsewhere', () => {
    expect(planSync(['a'], [{ id: 'a', version: 3 }, { id: 'b', version: 1 }], { a: synced(2) })).toEqual({
      pull: ['a', 'b'],
      push: [],
      removeLocal: [],
    })
  })

  it('leaves unchanged songs alone', () => {
    expect(planSync(['a'], [{ id: 'a', version: 2 }], { a: synced(2) })).toEqual({ pull: [], push: [], removeLocal: [] })
  })

  it('pushes songs changed here, even if changed elsewhere too (the server spots the conflict)', () => {
    expect(planSync(['a'], [{ id: 'a', version: 5 }], { a: edited(2) }).push).toEqual(['a'])
  })

  it('pushes songs never uploaded', () => {
    expect(planSync(['new'], [], {}).push).toEqual(['new'])
    expect(planSync(['new'], [], { new: edited(null) }).push).toEqual(['new'])
  })

  it('deletes locally what was deleted elsewhere, unless it changed here', () => {
    expect(planSync(['gone', 'kept'], [], { gone: synced(4), kept: edited(4) })).toEqual({
      pull: [],
      push: ['kept'],
      removeLocal: ['gone'],
    })
  })

  it('pushes a local song with an id the server has but this browser never synced', () => {
    expect(planSync(['a'], [{ id: 'a', version: 1 }], {}).push).toEqual(['a'])
  })
})

describe('mergeLibraries', () => {
  it('keeps every sound, with local edits winning, newest first', () => {
    const local = [{ id: 'x', createdAt: 2, name: 'Coin (renamed here)' }, { id: 'y', createdAt: 5, name: 'Jump' }]
    const remote = [{ id: 'x', createdAt: 2, name: 'Coin' }, { id: 'z', createdAt: 9, name: 'Laser' }]
    expect(mergeLibraries(local, remote).map((e) => e.name)).toEqual(['Laser', 'Jump', 'Coin (renamed here)'])
  })
})
