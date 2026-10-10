//! The C API exercised from Rust, plus the same API compiled from C with the system
//! compiler, so the header and the library are checked against each other.

use chipcore::tracker::{Cell, Instrument, Macro, Song};
use chipforge::*;
use std::ffi::CStr;
use std::ptr;

const SR: f32 = 48_000.0;

/// Two 4-row patterns with a note on every channel at row 0.
fn song_bytes() -> Vec<u8> {
    let mut song = Song {
        pattern_length: 4,
        ..Song::default()
    };
    song.instruments = vec![Instrument {
        volume: Macro::new(&[15, 12, 9]),
        ..Default::default()
    }];
    let mut pattern = vec![[Cell::EMPTY; 4]; 4];
    for (ch, note) in [72, 64, 45, 8].into_iter().enumerate() {
        pattern[0][ch] = Cell::note(note, 0);
    }
    song.patterns = vec![pattern.clone(), pattern];
    song.order = vec![0, 1];
    song.encode()
}

fn render(p: *mut ChipforgePlayer, frames: usize, channels: u32) -> Vec<f32> {
    let mut out = vec![1.0; frames * channels as usize];
    unsafe { chipforge_player_render(p, out.as_mut_ptr(), frames, channels) };
    out
}

fn rms(x: &[f32]) -> f32 {
    (x.iter().map(|v| v * v).sum::<f32>() / x.len() as f32).sqrt()
}

#[test]
fn plays_a_song_in_stereo() {
    unsafe {
        let p = chipforge_player_new(SR);
        let bytes = song_bytes();
        assert_eq!(chipforge_player_load(p, bytes.as_ptr(), bytes.len()), 0);
        assert_eq!(chipforge_player_order_count(p), 2);
        assert_eq!(rms(&render(p, 1000, 2)), 0.0, "silent until played");
        chipforge_player_play(p, 0, 0);
        let out = render(p, 10_000, 2);
        assert!(rms(&out) > 0.05);
        assert!(
            out.chunks(2).all(|f| f[0] == f[1]),
            "both channels carry the mono chip"
        );
        assert_eq!(chipforge_player_is_playing(p), 1);
        assert_eq!(chipforge_player_order(p), 0);
        chipforge_player_free(p);
    }
}

#[test]
fn reports_errors_and_survives_null() {
    unsafe {
        let p = chipforge_player_new(SR);
        assert_eq!(chipforge_player_load(p, b"CFS\x01".as_ptr(), 4), -3);
        assert_eq!(chipforge_player_load(p, b"XYZ\x01".as_ptr(), 4), -1);
        assert_eq!(chipforge_player_load(p, ptr::null(), 0), -6);
        let msg = CStr::from_ptr(chipforge_error_message(-2))
            .to_str()
            .unwrap();
        assert!(msg.contains("newer"));
        chipforge_player_free(p);

        // NULL players are ignored, never crash.
        let null = ptr::null_mut();
        chipforge_player_play(null, 0, 0);
        assert_eq!(chipforge_player_order(null), -1);
        assert_eq!(rms(&render(null, 64, 2)), 0.0);
        assert!(chipforge_player_new(0.0).is_null());
    }
}

#[test]
fn adaptive_controls_work() {
    unsafe {
        let p = chipforge_player_new(SR);
        let bytes = song_bytes();
        chipforge_player_load(p, bytes.as_ptr(), bytes.len());
        chipforge_player_play(p, 0, 0);
        for ch in 0..4 {
            chipforge_player_set_muted(p, ch, 1);
        }
        assert!(rms(&render(p, 4000, 1)) < 1e-4, "all channels muted");
        chipforge_player_set_muted(p, 0, 0);
        assert!(rms(&render(p, 4000, 1)) > 0.01);

        chipforge_player_set_volume(p, 0.0);
        assert_eq!(rms(&render(p, 1000, 1)), 0.0);
        chipforge_player_set_volume(p, 1.0);

        // Play once: 2 patterns × 4 rows × 6 ticks at 60 ticks/s = 0.8 s, then stop.
        chipforge_player_play(p, 0, 0);
        chipforge_player_set_play_once(p, 1);
        render(p, (0.75 * SR) as usize, 1);
        assert_eq!(chipforge_player_take_finished(p), 0);
        render(p, (0.1 * SR) as usize, 1);
        assert_eq!(chipforge_player_take_finished(p), 1);
        assert_eq!(chipforge_player_is_playing(p), 0);

        // Tempo ×2 halves the time per pattern.
        chipforge_player_set_play_once(p, 0);
        chipforge_player_set_tempo_scale(p, 2.0);
        chipforge_player_play(p, 0, 0);
        render(p, (0.21 * SR) as usize, 1);
        assert_eq!(chipforge_player_order(p), 1);
        chipforge_player_free(p);
    }
}

#[test]
fn every_function_in_the_header_is_exported() {
    // The C side itself is compiled and run by tests/c/run.sh (CI runs it too).
    let header = include_str!("../include/chipforge.h");
    let source = include_str!("../src/lib.rs");
    let declared: Vec<&str> = header
        .split(|c: char| !(c.is_alphanumeric() || c == '_'))
        .filter(|w| w.starts_with("chipforge_"))
        .collect();
    assert!(declared.len() >= 18, "found {declared:?}");
    for name in declared {
        assert!(
            source.contains(&format!("fn {name}(")),
            "{name} is declared in chipforge.h but not exported"
        );
    }
}
