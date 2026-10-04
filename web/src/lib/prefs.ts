// Per-browser UI conveniences. Storage can be unavailable, so every access is guarded.

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(`chipforge.${key}`)
  } catch {
    return null
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(`chipforge.${key}`, value)
  } catch {
    // Not important enough to report.
  }
}
