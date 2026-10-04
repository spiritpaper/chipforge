// The SFX history and kept sounds, persisted to IndexedDB.

import { get, set } from 'idb-keyval'
import { prune, type SfxEntry } from './library-core'

const STORAGE_KEY = 'chipforge.sfx-library.v1'

class SfxLibrary {
  /** Newest first. */
  entries = $state<SfxEntry[]>([])
  selectedId = $state<string | null>(null)
  filter = $state<'all' | 'kept'>('all')

  selected = $derived(this.entries.find((e) => e.id === this.selectedId) ?? null)
  visible = $derived(this.filter === 'kept' ? this.entries.filter((e) => e.starred) : this.entries)
  keptCount = $derived(this.entries.filter((e) => e.starred).length)

  private saveTimer: ReturnType<typeof setTimeout> | undefined

  async load() {
    try {
      const saved = await get<{ entries: SfxEntry[]; selectedId: string | null }>(STORAGE_KEY)
      if (!saved?.entries) return
      this.entries = saved.entries
      this.selectedId = saved.selectedId ?? saved.entries[0]?.id ?? null
    } catch {
      // Private windows can block IndexedDB; the lab still works for this session.
    }
  }

  add(input: Pick<SfxEntry, 'name' | 'preset' | 'seed' | 'params'>): SfxEntry {
    const entry: SfxEntry = { ...input, id: crypto.randomUUID(), starred: false, createdAt: Date.now() }
    this.entries = prune([entry, ...this.entries])
    this.selectedId = entry.id
    this.save()
    return entry
  }

  update(id: string, patch: Partial<Omit<SfxEntry, 'id'>>) {
    const i = this.entries.findIndex((e) => e.id === id)
    if (i < 0) return
    this.entries[i] = { ...this.entries[i], ...patch }
    this.save()
  }

  toggleStar(id: string) {
    const entry = this.entries.find((e) => e.id === id)
    if (entry) this.update(id, { starred: !entry.starred })
  }

  select(id: string) {
    this.selectedId = id
    this.save()
  }

  /** The id `delta` rows away from the selection in the visible list. */
  neighbor(delta: number): string | null {
    const list = this.visible
    if (list.length === 0) return null
    const i = list.findIndex((e) => e.id === this.selectedId)
    const next = i < 0 ? 0 : Math.min(list.length - 1, Math.max(0, i + delta))
    return list[next].id
  }

  private save() {
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      const snapshot = $state.snapshot({ entries: this.entries, selectedId: this.selectedId })
      set(STORAGE_KEY, snapshot).catch(() => {})
    }, 300)
  }
}

export const library = new SfxLibrary()
