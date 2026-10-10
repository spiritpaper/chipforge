// The ChipForge desktop app (desktop/, Tauri) runs this same web app in a native
// window. These are the few places it behaves differently.

/** True inside the desktop app. */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** Saves through the system Save dialog; false if the user cancelled. */
export async function saveFile(data: BlobPart, filename: string): Promise<boolean> {
  const { invoke } = await import('@tauri-apps/api/core')
  const bytes = await new Blob([data]).arrayBuffer()
  return invoke<boolean>('save_file', bytes, { headers: { 'x-file-name': encodeURIComponent(filename) } })
}
