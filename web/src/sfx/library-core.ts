// Pure rules for the SFX history, kept separate from storage so they're easy to test.

import type { SfxParams } from './synth'

export interface SfxEntry {
  id: string
  name: string
  preset: string
  /** The seed that generated it; null for mutations, edits and shared sounds. */
  seed: number | null
  params: SfxParams
  starred: boolean
  createdAt: number
}

/** Unkept sounds beyond this many are dropped, oldest first. Kept sounds never are. */
export const HISTORY_LIMIT = 200

/** "Coin 4" if the highest existing "Coin n" is 3. */
export function nextName(entries: { name: string }[], label: string): string {
  const pattern = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)`)
  const highest = entries.reduce((max, e) => Math.max(max, Number(pattern.exec(e.name)?.[1] ?? 0)), 0)
  return `${label} ${highest + 1}`
}

export function editName(name: string): string {
  return `${name.replace(/ edit$/, '')} edit`
}

/** Entries are newest first; keep every starred one and the newest unstarred ones. */
export function prune<T extends { starred: boolean }>(entries: T[], limit = HISTORY_LIMIT): T[] {
  let unstarred = 0
  return entries.filter((e) => e.starred || ++unstarred <= limit)
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'sound'
  )
}

/** Unique file names for a batch: "coin-1.wav", "coin-1-2.wav", ... */
export function uniqueFileNames(names: string[], ext: string): string[] {
  const used = new Set<string>()
  return names.map((name) => {
    const base = slugify(name)
    let file = `${base}.${ext}`
    for (let n = 2; used.has(file); n++) file = `${base}-${n}.${ext}`
    used.add(file)
    return file
  })
}
