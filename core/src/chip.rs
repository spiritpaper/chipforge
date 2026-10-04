//! The whole chip: four channels, the APU's nonlinear mixer, output filters, a step
//! sequencer and per-channel scope capture for the UI.

use crate::apu::{Noise, Pulse, Triangle};
use crate::dsp::OnePole;
use crate::song::{Cell, Song};

pub const CHANNELS: usize = 4;
pub const MAX_BLOCK: usize = 4096;
pub const SCOPE_LEN: usize = 1024;

const OUTPUT_GAIN: f32 = 1.6;

/// Steps through a [`Song`] with sample-accurate timing.
#[derive(Clone, Debug)]
struct Sequencer {
    playing: bool,
    bpm: f32,
    next_step: usize,
    current_step: Option<usize>,
    samples_to_next: f64,
}

pub struct Chip {
    sample_rate: f32,
    pub pulse1: Pulse,
    pub pulse2: Pulse,
    pub triangle: Triangle,
    pub noise: Noise,
    muted: [bool; CHANNELS],
    high_pass: OnePole,
    low_pass: OnePole,
    song: Option<Song>,
    seq: Sequencer,
    out: Vec<f32>,
    scope: [[f32; SCOPE_LEN]; CHANNELS],
    scope_pos: usize,
    scope_snapshot: [f32; SCOPE_LEN],
}

impl Chip {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            sample_rate,
            pulse1: Pulse::default(),
            pulse2: Pulse::default(),
            triangle: Triangle::default(),
            noise: Noise::default(),
            muted: [false; CHANNELS],
            high_pass: OnePole::new(37.0, sample_rate),
            low_pass: OnePole::new(14_000.0, sample_rate),
            song: None,
            seq: Sequencer {
                playing: false,
                bpm: 120.0,
                next_step: 0,
                current_step: None,
                samples_to_next: 0.0,
            },
            out: vec![0.0; MAX_BLOCK],
            scope: [[0.0; SCOPE_LEN]; CHANNELS],
            scope_pos: 0,
            scope_snapshot: [0.0; SCOPE_LEN],
        }
    }

    pub fn load_song(&mut self, song: Song) {
        self.seq.bpm = song.bpm;
        self.pulse1.duty = song.tracks[0].duty;
        self.pulse2.duty = song.tracks[1].duty;
        self.song = Some(song);
        self.stop();
    }

    pub fn song(&self) -> Option<&Song> {
        self.song.as_ref()
    }

    pub fn play(&mut self) {
        if self.song.is_some() {
            self.seq.playing = true;
        }
    }

    /// Stops the sequencer, rewinds and silences every channel.
    pub fn stop(&mut self) {
        self.seq.playing = false;
        self.seq.next_step = 0;
        self.seq.current_step = None;
        self.seq.samples_to_next = 0.0;
        for ch in 0..CHANNELS {
            self.note_off(ch);
        }
    }

    pub fn is_playing(&self) -> bool {
        self.seq.playing
    }

    pub fn current_step(&self) -> Option<usize> {
        self.seq.current_step
    }

    pub fn bpm(&self) -> f32 {
        self.seq.bpm
    }

    pub fn set_bpm(&mut self, bpm: f32) {
        self.seq.bpm = bpm.clamp(30.0, 300.0);
    }

    pub fn set_muted(&mut self, channel: usize, muted: bool) {
        if let Some(m) = self.muted.get_mut(channel) {
            *m = muted;
        }
    }

    pub fn is_muted(&self, channel: usize) -> bool {
        self.muted.get(channel).copied().unwrap_or(false)
    }

    pub fn note_on(&mut self, channel: usize, note: u8, volume: u8, decay_per_sec: f32) {
        let sr = self.sample_rate;
        match channel {
            0 => self.pulse1.note_on(note, volume, decay_per_sec, sr),
            1 => self.pulse2.note_on(note, volume, decay_per_sec, sr),
            2 => self.triangle.note_on(note, sr),
            // On the noise channel the note picks one of the 16 noise periods.
            3 => self
                .noise
                .hit(15 - note % 16, false, volume, decay_per_sec, sr),
            _ => {}
        }
    }

    pub fn note_off(&mut self, channel: usize) {
        match channel {
            0 => self.pulse1.note_off(),
            1 => self.pulse2.note_off(),
            2 => self.triangle.note_off(),
            3 => self.noise.note_off(),
            _ => {}
        }
    }

    fn step_length_samples(&self, song: &Song) -> f64 {
        self.sample_rate as f64 * 60.0 / (self.seq.bpm as f64 * song.steps_per_beat as f64)
    }

    fn advance_sequencer(&mut self) {
        let Some(song) = self.song.as_ref().filter(|_| self.seq.playing) else {
            return;
        };
        if self.seq.samples_to_next <= 0.0 {
            let step = self.seq.next_step;
            let step_len = self.step_length_samples(song);
            let cells: [Cell; CHANNELS] = std::array::from_fn(|ch| song.tracks[ch].cells[step]);
            let voices: [(u8, f32); CHANNELS] =
                std::array::from_fn(|ch| (song.tracks[ch].volume, song.tracks[ch].decay_per_sec));
            self.seq.next_step = (step + 1) % song.len();
            self.seq.current_step = Some(step);
            self.seq.samples_to_next += step_len;

            for (ch, cell) in cells.into_iter().enumerate() {
                let (volume, decay) = voices[ch];
                match cell {
                    Cell::Hold => {}
                    Cell::Off => self.note_off(ch),
                    Cell::Note(n) => self.note_on(ch, n, volume, decay),
                    Cell::Drum(d) => {
                        let (period, short, vol, decay) = d.voice();
                        self.noise.hit(period, short, vol, decay, self.sample_rate);
                    }
                }
            }
        }
        self.seq.samples_to_next -= 1.0;
    }

    fn next_sample(&mut self) -> f32 {
        self.advance_sequencer();
        let dt = 1.0 / self.sample_rate;
        let raw = [
            self.pulse1.sample(dt),
            self.pulse2.sample(dt),
            self.triangle.sample(),
            self.noise.sample(dt),
        ];

        let pos = self.scope_pos;
        for (ch, &v) in raw.iter().enumerate() {
            self.scope[ch][pos] = v / 15.0;
        }
        self.scope_pos = (pos + 1) % SCOPE_LEN;

        let [p1, p2, t, n] = std::array::from_fn(|ch| if self.muted[ch] { 0.0 } else { raw[ch] });
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
        (filtered * OUTPUT_GAIN).clamp(-1.0, 1.0)
    }

    /// Renders `frames` mono samples (capped at [`MAX_BLOCK`]) into the internal buffer.
    pub fn render(&mut self, frames: usize) -> &[f32] {
        let frames = frames.min(MAX_BLOCK);
        for i in 0..frames {
            self.out[i] = self.next_sample();
        }
        &self.out[..frames]
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
    use crate::song::demo;

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

    #[test]
    fn silent_until_played() {
        let mut chip = Chip::new(SR);
        chip.load_song(demo());
        let out = render_seconds(&mut chip, 0.25);
        assert!(out.iter().all(|&v| v.abs() < 1e-6));
    }

    #[test]
    fn demo_loop_is_audible_and_in_range() {
        let mut chip = Chip::new(SR);
        chip.load_song(demo());
        chip.play();
        // 64 sixteenths at 140 BPM ≈ 6.86 s: render a bit more than one loop.
        let out = render_seconds(&mut chip, 7.5);
        assert!(out.iter().all(|v| v.is_finite() && v.abs() <= 1.0));
        assert!(rms(&out) > 0.05, "rms {}", rms(&out));
    }

    #[test]
    fn rendering_is_deterministic() {
        let run = || {
            let mut chip = Chip::new(SR);
            chip.load_song(demo());
            chip.play();
            render_seconds(&mut chip, 2.0)
        };
        assert_eq!(run(), run());
    }

    #[test]
    fn step_timing_follows_bpm() {
        let mut chip = Chip::new(SR);
        chip.load_song(demo());
        chip.set_bpm(120.0);
        chip.play();
        // 120 BPM, 4 steps per beat → 6000 samples per step.
        chip.render(1);
        assert_eq!(chip.current_step(), Some(0));
        chip.render(4096);
        chip.render(5999 - 4096);
        assert_eq!(chip.current_step(), Some(0));
        chip.render(1);
        assert_eq!(chip.current_step(), Some(1));
    }

    #[test]
    fn muting_all_channels_silences_output() {
        let mut chip = Chip::new(SR);
        chip.load_song(demo());
        for ch in 0..CHANNELS {
            chip.set_muted(ch, true);
        }
        chip.play();
        let out = render_seconds(&mut chip, 1.0);
        assert!(rms(&out) < 1e-4);
        // Scopes still show what each channel is doing while muted.
        assert!(chip.scope(0).iter().any(|&v| v > 0.0));
    }

    #[test]
    fn stop_rewinds_to_start() {
        let mut chip = Chip::new(SR);
        chip.load_song(demo());
        chip.play();
        render_seconds(&mut chip, 1.0);
        chip.stop();
        assert_eq!(chip.current_step(), None);
        chip.play();
        chip.render(1);
        assert_eq!(chip.current_step(), Some(0));
    }
}
