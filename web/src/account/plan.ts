// Pure sync decisions, kept apart from the network so every case is tested.

/** What this browser knows about a song's last sync. */
export interface SongSyncState {
  /** Server version this browser last had; null if never on the server. */
  version: number | null
  /** Changed here since the last successful push. */
  dirty: boolean
}

export interface SyncPlan {
  /** Download from the server (new, or changed elsewhere and not changed here). */
  pull: string[]
  /** Upload (changed here, or never uploaded). The server reports conflicts. */
  push: string[]
  /** Deleted on another device and unchanged here: delete locally too. */
  removeLocal: string[]
}

export function planSync(
  localIds: string[],
  server: { id: string; version: number }[],
  state: Record<string, SongSyncState>,
): SyncPlan {
  const plan: SyncPlan = { pull: [], push: [], removeLocal: [] }
  const local = new Set(localIds)
  const onServer = new Set(server.map((s) => s.id))
  for (const s of server) {
    const st = state[s.id]
    if (!local.has(s.id)) plan.pull.push(s.id)
    // Unknown here but present locally (e.g. same id from another account): push and
    // let the server decide; a conflict keeps both copies.
    else if (!st || st.dirty) plan.push.push(s.id)
    else if (st.version === null || s.version > st.version) plan.pull.push(s.id)
  }
  for (const id of localIds) {
    if (onServer.has(id)) continue
    const st = state[id]
    if (st && st.version !== null && !st.dirty) plan.removeLocal.push(id)
    else plan.push.push(id)
  }
  return plan
}

interface Entry {
  id: string
}

/**
 * Merges two SFX libraries: every entry from both, local winning where the same entry
 * exists in both (it's the one being edited here). Newest first, by createdAt.
 */
export function mergeLibraries<T extends Entry & { createdAt: number }>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>()
  for (const e of remote) byId.set(e.id, e)
  for (const e of local) byId.set(e.id, e)
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt)
}
