// Signing in and keeping songs and sounds in sync with the server. The browser stays
// the source of truth for work in progress; the server gets a copy of every save and
// hands back what other devices changed.

import { get, set } from 'idb-keyval'
import { composer } from '../composer/composer.svelte'
import { deleteProject, listProjects, loadProject, onProjectChange, saveProject } from '../composer/projects'
import { library } from '../sfx/library.svelte'
import type { SfxEntry } from '../sfx/library-core'
import type { Song } from '../song/model'
import { validateSong } from '../song/validate'
import { ApiError, api, serverAvailable } from './api'
import { readPref, writePref } from '../lib/prefs'
import { mergeLibraries, planSync, type SongSyncState } from './plan'
import type { BillingInfo, PlanInfo } from './billing'

const STATE_KEY = 'chipforge.sync.v1'
const PUSH_DELAY_MS = 1500

interface SyncState {
  songs: Record<string, SongSyncState>
  sfx: { version: number; dirty: boolean }
}

interface Conflict<T> {
  conflict: true
  version: number
  song?: T
  library?: T
}

class Account {
  status = $state<'checking' | 'unavailable' | 'signed-out' | 'signed-in'>('checking')
  email = $state<string | null>(null)
  syncing = $state(false)
  lastSynced = $state<number | null>(null)
  error = $state<string | null>(null)
  /** Address a sign-in link was just sent to. */
  linkSentTo = $state<string | null>(null)
  /** Songs kept twice because they changed here and elsewhere at once. */
  conflicts = $state<string[]>([])
  plan = $state<PlanInfo | null>(null)
  usage = $state<{ songs: number } | null>(null)
  billing = $state<BillingInfo | null>(null)
  /** Set when the plan's limit kept songs from syncing (they stay on this device). */
  limitMessage = $state<string | null>(null)

  private state: SyncState = { songs: {}, sfx: { version: 0, dirty: false } }
  private pushTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private booting: Promise<void> | null = null

  init(): Promise<void> {
    this.booting ??= this.boot()
    return this.booting
  }

  private async boot() {
    this.state = (await get<SyncState>(STATE_KEY).catch(() => undefined)) ?? this.state
    onProjectChange((change) => {
      const st = (this.state.songs[change.id] ??= { version: null, dirty: true })
      if (change.type === 'save') {
        st.dirty = true
        this.schedulePush(change.id)
      } else void this.deleteRemote(change.id)
      void this.saveState()
    })
    library.onChange(() => {
      this.state.sfx.dirty = true
      void this.saveState()
      this.schedulePush('sfx')
    })
    if (!(await serverAvailable())) {
      this.status = 'unavailable'
      return
    }
    await this.refresh()
  }

  /** Re-checks the session (e.g. after following a sign-in link) and syncs. */
  async refresh() {
    try {
      const me = await api<{ email: string | null; plan?: PlanInfo; usage?: { songs: number }; billing: BillingInfo }>('/me')
      this.email = me.email
      this.plan = me.plan ?? null
      this.usage = me.usage ?? null
      this.billing = me.billing
      this.status = me.email ? 'signed-in' : 'signed-out'
      if (me.email) await this.syncAll()
    } catch {
      this.status = 'unavailable'
    }
  }

  async requestLink(email: string) {
    this.error = null
    try {
      await api('/auth/request', { method: 'POST', json: { email } })
      this.linkSentTo = email.trim()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    }
  }

  async signOut() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    this.email = null
    this.status = 'signed-out'
    // A different account might sign in next: forget what this one had synced.
    this.state = { songs: {}, sfx: { version: 0, dirty: false } }
    await this.saveState()
  }

  private async saveState() {
    await set(STATE_KEY, $state.snapshot(this.state)).catch(() => {})
  }

  private schedulePush(key: string) {
    if (this.status !== 'signed-in') return
    clearTimeout(this.pushTimers.get(key))
    this.pushTimers.set(
      key,
      setTimeout(() => {
        this.pushTimers.delete(key)
        void (key === 'sfx' ? this.pushLibrary() : this.pushSong(key)).then(() => this.saveState())
      }, PUSH_DELAY_MS),
    )
  }

  /** Pulls changes from other devices and pushes local ones. */
  async syncAll() {
    if (this.status !== 'signed-in' || this.syncing) return
    this.syncing = true
    this.error = null
    this.limitMessage = null
    try {
      const server = await api<{ id: string; version: number }[]>('/songs')
      // The demo song a fresh browser starts with isn't the user's work until they
      // change it; syncing it would add a copy to the account from every device.
      const starter = readPref('compose.starter')
      const untouched = (id: string) => id === starter && !this.state.songs[id]
      const local = (await listProjects()).filter((p) => !untouched(p.id))
      const plan = planSync(local.map((p) => p.id), server, this.state.songs)
      for (const id of plan.pull) await this.pullSong(id)
      for (const id of plan.push) await this.pushSong(id)
      for (const id of plan.removeLocal) {
        await deleteProject(id, { fromSync: true })
        delete this.state.songs[id]
        await composer.reloadFromStorage(id)
      }
      // Songs arrived from the account: the untouched demo song has done its job.
      if (starter && untouched(starter) && plan.pull.length) {
        await deleteProject(starter, { fromSync: true })
        writePref('compose.starter', '')
        await composer.reloadFromStorage(starter)
      }
      await this.syncLibrary()
      this.lastSynced = Date.now()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.syncing = false
      await this.saveState()
    }
  }

  private async pullSong(id: string) {
    const { version, song } = await api<{ version: number; song: unknown }>(`/songs/${encodeURIComponent(id)}`)
    const valid = validateSong(song)
    if (!valid) return
    await saveProject(id, valid, { fromSync: true })
    this.state.songs[id] = { version, dirty: false }
    await composer.reloadFromStorage(id)
  }

  private async pushSong(id: string) {
    if (this.status !== 'signed-in') return
    const song = await loadProject(id)
    if (!song) return
    const st = (this.state.songs[id] ??= { version: null, dirty: true })
    try {
      const { version } = await api<{ version: number }>(`/songs/${encodeURIComponent(id)}`, {
        method: 'PUT',
        json: { song, baseVersion: st.version },
      })
      this.state.songs[id] = { version, dirty: false }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) await this.keepBoth(id, song, err.body as Conflict<Song>)
      // Over the plan's limit: the song stays on this device, still marked to sync.
      else if (err instanceof ApiError && err.status === 402) this.limitMessage = err.message
      else this.error = err instanceof Error ? err.message : String(err)
    }
  }

  /**
   * The song changed here and on another device. Nothing is thrown away: this
   * device's version becomes a new song, and the server's takes the original's place.
   */
  private async keepBoth(id: string, mine: Song, conflict: Conflict<Song>) {
    const copyId = crypto.randomUUID()
    const title = `${mine.title} (this device)`
    await saveProject(copyId, { ...mine, title })
    const theirs = validateSong(conflict.song)
    if (theirs) await saveProject(id, theirs, { fromSync: true })
    this.state.songs[id] = { version: conflict.version, dirty: false }
    this.conflicts = [...this.conflicts, title]
    await composer.reloadFromStorage(id)
    await composer.refreshProjects()
  }

  private async deleteRemote(id: string) {
    const st = this.state.songs[id]
    delete this.state.songs[id]
    if (this.status === 'signed-in' && st?.version !== null && st?.version !== undefined) {
      await api(`/songs/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
    }
  }

  private async syncLibrary() {
    const remote = await api<{ version: number; library: { entries: SfxEntry[] } | null }>('/sfx-library')
    const sfx = this.state.sfx
    if (remote.library && remote.version > sfx.version) {
      const entries = sfx.dirty ? mergeLibraries(library.entries, remote.library.entries) : remote.library.entries
      await library.applyRemote(entries)
      sfx.version = remote.version
      if (!sfx.dirty) return
    }
    if (sfx.dirty || remote.version === 0) await this.pushLibrary()
  }

  private async pushLibrary() {
    if (this.status !== 'signed-in') return
    const sfx = this.state.sfx
    const body = { library: { entries: $state.snapshot(library.entries) }, baseVersion: sfx.version }
    try {
      const { version } = await api<{ version: number }>('/sfx-library', { method: 'PUT', json: body })
      this.state.sfx = { version, dirty: false }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Changed elsewhere too: merge both, then try once more on top of theirs.
        const theirs = err.body as Conflict<{ entries: SfxEntry[] }>
        await library.applyRemote(mergeLibraries(library.entries, theirs.library?.entries ?? []))
        this.state.sfx = { version: theirs.version, dirty: true }
        const retry = { library: { entries: $state.snapshot(library.entries) }, baseVersion: theirs.version }
        const { version } = await api<{ version: number }>('/sfx-library', { method: 'PUT', json: retry })
        this.state.sfx = { version, dirty: false }
      } else this.error = err instanceof Error ? err.message : String(err)
    }
  }

  /** Starts paying for a plan period: sends the browser to the payment gateway. */
  async checkout(plan: string, period: 'month' | 'year', gateway: string) {
    this.error = null
    try {
      const { url } = await api<{ url: string }>('/billing/checkout', { method: 'POST', json: { plan, period, gateway } })
      location.href = url
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    }
  }

  /** Makes a read-only share link for a song (syncing it first). */
  async share(id: string): Promise<string> {
    await this.pushSong(id)
    const { slug } = await api<{ slug: string }>(`/songs/${encodeURIComponent(id)}/share`, { method: 'POST' })
    return `${location.origin}${location.pathname}#/s/${slug}`
  }

  async unshare(id: string) {
    await api(`/songs/${encodeURIComponent(id)}/share`, { method: 'DELETE' })
  }
}

export const account = new Account()
