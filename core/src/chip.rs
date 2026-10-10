//! The whole chip: four channels, the mixer and output filters of the hardware the
//! song is written for (NES or Game Boy), the tracker [`Player`] that drives them, and
//! per-channel scope capture for the UI.

use crate::apu::{Noise, Pulse, Triangle};
use crate::dsp::OnePole;
use crate::gb;
use crate::tracker::{ChipKind, Player, Position, Song};

pub const CHANNELS: usize = 4;
pub const MAX_BLOCK: usize = 4096;
pub const SCOPE_LEN: usize = 1024;
/// Offline renders stop here even if the song never loops.
pub const MAX_RENDER_SECONDS: f32 = 600.0;

const OUTPUT_GAIN: f32 = 1.6;
/// The Game Boy mixes its four 4-bit DACs linearly; this matches the NES's loudness.
const GB_GAIN: f32 = 0.23 / 15.0;

/// The Game Boy's four channels.
#[derive(Default)]
struct GameBoy {
    pulse1: gb::Pulse,
    pulse2: gb::Pulse,
    wave: gb::Wave,
    noise: gb::Noise,
}
pub struct Chip {
    sample_rate: f32,
    pulse1: Pulse,
    pulse2: Pulse,
    triangle: Triangle,
    noise: Noise,
    gb: GameBoy,
    muted: [bool; CHANNELS],
    high_pass: OnePole,
    gb_high_pass: OnePole,
    low_pass: OnePole,
    player: Player,
    volume: f32,
    out: Vec<f32>,
    scope: [[f32; SCOPE_LEN]; CHANNELS],
    scope_pos: usize,
    scope_snapshot: [f32; SCOPE_LEN],
}

/// A song rendered once through, for export.
pub struct Rendered {
    pub samples: Vec<f32>,
    /// Where the looping part begins; the loop ends at `samples.len()`.
    pub loop_start: usize,
    /// False if the render hit [`MAX_RENDER_SECONDS`] before the song looped.
    pub looped: bool,
}

impl Chip {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            sample_rate,
            pulse1: Pulse::default(),
            pulse2: Pulse::default(),
            triangle: Triangle::default(),
            noise: Noise::default(),
            gb: GameBoy::default(),
            muted: [false; CHANNELS],
            high_pass: OnePole::new(37.0, sample_rate),
            // The DMG's output capacitor.
            gb_high_pass: OnePole::new(20.0, sample_rate),
            low_pass: OnePole::new(14_000.0, sample_rate),
            player: Player::default(),
            volume: 1.0,
            out: vec![0.0; MAX_BLOCK],
            scope: [[0.0; SCOPE_LEN]; CHANNELS],
            scope_pos: 0,
            scope_snapshot: [0.0; SCOPE_LEN],
        }
    }

    pub fn player(&self) -> &Player {
        &self.player
    }

    pub fn player_mut(&mut self) -> &mut Player {
        &mut self.player
    }

    /// Loads an edited song without interrupting playback.
    pub fn load_song(&mut self, song: Song) {
        self.player.replace_song(song);
    }

    pub fn play_from(&mut self, order: usize, row: usize) {
        self.player.play_from(order, row);
    }

    pub fn stop(&mut self) {
        self.player.stop();
    }

    pub fn position(&self) -> Option<Position> {
        self.player.position()
    }

    pub fn set_muted(&mut self, channel: usize, muted: bool) {
        if let Some(m) = self.muted.get_mut(channel) {
            *m = muted;
        }
    }

    /// Master volume, 0..=2 (1 is unchanged).
    pub fn set_volume(&mut self, volume: f32) {
        self.volume = if volume.is_finite() {
            volume.clamp(0.0, 2.0)
        } else {
            1.0
        };
    }

    pub fn is_muted(&self, channel: usize) -> bool {
        self.muted.get(channel).copied().unwrap_or(false)
    }

    /// The chip the loaded song is written for.
    pub fn kind(&self) -> ChipKind {
        self.player.song().chip
    }

    fn apply_voices(&mut self) {
        let [p1, p2, t, n] = *self.player.voices();
        let sr = self.sample_rate;
        match self.kind() {
            ChipKind::Nes => {
                self.pulse1.set(p1, sr);
                self.pulse2.set(p2, sr);
                self.triangle.set(t, sr);
                self.noise.set(n, sr);
            }
            ChipKind::GameBoy => {
                self.gb.pulse1.set(p1, sr);
                self.gb.pulse2.set(p2, sr);
                self.gb.wave.set(t, sr);
                self.gb.noise.set(n, sr);
            }
        }
    }

    fn next_sample(&mut self) -> f32 {
        if self.player.clock(self.sample_rate) {
            self.apply_voices();
        }
        let kind = self.kind();
        let raw = match kind {
            ChipKind::Nes => [
                self.pulse1.sample(),
                self.pulse2.sample(),
                self.triangle.sample(),
                self.noise.sample(),
            ],
            ChipKind::GameBoy => [
                self.gb.pulse1.sample(),
                self.gb.pulse2.sample(),
                self.gb.wave.sample(),
                self.gb.noise.sample(),
            ],
        };

        let pos = self.scope_pos;
        for (ch, &v) in raw.iter().enumerate() {
            self.scope[ch][pos] = v / 15.0;
        }
        self.scope_pos = (pos + 1) % SCOPE_LEN;

        let [p1, p2, t, n] = std::array::from_fn(|ch| if self.muted[ch] { 0.0 } else { raw[ch] });
        if kind == ChipKind::GameBoy {
            let mixed = (p1 + p2 + t + n) * GB_GAIN;
            let filtered = self.low_pass.low_pass(self.gb_high_pass.high_pass(mixed));
            return (filtered * OUTPUT_GAIN * self.volume).clamp(-1.0, 1.0);
        }
        // The 2A03's nonlinear DAC mix (see nesdev wiki, "APU Mixer").
        let pulse_sum = p1 + p2;
        let pulse_out = if pulse_sum > 0.0 {
            95.88 / (8128.0 / pulse_sum + 100.0)
        } else {
            0.0
        };
        let tnd = t / 8227.0 + n / 12241.0;
        let tnd_out = if tnd > 0.0 {
            159.79 / (1.0 / tnd + 100.0)
        } else {
            0.0
        };

        let filtered = self
            .low_pass
            .low_pass(self.high_pass.high_pass(pulse_out + tnd_out));
        (filtered * OUTPUT_GAIN * self.volume).clamp(-1.0, 1.0)
    }

    /// Renders `frames` mono samples (capped at [`MAX_BLOCK`]) into the internal buffer.
    pub fn render(&mut self, frames: usize) -> &[f32] {
        let frames = frames.min(MAX_BLOCK);
        for i in 0..frames {
            self.out[i] = self.next_sample();
        }
        &self.out[..frames]
    }

    /// Plays `song` from the top on a fresh chip until it first loops back.
    pub fn render_song(song: Song, sample_rate: f32) -> Rendered {
        let mut chip = Chip::new(sample_rate);
        let order_count = song.order.len();
        chip.load_song(song);
        chip.play_from(0, 0);
        let max = (MAX_RENDER_SECONDS * sample_rate) as usize;
        let mut samples = Vec::new();
        // First sample at which each order entry started playing.
        let mut entered: Vec<Option<usize>> = vec![None; order_count];
        while samples.len() < max {
            let s = chip.next_sample();
            if let Some(row) = chip.player.take_row_started() {
                if chip.player.loops() > 0 {
                    // This sample begins the second time through; the loop ends before it.
                    let loop_start = entered[row.order].unwrap_or(0);
                    return Rendered {
                        samples,
                        loop_start,
                        looped: true,
                    };
                }
                entered[row.order].get_or_insert(samples.len());
            }
            samples.push(s);
        }
        Rendered {
            samples,
            loop_start: 0,
            looped: false,
        }
    }

    /// The last [`SCOPE_LEN`] raw levels (0..=1) of a channel, oldest first.
    pub fn scope(&mut self, channel: usize) -> &[f32] {
        let ring = &self.scope[channel.min(CHANNELS - 1)];
        let (newer, older) = ring.split_at(self.scope_pos);
        self.scope_snapshot[..older.len()].copy_from_slice(older);
        self.scope_snapshot[older.len()..].copy_from_slice(newer);
        &self.scope_snapshot
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tracker::tests::song_with;
    use crate::tracker::{Cell, Instrument, Macro};

    const SR: f32 = 48_000.0;

    fn render_seconds(chip: &mut Chip, seconds: f32) -> Vec<f32> {
        let mut out = Vec::new();
        let mut remaining = (SR * seconds) as usize;
        while remaining > 0 {
            let n = remaining.min(128);
            out.extend_from_slice(chip.render(n));
            remaining -= n;
        }
        out
    }

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len() as f32).sqrt()
    }

    /// Four bars of every channel playing, so mixing and muting have something to do.
    fn busy_song() -> Song {
        let mut cells = Vec::new();
        for row in (0..64).step_by(4) {
            cells.push((row, 0, Cell::note(72 + (row % 12) as u8, 0)));
            cells.push((row, 1, Cell::note(64, 0)));
            cells.push((row, 2, Cell::note(45, 0)));
            cells.push((row, 3, Cell::note(8 + (row % 3) as u8, 0)));
        }
        song_with(
            &cells,
            Instrument {
                volume: Macro::new(&[15, 12, 9, 7, 5]),
                ..Default::default()
            },
        )
    }

    #[test]
    fn silent_until_played() {
        let mut chip = Chip::new(SR);
        chip.load_song(busy_song());
        assert!(
            render_seconds(&mut chip, 0.25)
                .iter()
                .all(|&v| v.abs() < 1e-6)
        );
    }

    #[test]
    fn song_is_audible_and_in_range() {
        let mut chip = Chip::new(SR);
        chip.load_song(busy_song());
        chip.play_from(0, 0);
        let out = render_seconds(&mut chip, 2.0);
        assert!(out.iter().all(|v| v.is_finite() && v.abs() <= 1.0));
        assert!(rms(&out) > 0.05, "rms {}", rms(&out));
    }

    #[test]
    fn rendering_is_deterministic() {
        let run = || {
            let mut chip = Chip::new(SR);
            chip.load_song(busy_song());
            chip.play_from(0, 0);
            render_seconds(&mut chip, 1.0)
        };
        assert_eq!(run(), run());
    }

    #[test]
    fn muting_all_channels_silences_output_but_not_scopes() {
        let mut chip = Chip::new(SR);
        chip.load_song(busy_song());
        for ch in 0..CHANNELS {
            chip.set_muted(ch, true);
        }
        chip.play_from(0, 0);
        assert!(rms(&render_seconds(&mut chip, 1.0)) < 1e-4);
        assert!(chip.scope(0).iter().any(|&v| v > 0.0));
    }

    #[test]
    fn preview_sounds_while_stopped() {
        let mut chip = Chip::new(SR);
        chip.player_mut().preview(0, 69, 0);
        assert!(rms(&render_seconds(&mut chip, 0.2)) > 0.05);
    }

    #[test]
    fn game_boy_songs_play_about_as_loud_as_nes_songs() {
        let level = |chip: ChipKind| {
            let mut song = busy_song();
            song.chip = chip;
            let mut c = Chip::new(SR);
            c.load_song(song);
            c.play_from(0, 0);
            let out = render_seconds(&mut c, 2.0);
            assert!(out.iter().all(|v| v.is_finite() && v.abs() <= 1.0));
            rms(&out)
        };
        let (nes, gb) = (level(ChipKind::Nes), level(ChipKind::GameBoy));
        assert!(
            gb > 0.05 && (gb / nes - 1.0).abs() < 0.35,
            "nes {nes}, gb {gb}"
        );
    }

    #[test]
    fn the_same_song_sounds_different_on_each_chip() {
        let render = |chip: ChipKind| {
            let mut song = busy_song();
            song.chip = chip;
            let mut c = Chip::new(SR);
            c.load_song(song);
            c.play_from(0, 0);
            render_seconds(&mut c, 0.5)
        };
        assert_ne!(render(ChipKind::Nes), render(ChipKind::GameBoy));
    }

    #[test]
    fn render_song_stops_at_the_loop_and_reports_its_start() {
        let mut song = busy_song();
        song.patterns.push(song.patterns[0].clone());
        song.order = vec![0, 1];
        song.loop_point = 1;
        // 150 BPM, 4 rows/beat: 64 rows = 6.4 s per pattern.
        let r = Chip::render_song(song, SR);
        assert!(r.looped);
        let pattern = 6.4 * SR;
        assert!(
            (r.samples.len() as f32 - 2.0 * pattern).abs() < 2.0,
            "{}",
            r.samples.len()
        );
        assert!(
            (r.loop_start as f32 - pattern).abs() < 2.0,
            "{}",
            r.loop_start
        );
    }
}
