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

export async function listProjects(): Promise<ProjectMeta[]> {
  const index = await get<ProjectMeta[]>(INDEX_KEY)
  return (index ?? []).slice().sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function loadProject(id: string): Promise<Song | null> {
  return validateSong(await get(songKey(id)))
}

export async function saveProject(id: string, song: Song): Promise<ProjectMeta[]> {
  await set(songKey(id), song)
  const index = (await get<ProjectMeta[]>(INDEX_KEY)) ?? []
  const meta = { id, title: song.title, updatedAt: Date.now() }
  const next = [meta, ...index.filter((p) => p.id !== id)]
  await set(INDEX_KEY, next)
  return next
}

export async function deleteProject(id: string): Promise<ProjectMeta[]> {
  await del(songKey(id))
  const next = ((await get<ProjectMeta[]>(INDEX_KEY)) ?? []).filter((p) => p.id !== id)
  await set(INDEX_KEY, next)
  return next
}
