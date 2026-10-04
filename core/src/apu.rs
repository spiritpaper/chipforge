//! NES 2A03-style sound channels.
//!
//! The sequencer sets each channel's [`Voice`] once per tick; each channel then returns
//! its raw output level in the chip's 4-bit domain (0.0..=15.0) every sample, which
//! [`crate::chip::Chip`] mixes with the APU's nonlinear mixer.

/// NTSC 2A03 CPU clock; every channel timer is derived from it.
pub const CPU_HZ: f64 = 1_789_773.0;

/// Pulse duty cycles selectable by the 2-bit duty register.
pub const DUTY_CYCLES: [f32; 4] = [0.125, 0.25, 0.5, 0.75];

/// Noise timer periods in CPU cycles (NTSC), indexed by the 4-bit period register.
pub const NOISE_PERIODS: [u16; 16] = [
    4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068,
];

/// The triangle's 32-step output sequence.
const TRIANGLE_STEPS: [u8; 32] = [
    15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, //
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];

pub fn midi_to_hz(note: u8) -> f64 {
    semitones_to_hz(note as f32)
}

/// Frequency of a (possibly fractional) MIDI note number.
pub fn semitones_to_hz(semitones: f32) -> f64 {
    440.0 * 2f64.powf((semitones as f64 - 69.0) / 12.0)
}

/// Noise period register for a note: higher notes give higher-pitched noise, and the
/// 16 periods repeat every 16 semitones, like FamiTracker's 0–F noise notes.
pub fn noise_period(semitones: f32) -> u8 {
    15 - (semitones.round() as i32).rem_euclid(16) as u8
}

/// The 11-bit timer value the hardware would use for `hz`, or `None` if out of range
/// (the 2A03 silences pulse periods below 8).
pub fn pulse_timer(hz: f64) -> Option<u16> {
    let t = (CPU_HZ / (16.0 * hz) - 1.0).round();
    (8.0..=2047.0).contains(&t).then_some(t as u16)
}

pub fn pulse_hz(timer: u16) -> f64 {
    CPU_HZ / (16.0 * (timer as f64 + 1.0))
}

/// The triangle runs its sequencer at half the pulse rate, so it plays an octave lower
/// for the same timer value.
pub fn triangle_timer(hz: f64) -> Option<u16> {
    let t = (CPU_HZ / (32.0 * hz) - 1.0).round();
    (2.0..=2047.0).contains(&t).then_some(t as u16)
}

pub fn triangle_hz(timer: u16) -> f64 {
    CPU_HZ / (32.0 * (timer as f64 + 1.0))
}

/// Band-limited step correction, so high notes don't alias into noise.
pub(crate) fn poly_blep(t: f32, dt: f32) -> f32 {
    if t < dt {
        let t = t / dt;
        t + t - t * t - 1.0
    } else if t > 1.0 - dt {
        let t = (t - 1.0) / dt;
        t * t + t + t + 1.0
    } else {
        0.0
    }
}

/// The parameters the sequencer writes to a channel on every tick.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Voice {
    /// MIDI note number, fractional for slides and vibrato.
    pub semitones: f32,
    /// 0..=15; zero silences the channel (the triangle halts).
    pub volume: u8,
    /// Pulse: index into [`DUTY_CYCLES`]. Noise: bit 0 selects short (metallic) mode.
    pub duty: u8,
}

#[derive(Clone, Debug, Default)]
pub struct Pulse {
    duty: u8,
    phase: f32,
    inc: f32,
    volume: u8,
}

impl Pulse {
    /// Applies a voice, or silences the channel with `None`. Pitch is quantized to the
    /// 11-bit timer, and notes the hardware can't play are silent.
    pub fn set(&mut self, voice: Option<Voice>, sample_rate: f32) {
        let timer = voice.and_then(|v| pulse_timer(semitones_to_hz(v.semitones)));
        match (voice, timer) {
            (Some(v), Some(t)) => {
                self.inc = (pulse_hz(t) / sample_rate as f64) as f32;
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

#[derive(Clone, Debug)]
pub struct Triangle {
    phase: f32,
    inc: f32,
    running: bool,
}

impl Default for Triangle {
    /// Parked at a zero step so an idle chip outputs silence, not DC.
    fn default() -> Self {
        Self {
            phase: 0.5,
            inc: 0.0,
            running: false,
        }
    }
}

impl Triangle {
    /// The triangle has no volume control on the 2A03: any non-zero volume runs it.
    pub fn set(&mut self, voice: Option<Voice>, sample_rate: f32) {
        let timer = voice
            .filter(|v| v.volume > 0)
            .and_then(|v| triangle_timer(semitones_to_hz(v.semitones)));
        match timer {
            Some(t) => {
                self.inc = (triangle_hz(t) / sample_rate as f64) as f32;
                self.running = true;
            }
            None => self.running = false,
        }
    }

    /// When stopped, the sequencer halts and holds its current step, like the hardware,
    /// which avoids a click on every note-off.
    pub fn sample(&mut self) -> f32 {
        let value = TRIANGLE_STEPS[(self.phase * 32.0) as usize % 32] as f32;
        if self.running {
            self.phase = (self.phase + self.inc) % 1.0;
        }
        value
    }
}

#[derive(Clone, Debug)]
pub struct Noise {
    lfsr: u16,
    /// Short mode taps bit 6 instead of bit 1, giving a 93-step metallic loop.
    short: bool,
    clocks_per_sample: f64,
    acc: f64,
    volume: u8,
}

impl Default for Noise {
    fn default() -> Self {
        Self {
            lfsr: 1,
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
                let cycles = NOISE_PERIODS[noise_period(v.semitones) as usize] as f64;
                self.clocks_per_sample = CPU_HZ / cycles / sample_rate as f64;
                self.short = v.duty & 1 == 1;
                self.volume = v.volume.min(15);
            }
            None => self.volume = 0,
        }
    }

    pub fn clock_lfsr(&mut self) {
        let tap = if self.short { 6 } else { 1 };
        let feedback = (self.lfsr ^ (self.lfsr >> tap)) & 1;
        self.lfsr = (self.lfsr >> 1) | (feedback << 14);
    }

    pub fn lfsr(&self) -> u16 {
        self.lfsr
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

    /// Frequency from rising crossings of the mean, over a whole number of cycles.
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
    fn pulse_pitch_is_quantized_like_hardware() {
        let t = pulse_timer(440.0).unwrap();
        assert_eq!(t, 253);
        assert!((pulse_hz(t) - 440.0).abs() < 1.0);
    }

    #[test]
    fn pulse_out_of_range_is_silent() {
        assert_eq!(pulse_timer(20.0), None);
        assert_eq!(pulse_timer(20_000.0), None);
    }

    fn voice(semitones: f32, duty: u8) -> Option<Voice> {
        Some(Voice {
            semitones,
            volume: 15,
            duty,
        })
    }

    #[test]
    fn pulse_plays_requested_pitch() {
        let mut p = Pulse::default();
        p.set(voice(69.0, 2), SR);
        let out: Vec<f32> = (0..SR as usize / 4).map(|_| p.sample()).collect();
        let hz = measure_hz(&out);
        assert!((hz - 440.0).abs() < 2.0, "measured {hz}");
    }

    #[test]
    fn pulse_duty_sets_high_fraction() {
        for (duty, expected) in DUTY_CYCLES.iter().enumerate() {
            let mut p = Pulse::default();
            p.set(voice(57.0, duty as u8), SR);
            let out: Vec<f32> = (0..SR as usize).map(|_| p.sample()).collect();
            let high = out.iter().filter(|&&v| v > 7.5).count() as f32 / out.len() as f32;
            assert!((high - expected).abs() < 0.02, "duty {duty}: {high}");
        }
    }

    #[test]
    fn triangle_is_an_octave_below_pulse_for_same_timer() {
        assert!((pulse_hz(100) / triangle_hz(100) - 2.0).abs() < 1e-9);
    }

    #[test]
    fn triangle_steps_through_all_16_levels() {
        let mut t = Triangle::default();
        t.set(voice(45.0, 0), SR);
        let mut seen = [false; 16];
        for _ in 0..SR as usize / 10 {
            seen[t.sample() as usize] = true;
        }
        assert!(seen.iter().all(|&s| s));
    }

    #[test]
    fn triangle_holds_level_after_note_off() {
        let mut t = Triangle::default();
        t.set(voice(45.0, 0), SR);
        for _ in 0..137 {
            t.sample();
        }
        t.set(None, SR);
        let held = t.sample();
        assert!((0..100).all(|_| t.sample() == held));
    }

    fn lfsr_period(short: bool) -> usize {
        let mut n = Noise {
            short,
            ..Default::default()
        };
        let start = n.lfsr();
        (1..=40_000)
            .find(|_| {
                n.clock_lfsr();
                n.lfsr() == start
            })
            .unwrap()
    }

    #[test]
    fn noise_long_mode_has_32767_step_period() {
        assert_eq!(lfsr_period(false), 32_767);
    }

    #[test]
    fn noise_short_mode_has_93_step_period() {
        // Seeded at 1, short mode lands in the famous 93-step loop.
        assert_eq!(lfsr_period(true), 93);
    }

    #[test]
    fn noise_period_rises_with_note() {
        assert_eq!(noise_period(0.0), 15);
        assert_eq!(noise_period(15.0), 0);
        assert_eq!(noise_period(16.0), 15);
        assert_eq!(noise_period(-1.0), 0);
    }

    #[test]
    fn zero_volume_silences_and_halts() {
        let mut p = Pulse::default();
        p.set(
            Some(Voice {
                semitones: 60.0,
                volume: 0,
                duty: 2,
            }),
            SR,
        );
        assert!((0..100).all(|_| p.sample() == 0.0));
        let mut t = Triangle::default();
        t.set(
            Some(Voice {
                semitones: 45.0,
                volume: 0,
                duty: 0,
            }),
            SR,
        );
        let first = t.sample();
        assert!((0..100).all(|_| t.sample() == first));
    }
}
