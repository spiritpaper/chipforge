//! C ABI used by the browser `AudioWorklet` (and later by native engine plugins).
//!
//! Every function takes the handle returned by [`chip_new`]. Returned pointers stay
//! valid until the next call that mutates the chip.

#![allow(clippy::missing_safety_doc)]

use crate::chip::{CHANNELS, Chip, Rendered, SCOPE_LEN};
use crate::sfx::{self, SfxParams};
use crate::sfxr::{self, SfxrParams};
use crate::tracker::{DecodeError, Song};

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

/// Allocates `len` bytes for JS to fill (e.g. an encoded song). Free with [`buffer_free`].
#[unsafe(no_mangle)]
pub extern "C" fn buffer_alloc(len: u32) -> *mut u8 {
    let mut buf = vec![0u8; len as usize].into_boxed_slice();
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn buffer_free(ptr: *mut u8, len: u32) {
    if !ptr.is_null() {
        drop(unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len as usize)) });
    }
}

unsafe fn bytes<'a>(ptr: *const u8, len: u32) -> &'a [u8] {
    if ptr.is_null() {
        &[]
    } else {
        unsafe { std::slice::from_raw_parts(ptr, len as usize) }
    }
}

/// Error codes returned by [`chip_load_song`] and [`song_render`].
fn decode_status(err: DecodeError) -> i32 {
    match err {
        DecodeError::BadMagic => -1,
        DecodeError::UnsupportedVersion(_) => -2,
        DecodeError::Truncated => -3,
        DecodeError::BadHeader(_) => -4,
        DecodeError::BadOrder(_) => -5,
    }
}

/// Loads an encoded song (see `tracker` docs), keeping playback going. 0 on success.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_load_song(chip: *mut Chip, ptr: *const u8, len: u32) -> i32 {
    match Song::decode(unsafe { bytes(ptr, len) }) {
        Ok(song) => {
            unsafe { &mut *chip }.load_song(song);
            0
        }
        Err(e) => decode_status(e),
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_play_from(chip: *mut Chip, order: u32, row: u32) {
    unsafe { &mut *chip }.play_from(order as usize, row as usize);
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_stop(chip: *mut Chip) {
    unsafe { &mut *chip }.stop();
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_set_loop_pattern(chip: *mut Chip, on: u32) {
    unsafe { &mut *chip }.player_mut().set_loop_pattern(on != 0);
}

/// Playback position packed as `order << 16 | row`, or -1 when stopped.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_position(chip: *const Chip) -> i32 {
    unsafe { &*chip }
        .position()
        .map_or(-1, |p| ((p.order as i32) << 16) | p.row as i32)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_set_muted(chip: *mut Chip, channel: u32, muted: u32) {
    unsafe { &mut *chip }.set_muted(channel as usize, muted != 0);
}

/// Plays a note outside the song, e.g. while typing notes in the editor.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_preview(chip: *mut Chip, channel: u32, note: u32, instrument: u32) {
    unsafe { &mut *chip }.player_mut().preview(
        channel as usize,
        note.min(127) as u8,
        instrument.min(254) as u8,
    );
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chip_preview_off(chip: *mut Chip, channel: u32) {
    unsafe { &mut *chip }
        .player_mut()
        .preview_off(channel as usize);
}

/// Renders an encoded song once through for export. Returns null if it doesn't decode.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn song_render(ptr: *const u8, len: u32, sample_rate: f32) -> *mut Rendered {
    match Song::decode(unsafe { bytes(ptr, len) }) {
        Ok(song) => Box::into_raw(Box::new(Chip::render_song(
            song,
            sample_rate.clamp(8000.0, 192_000.0),
        ))),
        Err(_) => std::ptr::null_mut(),
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn rendered_samples(r: *const Rendered) -> *const f32 {
    unsafe { &*r }.samples.as_ptr()
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn rendered_len(r: *const Rendered) -> u32 {
    unsafe { &*r }.samples.len() as u32
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn rendered_loop_start(r: *const Rendered) -> u32 {
    unsafe { &*r }.loop_start as u32
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn rendered_looped(r: *const Rendered) -> u32 {
    unsafe { &*r }.looped as u32
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn rendered_free(r: *mut Rendered) {
    if !r.is_null() {
        drop(unsafe { Box::from_raw(r) });
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

/// The classic (sfxr) engine's workspace, used like [`SfxWorkspace`].
pub struct SfxrWorkspace {
    params: SfxrParams,
    out: Vec<f32>,
}

#[unsafe(no_mangle)]
pub extern "C" fn sfxr_new() -> *mut SfxrWorkspace {
    Box::into_raw(Box::new(SfxrWorkspace {
        params: SfxrParams::default(),
        out: Vec::new(),
    }))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn sfxr_free(ws: *mut SfxrWorkspace) {
    if !ws.is_null() {
        drop(unsafe { Box::from_raw(ws) });
    }
}

/// Pointer to the `sfxr::PARAM_COUNT` floats of the current parameters.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sfxr_params(ws: *mut SfxrWorkspace) -> *mut f32 {
    unsafe { &mut *ws }.params.0.as_mut_ptr()
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn sfxr_generate(ws: *mut SfxrWorkspace, preset: u32, seed: u32) {
    unsafe { &mut *ws }.params = sfxr::generate(preset as usize, seed);
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn sfxr_mutate(ws: *mut SfxrWorkspace, seed: u32, amount: f32) {
    let ws = unsafe { &mut *ws };
    ws.params = sfxr::mutate(&ws.params.canonical(), seed, amount);
}

/// Brings imported values into range without changing the sound (see
/// [`SfxrParams::canonical`]).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sfxr_canonical(ws: *mut SfxrWorkspace) {
    let ws = unsafe { &mut *ws };
    ws.params = ws.params.canonical();
}

/// Renders the current parameters; returns the sample count (see [`sfxr_samples`]).
#[unsafe(no_mangle)]
pub unsafe extern "C" fn sfxr_render(ws: *mut SfxrWorkspace, sample_rate: f32) -> u32 {
    let ws = unsafe { &mut *ws };
    ws.params = ws.params.canonical();
    ws.out = sfxr::render(&ws.params, sample_rate.clamp(8000.0, 192_000.0));
    ws.out.len() as u32
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn sfxr_samples(ws: *const SfxrWorkspace) -> *const f32 {
    unsafe { &*ws }.out.as_ptr()
}

#[unsafe(no_mangle)]
pub extern "C" fn sfxr_param_count() -> u32 {
    sfxr::PARAM_COUNT as u32
}

fn sfxr_spec(i: u32) -> &'static sfx::ParamSpec {
    &sfxr::PARAMS[(i as usize).min(sfxr::PARAM_COUNT - 1)]
}

#[unsafe(no_mangle)]
pub extern "C" fn sfxr_param_min(i: u32) -> f32 {
    sfxr_spec(i).min
}

#[unsafe(no_mangle)]
pub extern "C" fn sfxr_param_max(i: u32) -> f32 {
    sfxr_spec(i).max
}

#[unsafe(no_mangle)]
pub extern "C" fn sfxr_param_default(i: u32) -> f32 {
    sfxr_spec(i).default
}

#[unsafe(no_mangle)]
pub extern "C" fn sfxr_param_integer(i: u32) -> u32 {
    sfxr_spec(i).integer as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn sfxr_param_key(i: u32) -> *const u8 {
    sfxr_spec(i).key.as_ptr()
}

#[unsafe(no_mangle)]
pub extern "C" fn sfxr_param_key_len(i: u32) -> u32 {
    sfxr_spec(i).key.len() as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn sfxr_preset_count() -> u32 {
    sfxr::PRESETS.len() as u32
}

#[unsafe(no_mangle)]
pub extern "C" fn sfxr_preset_key(i: u32) -> *const u8 {
    sfxr::PRESETS[(i as usize).min(sfxr::PRESETS.len() - 1)].as_ptr()
}

#[unsafe(no_mangle)]
pub extern "C" fn sfxr_preset_key_len(i: u32) -> u32 {
    sfxr::PRESETS[(i as usize).min(sfxr::PRESETS.len() - 1)].len() as u32
}

/// Exports an encoded song as a VGM file (see `vgm`). Read the result with
/// [`bytes_ptr`]/[`bytes_len`] and release it with [`bytes_free`]; null if the song
/// doesn't decode.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn vgm_render(
    ptr: *const u8,
    len: u32,
    title: *const u8,
    title_len: u32,
) -> *mut Vec<u8> {
    let Ok(song) = Song::decode(unsafe { bytes(ptr, len) }) else {
        return std::ptr::null_mut();
    };
    let title = String::from_utf8_lossy(unsafe { bytes(title, title_len) }).into_owned();
    Box::into_raw(Box::new(crate::vgm::render_vgm(song, &title)))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn bytes_ptr(b: *const Vec<u8>) -> *const u8 {
    unsafe { &*b }.as_ptr()
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn bytes_len(b: *const Vec<u8>) -> u32 {
    unsafe { &*b }.len() as u32
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn bytes_free(b: *mut Vec<u8>) {
    if !b.is_null() {
        drop(unsafe { Box::from_raw(b) });
    }
}
