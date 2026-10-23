// The C ABI exported by chipcore (see core/src/ffi.rs).

export interface ChipExports {
  memory: WebAssembly.Memory
  buffer_alloc(len: number): number
  buffer_free(ptr: number, len: number): void

  chip_new(sampleRate: number): number
  chip_free(chip: number): void
  chip_render(chip: number, frames: number): number
  chip_load_song(chip: number, ptr: number, len: number): number
  chip_play_from(chip: number, order: number, row: number): void
  chip_stop(chip: number): void
  chip_set_loop_pattern(chip: number, on: number): void
  chip_position(chip: number): number
  chip_set_muted(chip: number, channel: number, muted: number): void
  chip_preview(chip: number, channel: number, note: number, instrument: number): void
  chip_preview_off(chip: number, channel: number): void
  chip_scope(chip: number, channel: number): number
  chip_scope_len(): number
  chip_channel_count(): number

  song_render(ptr: number, len: number, sampleRate: number): number
  rendered_samples(r: number): number
  rendered_len(r: number): number
  rendered_loop_start(r: number): number
  rendered_looped(r: number): number
  rendered_free(r: number): void

  vgm_render(ptr: number, len: number, title: number, titleLen: number): number
  bytes_ptr(b: number): number
  bytes_len(b: number): number
  bytes_free(b: number): void

  sfx_new(): number
  sfx_free(ws: number): void
  sfx_params(ws: number): number
  sfx_generate(ws: number, preset: number, seed: number): void
  sfx_mutate(ws: number, seed: number, amount: number): void
  sfx_render(ws: number, sampleRate: number): number
  sfx_samples(ws: number): number
  sfx_param_count(): number
  sfx_param_min(i: number): number
  sfx_param_max(i: number): number
  sfx_param_default(i: number): number
  sfx_param_integer(i: number): number
  sfx_param_key(i: number): number
  sfx_param_key_len(i: number): number
  sfx_preset_count(): number
  sfx_preset_key(i: number): number
  sfx_preset_key_len(i: number): number

  // The classic (sfxr) engine: the same calls, plus `canonical` for imported sounds.
  sfxr_new(): number
  sfxr_free(ws: number): void
  sfxr_params(ws: number): number
  sfxr_generate(ws: number, preset: number, seed: number): void
  sfxr_mutate(ws: number, seed: number, amount: number): void
  sfxr_canonical(ws: number): void
  sfxr_render(ws: number, sampleRate: number): number
  sfxr_samples(ws: number): number
  sfxr_param_count(): number
  sfxr_param_min(i: number): number
  sfxr_param_max(i: number): number
  sfxr_param_default(i: number): number
  sfxr_param_integer(i: number): number
  sfxr_param_key(i: number): number
  sfxr_param_key_len(i: number): number
  sfxr_preset_count(): number
  sfxr_preset_key(i: number): number
  sfxr_preset_key_len(i: number): number
}

export async function instantiateChip(module: WebAssembly.Module): Promise<ChipExports> {
  const instance = await WebAssembly.instantiate(module, {})
  return instance.exports as unknown as ChipExports
}

/** Copies bytes into wasm memory, calls `use` with (ptr, len), then frees them. */
export function withBytes<T>(wasm: ChipExports, bytes: Uint8Array, use: (ptr: number, len: number) => T): T {
  const ptr = wasm.buffer_alloc(bytes.length)
  try {
    new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes)
    return use(ptr, bytes.length)
  } finally {
    wasm.buffer_free(ptr, bytes.length)
  }
}

/** Unpacks chip_position: null when stopped. */
export function unpackPosition(packed: number): { order: number; row: number } | null {
  return packed < 0 ? null : { order: packed >>> 16, row: packed & 0xffff }
}

export interface RenderedSong {
  samples: Float32Array
  loopStart: number
  looped: boolean
}

/** Renders an encoded song once through (for export), or null if it doesn't decode. */
export function renderSong(wasm: ChipExports, encoded: Uint8Array, sampleRate: number): RenderedSong | null {
  const r = withBytes(wasm, encoded, (ptr, len) => wasm.song_render(ptr, len, sampleRate))
  if (r === 0) return null
  try {
    return {
      samples: new Float32Array(wasm.memory.buffer, wasm.rendered_samples(r), wasm.rendered_len(r)).slice(),
      loopStart: wasm.rendered_loop_start(r),
      looped: wasm.rendered_looped(r) === 1,
    }
  } finally {
    wasm.rendered_free(r)
  }
}

/** A song as a VGM file (NES APU register log), or null if it doesn't decode. */
export function renderVgm(wasm: ChipExports, encoded: Uint8Array, title: string): Uint8Array<ArrayBuffer> | null {
  const titleBytes = new TextEncoder().encode(title)
  const b = withBytes(wasm, encoded, (sp, sl) => withBytes(wasm, titleBytes, (tp, tl) => wasm.vgm_render(sp, sl, tp, tl)))
  if (b === 0) return null
  try {
    return new Uint8Array(wasm.memory.buffer, wasm.bytes_ptr(b), wasm.bytes_len(b)).slice()
  } finally {
    wasm.bytes_free(b)
  }
}
