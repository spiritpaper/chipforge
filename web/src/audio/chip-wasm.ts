// The C ABI exported by chipcore (see core/src/ffi.rs).

export interface ChipExports {
  memory: WebAssembly.Memory
  chip_new(sampleRate: number): number
  chip_free(chip: number): void
  chip_load_demo(chip: number): void
  chip_render(chip: number, frames: number): number
  chip_play(chip: number): void
  chip_stop(chip: number): void
  chip_set_bpm(chip: number, bpm: number): void
  chip_bpm(chip: number): number
  chip_set_muted(chip: number, channel: number, muted: number): void
  chip_note_on(chip: number, channel: number, note: number, volume: number): void
  chip_note_off(chip: number, channel: number): void
  chip_current_step(chip: number): number
  chip_song_length(chip: number): number
  chip_cell(chip: number, channel: number, step: number): number
  chip_scope(chip: number, channel: number): number
  chip_scope_len(): number
  chip_channel_count(): number

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
}

export async function instantiateChip(module: WebAssembly.Module): Promise<ChipExports> {
  const instance = await WebAssembly.instantiate(module, {})
  return instance.exports as unknown as ChipExports
}

/** Every channel's encoded cells for the loaded song. */
export function readGrid(wasm: ChipExports, chip: number): Int32Array[] {
  const length = wasm.chip_song_length(chip)
  return Array.from({ length: wasm.chip_channel_count() }, (_, ch) =>
    Int32Array.from({ length }, (_, step) => wasm.chip_cell(chip, ch, step)),
  )
}
