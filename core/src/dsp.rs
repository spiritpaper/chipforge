//! Small DSP building blocks shared by the chip and the SFX synth.

/// One-pole filter; the NES output stage is close enough to a high-pass and low-pass pair.
#[derive(Clone, Copy, Debug)]
pub struct OnePole {
    a: f32,
    prev_in: f32,
    prev_out: f32,
}

impl OnePole {
    pub fn new(cutoff_hz: f32, sample_rate: f32) -> Self {
        let a = (-2.0 * std::f32::consts::PI * cutoff_hz / sample_rate).exp();
        Self {
            a,
            prev_in: 0.0,
            prev_out: 0.0,
        }
    }

    pub fn high_pass(&mut self, x: f32) -> f32 {
        let y = self.a * (self.prev_out + x - self.prev_in);
        self.prev_in = x;
        self.prev_out = y;
        y
    }

    pub fn low_pass(&mut self, x: f32) -> f32 {
        let y = x + self.a * (self.prev_out - x);
        self.prev_out = y;
        y
    }
}
