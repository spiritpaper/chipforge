// Calls to the ChipForge server (same origin, under /api). The session lives in an
// HttpOnly cookie the browser sends along; scripts never see it.

import { isDesktop } from '../lib/desktop'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message: string,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!response.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail
    throw new ApiError(response.status, body, typeof detail === 'string' ? detail : `The server answered ${response.status}.`)
  }
  return body as T
}

/** Whether a ChipForge server answers here (a static deployment has none). */
export async function serverAvailable(): Promise<boolean> {
  // Builds known to have no server (the desktop app, GitHub Pages) don't ask: on Pages,
  // /api belongs to the rest of the website.
  if (isDesktop || import.meta.env.VITE_NO_SERVER === '1') return false
  try {
    const r = await fetch('/api/health')
    return r.ok && (await r.json()).status === 'ok'
  } catch {
    return false
  }
}
