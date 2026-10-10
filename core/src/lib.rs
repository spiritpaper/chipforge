//! ChipForge's sound chip core.
//!
//! Compiled natively for tests and engine plugins, and to `wasm32-unknown-unknown`
//! for the browser, where [`ffi`] exposes a plain C ABI usable from an `AudioWorklet`.

pub mod apu;
pub mod chip;
pub mod dsp;
pub mod ffi;
pub mod sfx;
pub mod tracker;
pub mod vgm;
