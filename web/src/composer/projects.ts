// Saved songs in IndexedDB: a small index plus one record per song.

import { del, get, set } from 'idb-keyval'
import type { Song } from '../song/model'
import { validateSong } from '../song/validate'

export interface ProjectMeta {
  id: string
  title: string
  updatedAt: number
}

const INDEX_KEY = 'chipforge.projects.v1'
const songKey = (id: string) => `chipforge.project.${id}`

/** Local changes, for sync. Changes made by sync itself pass `fromSync` and aren't reported. */
export type ProjectChange = { type: 'save'; id: string } | { type: 'delete'; id: string }
const listeners = new Set<(change: ProjectChange) => void>()

export function onProjectChange(listener: (change: ProjectChange) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const index = await get<ProjectMeta[]>(INDEX_KEY)
  return (index ?? []).slice().sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function loadProject(id: string): Promise<Song | null> {
  return validateSong(await get(songKey(id)))
}

export async function saveProject(id: string, song: Song, { fromSync = false } = {}): Promise<ProjectMeta[]> {
  await set(songKey(id), song)
  const index = (await get<ProjectMeta[]>(INDEX_KEY)) ?? []
  const meta = { id, title: song.title, updatedAt: Date.now() }
  const next = [meta, ...index.filter((p) => p.id !== id)]
  await set(INDEX_KEY, next)
  if (!fromSync) listeners.forEach((l) => l({ type: 'save', id }))
  return next
}

export async function deleteProject(id: string, { fromSync = false } = {}): Promise<ProjectMeta[]> {
  await del(songKey(id))
  const next = ((await get<ProjectMeta[]>(INDEX_KEY)) ?? []).filter((p) => p.id !== id)
  await set(INDEX_KEY, next)
  if (!fromSync) listeners.forEach((l) => l({ type: 'delete', id }))
  return next
}
