import wasmUrl from './chipcore.wasm?url'

let module: Promise<WebAssembly.Module> | null = null

/** The compiled chipcore module, fetched once and shared by every user. */
export function loadChipModule(): Promise<WebAssembly.Module> {
  module ??= WebAssembly.compileStreaming(fetch(wasmUrl)).catch((err: unknown) => {
    module = null
    throw err
  })
  return module
}
