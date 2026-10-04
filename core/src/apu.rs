//! NES 2A03-style sound channels.
//!
//! Each channel returns its raw output level in the chip's 4-bit domain (0.0..=15.0);
//! [`crate::chip::Chip`] mixes them with the APU's nonlinear mixer.

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
    440.0 * 2f64.powf((note as f64 - 69.0) / 12.0)
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

/// Linear volume decay, quantized to the chip's 16 volume steps on output.
#[derive(Clone, Copy, Debug, Default)]
pub struct Envelope {
    level: f32,
    decay_per_sec: f32,
}

impl Envelope {
    pub fn trigger(&mut self, volume: u8, decay_per_sec: f32) {
        self.level = volume.min(15) as f32;
        self.decay_per_sec = decay_per_sec.max(0.0);
    }

    pub fn advance(&mut self, dt: f32) {
        self.level = (self.level - self.decay_per_sec * dt).max(0.0);
    }

    pub fn volume(&self) -> u8 {
        self.level.ceil() as u8
    }
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

#[derive(Clone, Debug, Default)]
pub struct Pulse {
    /// Index into [`DUTY_CYCLES`].
    pub duty: u8,
    phase: f32,
    inc: f32,
    env: Envelope,
    gate: bool,
}

impl Pulse {
    pub fn note_on(&mut self, note: u8, volume: u8, decay_per_sec: f32, sample_rate: f32) {
        match pulse_timer(midi_to_hz(note)) {
            Some(t) => {
                self.inc = (pulse_hz(t) / sample_rate as f64) as f32;
                self.env.trigger(volume, decay_per_sec);
                self.gate = true;
            }
            None => self.gate = false,
        }
    }

    pub fn note_off(&mut self) {
        self.gate = false;
    }

    pub fn sample(&mut self, dt: f32) -> f32 {
        if !self.gate || self.inc == 0.0 {
            return 0.0;
        }
        let duty = DUTY_CYCLES[(self.duty & 3) as usize];
        let mut bipolar = if self.phase < duty { 1.0 } else { -1.0 };
        bipolar += poly_blep(self.phase, self.inc);
        bipolar -= poly_blep((self.phase - duty + 1.0) % 1.0, self.inc);

        self.phase = (self.phase + self.inc) % 1.0;
        let level = self.env.volume() as f32;
        self.env.advance(dt);
        level * (0.5 + 0.5 * bipolar).clamp(0.0, 1.0)
    }
}

#[derive(Clone, Debug)]
pub struct Triangle {
    phase: f32,
    inc: f32,
    gate: bool,
}

impl Default for Triangle {
    /// Parked at a zero step so an idle chip outputs silence, not DC.
    fn default() -> Self {
        Self {
            phase: 0.5,
            inc: 0.0,
            gate: false,
        }
    }
}

impl Triangle {
    /// The triangle has no volume control on the 2A03: it is either running or held.
    pub fn note_on(&mut self, note: u8, sample_rate: f32) {
        match triangle_timer(midi_to_hz(note)) {
            Some(t) => {
                self.inc = (triangle_hz(t) / sample_rate as f64) as f32;
                self.gate = true;
            }
            None => self.gate = false,
        }
    }

    pub fn note_off(&mut self) {
        self.gate = false;
    }

    /// When stopped, the sequencer halts and holds its current step, like the hardware,
    /// which avoids a click on every note-off.
    pub fn sample(&mut self) -> f32 {
        let value = TRIANGLE_STEPS[(self.phase * 32.0) as usize % 32] as f32;
        if self.gate {
            self.phase = (self.phase + self.inc) % 1.0;
        }
        value
    }
}

#[derive(Clone, Debug)]
pub struct Noise {
    lfsr: u16,
    /// Short mode taps bit 6 instead of bit 1, giving a 93-step metallic loop.
    pub short: bool,
    clocks_per_sample: f64,
    acc: f64,
    env: Envelope,
    gate: bool,
}

impl Default for Noise {
    fn default() -> Self {
        Self {
            lfsr: 1,
            short: false,
            clocks_per_sample: 0.0,
            acc: 0.0,
            env: Envelope::default(),
            gate: false,
        }
    }
}

impl Noise {
    pub fn hit(
        &mut self,
        period: u8,
        short: bool,
        volume: u8,
        decay_per_sec: f32,
        sample_rate: f32,
    ) {
        let cycles = NOISE_PERIODS[(period & 15) as usize] as f64;
        self.clocks_per_sample = CPU_HZ / cycles / sample_rate as f64;
        self.short = short;
        self.env.trigger(volume, decay_per_sec);
        self.gate = true;
    }

    pub fn note_off(&mut self) {
        self.gate = false;
    }

    pub fn clock_lfsr(&mut self) {
        let tap = if self.short { 6 } else { 1 };
        let feedback = (self.lfsr ^ (self.lfsr >> tap)) & 1;
        self.lfsr = (self.lfsr >> 1) | (feedback << 14);
    }

    pub fn lfsr(&self) -> u16 {
        self.lfsr
    }

    pub fn sample(&mut self, dt: f32) -> f32 {
        if !self.gate {
            return 0.0;
        }
        self.acc += self.clocks_per_sample;
        while self.acc >= 1.0 {
            self.acc -= 1.0;
            self.clock_lfsr();
        }
        let level = self.env.volume() as f32;
        self.env.advance(dt);
        if self.lfsr & 1 == 0 { level } else { 0.0 }
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

    #[test]
    fn pulse_plays_requested_pitch() {
        let mut p = Pulse {
            duty: 2,
            ..Default::default()
        };
        p.note_on(69, 15, 0.0, SR);
        let out: Vec<f32> = (0..SR as usize / 4).map(|_| p.sample(1.0 / SR)).collect();
        let hz = measure_hz(&out);
        assert!((hz - 440.0).abs() < 2.0, "measured {hz}");
    }

    #[test]
    fn pulse_duty_sets_high_fraction() {
        for (duty, expected) in DUTY_CYCLES.iter().enumerate() {
            let mut p = Pulse {
                duty: duty as u8,
                ..Default::default()
            };
            p.note_on(57, 15, 0.0, SR);
            let out: Vec<f32> = (0..SR as usize).map(|_| p.sample(1.0 / SR)).collect();
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
        t.note_on(45, SR);
        let mut seen = [false; 16];
        for _ in 0..SR as usize / 10 {
            seen[t.sample() as usize] = true;
        }
        assert!(seen.iter().all(|&s| s));
    }

    #[test]
    fn triangle_holds_level_after_note_off() {
        let mut t = Triangle::default();
        t.note_on(45, SR);
        for _ in 0..137 {
            t.sample();
        }
        t.note_off();
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
    fn envelope_decays_to_silence() {
        let mut e = Envelope::default();
        e.trigger(15, 30.0);
        assert_eq!(e.volume(), 15);
        for _ in 0..SR as usize {
            e.advance(1.0 / SR);
        }
        assert_eq!(e.volume(), 0);
    }
}
