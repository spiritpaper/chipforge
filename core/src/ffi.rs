//! C ABI used by the browser `AudioWorklet` (and later by native engine plugins).
//!
//! Every function takes the handle returned by [`chip_new`]. Returned pointers stay
//! valid until the next call that mutates the chip.

#![allow(clippy::missing_safety_doc)]

use crate::chip::{CHANNELS, Chip, SCOPE_LEN};
use crate::sfx::{self, SfxParams};
use crate::song::{self, Cell, Drum};

#[unsafe(no_mangle)]
pub extern "C" fn chip_new(sample_rate: f32) -> *mut Chip {
    Box::into_raw(Box::new(Chip::new(sample_rate)))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_free(chip: *mut Chip) {
    if !chip.is_null() {
        drop(unsafe { Box::from_raw(chip) });
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_render(chip: *mut Chip, frames: u32) -> *const f32 {
    unsafe { &mut *chip }.render(frames as usize).as_ptr()
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_load_demo(chip: *mut Chip) {
    unsafe { &mut *chip }.load_song(song::demo());
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_play(chip: *mut Chip) {
    unsafe { &mut *chip }.play();
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_stop(chip: *mut Chip) {
    unsafe { &mut *chip }.stop();
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_set_bpm(chip: *mut Chip, bpm: f32) {
    unsafe { &mut *chip }.set_bpm(bpm);
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_bpm(chip: *const Chip) -> f32 {
    unsafe { &*chip }.bpm()
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_set_muted(chip: *mut Chip, channel: u32, muted: u32) {
    unsafe { &mut *chip }.set_muted(channel as usize, muted != 0);
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_note_on(chip: *mut Chip, channel: u32, note: u32, volume: u32) {
    unsafe { &mut *chip }.note_on(
        channel as usize,
        note.min(127) as u8,
        volume.min(15) as u8,
        4.0,
    );
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_note_off(chip: *mut Chip, channel: u32) {
    unsafe { &mut *chip }.note_off(channel as usize);
}

/// Current sequencer step, or -1 when stopped.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_current_step(chip: *const Chip) -> i32 {
    unsafe { &*chip }.current_step().map_or(-1, |s| s as i32)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_song_length(chip: *const Chip) -> u32 {
    unsafe { &*chip }.song().map_or(0, |s| s.len() as u32)
}

/// A song cell encoded for the UI: -1 hold, -2 off, 0..=127 MIDI note,
/// 128/129/130 kick/snare/hat, -3 out of range.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_cell(chip: *const Chip, channel: u32, step: u32) -> i32 {
    let cell = unsafe { &*chip }
        .song()
        .and_then(|s| s.tracks.get(channel as usize))
        .and_then(|t| t.cells.get(step as usize));
    match cell {
        Some(Cell::Hold) => -1,
        Some(Cell::Off) => -2,
        Some(Cell::Note(n)) => *n as i32,
        Some(Cell::Drum(Drum::Kick)) => 128,
        Some(Cell::Drum(Drum::Snare)) => 129,
        Some(Cell::Drum(Drum::Hat)) => 130,
        None => -3,
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_scope(chip: *mut Chip, channel: u32) -> *const f32 {
    unsafe { &mut *chip }.scope(channel as usize).as_ptr()
}

#[unsafe(no_mangle)]
pub extern "C" fn chip_scope_len() -> u32 {
    SCOPE_LEN as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn chip_channel_count() -> u32 {
    CHANNELS as u32
}

/// Scratch space for SFX work: JS reads and writes `params` directly, then renders.
pub struct SfxWorkspace {
    params: SfxParams,
    out: Vec<f32>,
}

#[unsafe(no_mangle)]
pub extern "C" fn sfx_new() -> *mut SfxWorkspace {
    Box::into_raw(Box::new(SfxWorkspace {
        params: SfxParams::default(),
        out: Vec::new(),
    }))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn sfx_free(ws: *mut SfxWorkspace) {
    if !ws.is_null() {
        drop(unsafe { Box::from_raw(ws) });
    }
}

/// Pointer to the `PARAM_COUNT` floats of the current parameters.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sfx_params(ws: *mut SfxWorkspace) -> *mut f32 {
    unsafe { &mut *ws }.params.0.as_mut_ptr()
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn sfx_generate(ws: *mut SfxWorkspace, preset: u32, seed: u32) {
    unsafe { &mut *ws }.params = sfx::generate(preset as usize, seed);
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn sfx_mutate(ws: *mut SfxWorkspace, seed: u32, amount: f32) {
    let ws = unsafe { &mut *ws };
    ws.params.sanitize();
    ws.params = sfx::mutate(&ws.params, seed, amount);
}

/// Renders the current parameters; returns the sample count (see [`sfx_samples`]).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sfx_render(ws: *mut SfxWorkspace, sample_rate: f32) -> u32 {
    let ws = unsafe { &mut *ws };
    ws.params.sanitize();
    ws.out = sfx::render(&ws.params, sample_rate.clamp(8000.0, 192_000.0));
    ws.out.len() as u32
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn sfx_samples(ws: *const SfxWorkspace) -> *const f32 {
    unsafe { &*ws }.out.as_ptr()
}

#[unsafe(no_mangle)]
pub extern "C" fn sfx_param_count() -> u32 {
    sfx::PARAM_COUNT as u32
}

fn param_spec(i: u32) -> &'static sfx::ParamSpec {
    &sfx::PARAMS[(i as usize).min(sfx::PARAM_COUNT - 1)]
}

#[unsafe(no_mangle)]
pub extern "C" fn sfx_param_min(i: u32) -> f32 {
    param_spec(i).min
}

#[unsafe(no_mangle)]
pub extern "C" fn sfx_param_max(i: u32) -> f32 {
    param_spec(i).max
}

#[unsafe(no_mangle)]
pub extern "C" fn sfx_param_default(i: u32) -> f32 {
    param_spec(i).default
}

#[unsafe(no_mangle)]
pub extern "C" fn sfx_param_integer(i: u32) -> u32 {
    param_spec(i).integer as u32
}

/// UTF-8 bytes of a parameter's key; length from [`sfx_param_key_len`].
#[unsafe(no_mangle)]
pub extern "C" fn sfx_param_key(i: u32) -> *const u8 {
    param_spec(i).key.as_ptr()
}

#[unsafe(no_mangle)]
pub extern "C" fn sfx_param_key_len(i: u32) -> u32 {
    param_spec(i).key.len() as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn sfx_preset_count() -> u32 {
    sfx::PRESETS.len() as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn sfx_preset_key(i: u32) -> *const u8 {
    sfx::PRESETS[(i as usize).min(sfx::PRESETS.len() - 1)].as_ptr()
}

#[unsafe(no_mangle)]
pub extern "C" fn sfx_preset_key_len(i: u32) -> u32 {
    sfx::PRESETS[(i as usize).min(sfx::PRESETS.len() - 1)].len() as u32
}
