//! ChipForge's player as a C library (see `include/chipforge.h`, which documents every
//! function). Engines link the cdylib or staticlib; Rust users can use `chipcore`.

#![allow(clippy::missing_safety_doc)]

use chipcore::chip::{CHANNELS, Chip, MAX_BLOCK};
use chipcore::tracker::{DecodeError, Song};
use std::ffi::{CStr, c_char};

pub const API_VERSION: u32 = 1;

pub struct ChipforgePlayer {
    chip: Chip,
}

const OK: i32 = 0;
const ERR_NULL: i32 = -6;

fn decode_error_code(e: DecodeError) -> i32 {
    match e {
        DecodeError::BadMagic => -1,
        DecodeError::UnsupportedVersion(_) => -2,
        DecodeError::Truncated => -3,
        DecodeError::BadHeader(_) => -4,
        DecodeError::BadOrder(_) => -5,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn chipforge_api_version() -> u32 {
    API_VERSION
}

#[unsafe(no_mangle)]
pub extern "C" fn chipforge_error_message(code: i32) -> *const c_char {
    let msg: &CStr = match code {
        0 => c"ok",
        -1 => c"not a .chipsong file",
        -2 => c"song made by a newer ChipForge; update the plugin",
        -3 => c"song file is cut short",
        -4 => c"song has a setting out of range",
        -5 => c"song order points at a missing pattern",
        -6 => c"no player or no data",
        _ => c"unknown error",
    };
    msg.as_ptr()
}

#[unsafe(no_mangle)]
pub extern "C" fn chipforge_player_new(sample_rate: f32) -> *mut ChipforgePlayer {
    if !(8000.0..=384_000.0).contains(&sample_rate) {
        return std::ptr::null_mut();
    }
    Box::into_raw(Box::new(ChipforgePlayer {
        chip: Chip::new(sample_rate),
    }))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chipforge_player_free(player: *mut ChipforgePlayer) {
    if !player.is_null() {
        drop(unsafe { Box::from_raw(player) });
    }
}

/// Shared and exclusive access that turn NULL into "do nothing".
unsafe fn get<'a>(p: *const ChipforgePlayer) -> Option<&'a ChipforgePlayer> {
    unsafe { p.as_ref() }
}

unsafe fn get_mut<'a>(p: *mut ChipforgePlayer) -> Option<&'a mut ChipforgePlayer> {
    unsafe { p.as_mut() }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chipforge_player_load(
    player: *mut ChipforgePlayer,
    data: *const u8,
    len: usize,
) -> i32 {
    let (Some(p), false) = (unsafe { get_mut(player) }, data.is_null()) else {
        return ERR_NULL;
    };
    match Song::decode(unsafe { std::slice::from_raw_parts(data, len) }) {
        Ok(song) => {
            p.chip.load_song(song);
            OK
        }
        Err(e) => decode_error_code(e),
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chipforge_player_play(player: *mut ChipforgePlayer, order: u32, row: u32) {
    if let Some(p) = unsafe { get_mut(player) } {
        p.chip.play_from(order as usize, row as usize);
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chipforge_player_stop(player: *mut ChipforgePlayer) {
    if let Some(p) = unsafe { get_mut(player) } {
        p.chip.stop();
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chipforge_player_is_playing(player: *const ChipforgePlayer) -> i32 {
    unsafe { get(player) }.is_some_and(|p| p.chip.player().is_playing()) as i32
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chipforge_player_order(player: *const ChipforgePlayer) -> i32 {
    unsafe { get(player) }
        .and_then(|p| p.chip.position())
        .map_or(-1, |pos| pos.order as i32)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chipforge_player_row(player: *const ChipforgePlayer) -> i32 {
    unsafe { get(player) }
        .and_then(|p| p.chip.position())
        .map_or(-1, |pos| pos.row as i32)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chipforge_player_order_count(player: *const ChipforgePlayer) -> u32 {
    unsafe { get(player) }.map_or(0, |p| p.chip.player().song().order.len() as u32)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chipforge_player_loops(player: *const ChipforgePlayer) -> u32 {
    unsafe { get(player) }.map_or(0, |p| p.chip.player().loops())
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chipforge_player_queue_order(player: *mut ChipforgePlayer, order: u32) {
    if let Some(p) = unsafe { get_mut(player) } {
        p.chip.player_mut().queue_order(order as usize);
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chipforge_player_set_muted(
    player: *mut ChipforgePlayer,
    channel: u32,
    muted: i32,
) {
    if let Some(p) = unsafe { get_mut(player) } {
        p.chip.set_muted(channel as usize, muted != 0);
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chipforge_player_set_tempo_scale(
    player: *mut ChipforgePlayer,
    scale: f32,
) {
    if let Some(p) = unsafe { get_mut(player) } {
        p.chip.player_mut().set_tempo_scale(scale as f64);
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chipforge_player_set_volume(player: *mut ChipforgePlayer, volume: f32) {
    if let Some(p) = unsafe { get_mut(player) } {
        p.chip.set_volume(volume);
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chipforge_player_set_play_once(player: *mut ChipforgePlayer, on: i32) {
    if let Some(p) = unsafe { get_mut(player) } {
        p.chip.player_mut().set_play_once(on != 0);
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chipforge_player_take_finished(player: *mut ChipforgePlayer) -> i32 {
    unsafe { get_mut(player) }.is_some_and(|p| p.chip.player_mut().take_finished()) as i32
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chipforge_player_render(
    player: *mut ChipforgePlayer,
    out: *mut f32,
    frames: usize,
    channels: u32,
) {
    if out.is_null() || channels == 0 {
        return;
    }
    let out = unsafe { std::slice::from_raw_parts_mut(out, frames * channels as usize) };
    let Some(p) = (unsafe { get_mut(player) }) else {
        out.fill(0.0);
        return;
    };
    let ch = channels as usize;
    let mut done = 0;
    while done < frames {
        let n = (frames - done).min(MAX_BLOCK);
        let block = p.chip.render(n);
        for (i, &s) in block.iter().enumerate() {
            out[(done + i) * ch..(done + i + 1) * ch].fill(s);
        }
        done += n;
    }
}

const _: () = assert!(CHANNELS == 4, "chipforge.h promises four channels");
