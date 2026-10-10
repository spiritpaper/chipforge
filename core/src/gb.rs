//! Game Boy (DMG) sound channels: two pulses, the 4-bit wave channel and noise.
//!
//! They take the same per-tick [`Voice`]s as the NES channels, so one tracker song
//! plays on either chip. Like [`crate::apu`], each channel returns its raw 4-bit level
//! (0.0..=15.0) every sample; the Game Boy mixes them linearly.
//!
//! On the wave channel `duty` picks one of the built-in [`WAVES`] and `volume` is
//! rounded to the hardware's four levels (off, 25%, 50%, 100%). On noise, bit 0 of
//! `duty` selects the 7-bit (metallic) mode, as on the NES.

use crate::apu::{Voice, noise_period, poly_blep, semitones_to_hz};

/// The DMG's 4.194304 MHz master clock.
pub const GB_CLOCK_HZ: f64 = 4_194_304.0;

/// Pulse duty cycles (NR11/NR21 bits 6–7): 12.5%, 25%, 50%, 75%, the same set as the NES.
pub const DUTY_CYCLES: [f32; 4] = [0.125, 0.25, 0.5, 0.75];

/// Names of the [`WAVES`], for editors.
pub const WAVE_NAMES: [&str; 8] = [
    "Saw",
    "Square",
    "Triangle",
    "Sine",
    "Pulse 25%",
    "Pulse 12.5%",
    "Organ",
    "Buzz",
];

/// Built-in wave RAM contents (32 4-bit samples each). Index 2, the triangle, is the
/// default, so a song written for the NES triangle sounds alike here.
pub const WAVES: [[u8; 32]; 8] = [
    // Saw
    [
        0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
        14, 14, 15, 15,
    ],
    // Square
    [
        15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0,
    ],
    // Triangle
    [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6,
        5, 4, 3, 2, 1, 0,
    ],
    // Sine
    [
        8, 9, 11, 12, 13, 14, 14, 15, 15, 15, 14, 14, 13, 12, 11, 9, 8, 6, 4, 3, 2, 1, 1, 0, 0, 0,
        1, 1, 2, 3, 4, 6,
    ],
    // Pulse 25%
    [
        15, 15, 15, 15, 15, 15, 15, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0,
    ],
    // Pulse 12.5%
    [
        15, 15, 15, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0,
    ],
    // Organ: a sine with its octave and fifth above
    [
        8, 12, 14, 14, 12, 11, 11, 12, 13, 12, 10, 8, 7, 7, 8, 8, 8, 8, 8, 9, 9, 8, 6, 4, 3, 4, 5,
        5, 4, 2, 2, 4,
    ],
    // Buzz: two saws an octave apart
    [
        0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 15, 2, 4, 5, 7, 8, 0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 15, 2,
        4, 5, 7, 8,
    ],
];

/// Noise LFSR clock rates (Hz) for the 16 noise "notes", highest first, chosen from the
/// divisor/shift pairs (NR43) to step about half an octave apart.
pub const NOISE_RATES: [f64; 16] = [
    524_288.0, 262_144.0, 131_072.0, 87_381.33, 65_536.0, 43_690.67, 32_768.0, 21_845.33, 16_384.0,
    10_922.67, 8_192.0, 5_461.33, 4_096.0, 2_730.67, 2_048.0, 1_365.33,
];

/// NR43 settings (divisor code, shift) behind each of [`NOISE_RATES`].
pub const NOISE_SETTINGS: [(u8, u8); 16] = [
    (0, 0),
    (0, 1),
    (0, 2),
    (3, 0),
    (0, 3),
    (3, 1),
    (0, 4),
    (3, 2),
    (0, 5),
    (3, 3),
    (0, 6),
    (3, 4),
    (0, 7),
    (3, 5),
    (0, 8),
    (3, 6),
];

/// The 11-bit frequency register for a pulse at `hz` (the pulse plays
/// 131072 / (2048 − x) Hz), or `None` below the lowest note it can play (64 Hz).
pub fn pulse_freq(hz: f64) -> Option<u16> {
    let x = (2048.0 - GB_CLOCK_HZ / 32.0 / hz).round();
    (0.0..=2047.0).contains(&x).then_some(x as u16)
}

pub fn pulse_hz(freq: u16) -> f64 {
    GB_CLOCK_HZ / 32.0 / (2048.0 - freq as f64)
}

/// The wave channel plays its 32 samples at 65536 / (2048 − x) Hz, an octave below a
/// pulse with the same register value.
pub fn wave_freq(hz: f64) -> Option<u16> {
    let x = (2048.0 - GB_CLOCK_HZ / 64.0 / hz).round();
    (0.0..=2047.0).contains(&x).then_some(x as u16)
}

pub fn wave_hz(freq: u16) -> f64 {
    GB_CLOCK_HZ / 64.0 / (2048.0 - freq as f64)
}

/// NR32 output level code for a 0..=15 volume: 0 off, 1 full, 2 half, 3 quarter.
pub fn wave_level(volume: u8) -> u8 {
    match volume {
        0 => 0,
        1..=5 => 3,
        6..=11 => 2,
        _ => 1,
    }
}

#[derive(Clone, Debug, Default)]
pub struct Pulse {
    duty: u8,
    phase: f32,
    inc: f32,
    volume: u8,
}

impl Pulse {
    pub fn set(&mut self, voice: Option<Voice>, sample_rate: f32) {
        let freq = voice.and_then(|v| pulse_freq(semitones_to_hz(v.semitones)));
        match (voice, freq) {
            (Some(v), Some(x)) => {
                // Frequencies above what the sample rate can carry are silent rather
                // than aliased into noise (the hardware's output is inaudible there).
                self.inc = (pulse_hz(x) / sample_rate as f64).min(0.5) as f32;
                self.volume = v.volume.min(15);
                self.duty = v.duty & 3;
            }
            _ => self.volume = 0,
        }
    }

    pub fn sample(&mut self) -> f32 {
        if self.volume == 0 || self.inc == 0.0 {
            return 0.0;
        }
        let duty = DUTY_CYCLES[self.duty as usize];
        let mut bipolar = if self.phase < duty { 1.0 } else { -1.0 };
        bipolar += poly_blep(self.phase, self.inc);
        bipolar -= poly_blep((self.phase - duty + 1.0) % 1.0, self.inc);
        self.phase = (self.phase + self.inc) % 1.0;
        self.volume as f32 * (0.5 + 0.5 * bipolar).clamp(0.0, 1.0)
    }
}

#[derive(Clone, Debug, Default)]
pub struct Wave {
    wave: u8,
    phase: f32,
    inc: f32,
    /// NR32 code: 0 off, 1 full, 2 half, 3 quarter.
    level: u8,
}

impl Wave {
    pub fn set(&mut self, voice: Option<Voice>, sample_rate: f32) {
        let freq = voice.and_then(|v| wave_freq(semitones_to_hz(v.semitones)));
        match (voice, freq) {
            (Some(v), Some(x)) => {
                self.inc = (wave_hz(x) / sample_rate as f64) as f32;
                self.level = wave_level(v.volume);
                self.wave = v.duty & 7;
            }
            _ => self.level = 0,
        }
    }

    pub fn sample(&mut self) -> f32 {
        if self.level == 0 {
            return 0.0;
        }
        let step = WAVES[self.wave as usize][(self.phase * 32.0) as usize % 32];
        self.phase = (self.phase + self.inc) % 1.0;
        (step >> (self.level - 1)) as f32
    }
}

#[derive(Clone, Debug)]
pub struct Noise {
    lfsr: u16,
    /// 7-bit mode: the feedback also lands in bit 6, giving a 127-step metallic loop.
    short: bool,
    clocks_per_sample: f64,
    acc: f64,
    volume: u8,
}

impl Default for Noise {
    fn default() -> Self {
        Self {
            lfsr: 0x7FFF,
            short: false,
            clocks_per_sample: 0.0,
            acc: 0.0,
            volume: 0,
        }
    }
}

impl Noise {
    pub fn set(&mut self, voice: Option<Voice>, sample_rate: f32) {
        match voice {
            Some(v) => {
                let rate = NOISE_RATES[noise_period(v.semitones) as usize];
                self.clocks_per_sample = rate / sample_rate as f64;
                self.short = v.duty & 1 == 1;
                self.volume = v.volume.min(15);
            }
            None => self.volume = 0,
        }
    }

    pub fn clock_lfsr(&mut self) {
        let feedback = (self.lfsr ^ (self.lfsr >> 1)) & 1;
        self.lfsr = (self.lfsr >> 1) | (feedback << 14);
        if self.short {
            self.lfsr = (self.lfsr & !(1 << 6)) | (feedback << 6);
        }
    }

    pub fn sample(&mut self) -> f32 {
        if self.volume == 0 {
            return 0.0;
        }
        self.acc += self.clocks_per_sample;
        while self.acc >= 1.0 {
            self.acc -= 1.0;
            self.clock_lfsr();
        }
        if self.lfsr & 1 == 0 {
            self.volume as f32
        } else {
            0.0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f32 = 48_000.0;

    fn voice(semitones: f32, volume: u8, duty: u8) -> Option<Voice> {
        Some(Voice {
            semitones,
            volume,
            duty,
        })
    }

    fn measure_hz(samples: &[f32]) -> f64 {
        let mean = samples.iter().sum::<f32>() / samples.len() as f32;
        let rises: Vec<usize> = samples
            .windows(2)
            .enumerate()
            .filter(|(_, w)| w[0] < mean && w[1] >= mean)
            .map(|(i, _)| i)
            .collect();
        let cycles = (rises.len() - 1) as f64;
        cycles * SR as f64 / (rises[rises.len() - 1] - rises[0]) as f64
    }

    #[test]
    fn pulse_register_matches_hardware_formula() {
        // A4: 2048 - 131072 / 440 = 1750.1
        assert_eq!(pulse_freq(440.0), Some(1750));
        assert!((pulse_hz(1750) - 440.0).abs() < 1.0);
        assert_eq!(pulse_freq(60.0), None);
        assert_eq!(wave_freq(440.0), Some(1899));
        assert!((wave_hz(1899) - 440.0).abs() < 2.0);
    }

    #[test]
    fn pulse_and_wave_play_requested_pitch() {
        let mut p = Pulse::default();
        p.set(voice(69.0, 15, 2), SR);
        let out: Vec<f32> = (0..SR as usize / 4).map(|_| p.sample()).collect();
        assert!((measure_hz(&out) - 440.0).abs() < 2.0);

        let mut w = Wave::default();
        w.set(voice(57.0, 15, 2), SR);
        let out: Vec<f32> = (0..SR as usize / 4).map(|_| w.sample()).collect();
        assert!((measure_hz(&out) - 220.0).abs() < 2.0);
    }

    #[test]
    fn wave_volume_has_four_levels() {
        let peak = |volume| {
            let mut w = Wave::default();
            w.set(voice(57.0, volume, 1), SR);
            (0..1000).map(|_| w.sample()).fold(0.0f32, f32::max)
        };
        assert_eq!(peak(0), 0.0);
        assert_eq!(peak(15), 15.0);
        assert_eq!(peak(8), 7.0);
        assert_eq!(peak(3), 3.0);
    }

    #[test]
    fn every_wave_is_4_bit_and_has_a_name() {
        assert!(WAVES.iter().flatten().all(|&s| s <= 15));
        assert_eq!(WAVES.len(), WAVE_NAMES.len());
    }

    fn lfsr_period(short: bool) -> usize {
        let mut n = Noise {
            short,
            ..Default::default()
        };
        // Step past any start-up transient into the cycle, then measure it.
        for _ in 0..200 {
            n.clock_lfsr();
        }
        let start = n.lfsr;
        (1..=40_000)
            .find(|_| {
                n.clock_lfsr();
                n.lfsr == start
            })
            .unwrap()
    }

    #[test]
    fn noise_periods_match_hardware() {
        assert_eq!(lfsr_period(false), 32_767);
        assert_eq!(lfsr_period(true), 127);
    }

    #[test]
    fn noise_table_matches_its_register_settings() {
        for (rate, (r, s)) in NOISE_RATES.iter().zip(NOISE_SETTINGS) {
            let divisor = if r == 0 { 0.5 } else { r as f64 };
            let expected = 524_288.0 / divisor / 2f64.powi(s as i32 + 1);
            assert!((rate - expected).abs() < 0.01, "{rate} vs {expected}");
        }
        assert!(NOISE_RATES.windows(2).all(|w| w[0] > w[1]));
    }
}
