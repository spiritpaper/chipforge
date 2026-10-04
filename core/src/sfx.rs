//! One-shot sound effects: a single chip voice shaped by an envelope, pitch movement
//! and a little post-processing.
//!
//! A sound is fully described by [`SfxParams`], a fixed list of named numbers (see
//! [`PARAMS`]). Presets and mutation are seeded, so `(preset, seed)` always gives the
//! same sound on every platform.

use crate::apu::poly_blep;
use crate::dsp::OnePole;
use std::f32::consts::TAU;

pub const MAX_SECONDS: f32 = 5.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ParamSpec {
    /// Stable name used by the UI, saved libraries and share links.
    pub key: &'static str,
    pub min: f32,
    pub max: f32,
    pub default: f32,
    pub integer: bool,
}

const fn spec(key: &'static str, min: f32, max: f32, default: f32, integer: bool) -> ParamSpec {
    ParamSpec {
        key,
        min,
        max,
        default,
        integer,
    }
}

/// Parameter indices into [`SfxParams`].
pub mod idx {
    pub const WAVE: usize = 0;
    pub const DUTY: usize = 1;
    pub const DUTY_SWEEP: usize = 2;
    pub const METALLIC: usize = 3;
    pub const VOLUME: usize = 4;
    pub const PITCH: usize = 5;
    pub const SLIDE: usize = 6;
    pub const SLIDE_CURVE: usize = 7;
    pub const STOP_BELOW: usize = 8;
    pub const JUMP_BY: usize = 9;
    pub const JUMP_AFTER: usize = 10;
    pub const ATTACK: usize = 11;
    pub const SUSTAIN: usize = 12;
    pub const PUNCH: usize = 13;
    pub const DECAY: usize = 14;
    pub const WOBBLE_DEPTH: usize = 15;
    pub const WOBBLE_SPEED: usize = 16;
    pub const REPEAT: usize = 17;
    pub const CRUNCH: usize = 18;
    pub const BRIGHTNESS: usize = 19;
    pub const CUT_LOWS: usize = 20;
}

pub const PARAM_COUNT: usize = 21;

/// Units: seconds for times, Hz for frequencies, octaves/s for slides, semitones for
/// jumps and wobble depth. `wave` is 0 pulse, 1 triangle, 2 noise.
pub const PARAMS: [ParamSpec; PARAM_COUNT] = [
    spec("wave", 0.0, 2.0, 0.0, true),
    spec("duty", 0.05, 0.5, 0.5, false),
    spec("dutySweep", -1.0, 1.0, 0.0, false),
    spec("metallic", 0.0, 1.0, 0.0, true),
    spec("volume", 0.0, 1.0, 0.6, false),
    spec("pitch", 30.0, 3000.0, 440.0, false),
    spec("slide", -12.0, 12.0, 0.0, false),
    spec("slideCurve", -40.0, 40.0, 0.0, false),
    spec("stopBelow", 0.0, 1000.0, 0.0, false),
    spec("jumpBy", -24.0, 24.0, 0.0, true),
    spec("jumpAfter", 0.0, 0.5, 0.0, false),
    spec("attack", 0.0, 0.5, 0.0, false),
    spec("sustain", 0.0, 1.5, 0.1, false),
    spec("punch", 0.0, 1.0, 0.0, false),
    spec("decay", 0.0, 2.0, 0.3, false),
    spec("wobbleDepth", 0.0, 2.0, 0.0, false),
    spec("wobbleSpeed", 0.0, 30.0, 6.0, false),
    spec("repeat", 0.0, 1.0, 0.0, false),
    spec("crunch", 0.0, 1.0, 0.0, false),
    spec("brightness", 200.0, 20_000.0, 20_000.0, false),
    spec("cutLows", 0.0, 2000.0, 0.0, false),
];

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SfxParams(pub [f32; PARAM_COUNT]);

impl Default for SfxParams {
    fn default() -> Self {
        Self(std::array::from_fn(|i| PARAMS[i].default))
    }
}

impl SfxParams {
    pub fn get(&self, i: usize) -> f32 {
        self.0[i]
    }

    /// Sets a parameter, clamped to its range (and rounded, for integer parameters).
    /// Non-finite values fall back to the default.
    pub fn set(&mut self, i: usize, value: f32) {
        let s = &PARAMS[i];
        let v = if value.is_finite() {
            value.clamp(s.min, s.max)
        } else {
            s.default
        };
        self.0[i] = if s.integer { v.round() } else { v };
    }

    /// Re-applies every range, e.g. after the array was written from outside.
    pub fn sanitize(&mut self) {
        for i in 0..PARAM_COUNT {
            self.set(i, self.0[i]);
        }
    }

    pub fn duration(&self) -> f32 {
        let total = self.get(idx::ATTACK) + self.get(idx::SUSTAIN) + self.get(idx::DECAY);
        total.clamp(0.01, MAX_SECONDS)
    }
}

/// Volume over time, 0..=1. Punch makes the start of the sustain louder than its end.
fn envelope(p: &SfxParams, t: f32) -> f32 {
    let (attack, sustain, decay) = (p.get(idx::ATTACK), p.get(idx::SUSTAIN), p.get(idx::DECAY));
    let punch_drop = 0.6 * p.get(idx::PUNCH);
    if t < attack {
        t / attack
    } else if t < attack + sustain {
        let u = (t - attack) / sustain;
        1.0 - punch_drop * u
    } else if t < attack + sustain + decay {
        (1.0 - punch_drop) * (1.0 - (t - attack - sustain) / decay)
    } else {
        0.0
    }
}

const TRIANGLE_STEPS: [f32; 32] = [
    15.0, 14.0, 13.0, 12.0, 11.0, 10.0, 9.0, 8.0, 7.0, 6.0, 5.0, 4.0, 3.0, 2.0, 1.0, 0.0, //
    0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0,
];

/// LFSR clocks per second for each Hz of the noise "pitch" parameter.
const NOISE_CLOCKS_PER_HZ: f32 = 50.0;

/// Renders a sound effect at `sample_rate`. Deterministic for the same inputs.
pub fn render(p: &SfxParams, sample_rate: f32) -> Vec<f32> {
    let sr = sample_rate;
    let n = (p.duration() * sr) as usize;
    let mut out = Vec::with_capacity(n);

    let wave = p.get(idx::WAVE) as u8;
    let metallic = p.get(idx::METALLIC) > 0.5;
    let volume = p.get(idx::VOLUME);
    let base = p.get(idx::PITCH);
    let (slide, curve) = (p.get(idx::SLIDE), p.get(idx::SLIDE_CURVE));
    let stop_below = p.get(idx::STOP_BELOW);
    let (jump_octaves, jump_after) = (p.get(idx::JUMP_BY) / 12.0, p.get(idx::JUMP_AFTER));
    let wobble_octaves = p.get(idx::WOBBLE_DEPTH) / 12.0;
    let wobble_speed = p.get(idx::WOBBLE_SPEED);
    let repeat = p.get(idx::REPEAT);
    let (duty0, duty_sweep) = (p.get(idx::DUTY), p.get(idx::DUTY_SWEEP));
    // Crunch lowers the effective sample rate: 0 → full rate, 1 → ~1.5 kHz.
    let hold_rate = sr * (1.0 - 0.97 * p.get(idx::CRUNCH)).powi(2);
    let brightness = p.get(idx::BRIGHTNESS);
    let cut_lows = p.get(idx::CUT_LOWS);
    let mut low_pass = (brightness < 19_999.0).then(|| OnePole::new(brightness, sr));
    let mut high_pass = (cut_lows > 0.0).then(|| OnePole::new(cut_lows, sr));

    let mut phase = 0.0f32;
    let mut lfsr: u16 = 1;
    let mut noise_acc = 0.0f32;
    let mut hold_acc = 1.0f32;
    let mut held = 0.0f32;

    for i in 0..n {
        let t = i as f32 / sr;
        // Repeat restarts the pitch movement, not the volume envelope.
        let tp = if repeat > 0.0 { t % repeat } else { t };
        let mut octaves = slide * tp + 0.5 * curve * tp * tp;
        if jump_after > 0.0 && tp >= jump_after {
            octaves += jump_octaves;
        }
        octaves += wobble_octaves * (TAU * wobble_speed * t).sin();
        let freq = base * octaves.exp2();
        if stop_below > 0.0 && freq < stop_below {
            break;
        }

        let osc = match wave {
            0 => {
                let inc = (freq / sr).min(0.45);
                let duty = (duty0 + duty_sweep * t).clamp(0.05, 0.95);
                let mut v = if phase < duty { 1.0 } else { -1.0 };
                v += poly_blep(phase, inc);
                v -= poly_blep((phase - duty + 1.0) % 1.0, inc);
                phase = (phase + inc) % 1.0;
                v
            }
            1 => {
                let inc = (freq / sr).min(0.45);
                let v = TRIANGLE_STEPS[(phase * 32.0) as usize % 32] / 7.5 - 1.0;
                phase = (phase + inc) % 1.0;
                v
            }
            _ => {
                noise_acc += (freq * NOISE_CLOCKS_PER_HZ / sr).min(64.0);
                while noise_acc >= 1.0 {
                    noise_acc -= 1.0;
                    let tap = if metallic { 6 } else { 1 };
                    let feedback = (lfsr ^ (lfsr >> tap)) & 1;
                    lfsr = (lfsr >> 1) | (feedback << 14);
                }
                if lfsr & 1 == 0 { 1.0 } else { -1.0 }
            }
        };

        // Quantize loudness to the chip's 16 volume steps.
        let level = (envelope(p, t) * 15.0).round() / 15.0;
        let sample = osc * level * volume;

        hold_acc += hold_rate / sr;
        if hold_acc >= 1.0 {
            hold_acc -= hold_acc.floor();
            held = sample;
        }
        let mut s = held;
        if let Some(hp) = high_pass.as_mut() {
            s = hp.high_pass(s);
        }
        if let Some(lp) = low_pass.as_mut() {
            s = lp.low_pass(s);
        }
        out.push(s.clamp(-1.0, 1.0));
    }

    // A 2 ms fade-out so cut-off sounds (stop-below, crunch) never end on a click.
    let fade = ((0.002 * sr) as usize).min(out.len());
    let len = out.len();
    for (k, s) in out[len - fade..].iter_mut().enumerate() {
        *s *= 1.0 - (k + 1) as f32 / fade as f32;
    }
    out
}

/// SplitMix64: tiny, fast and identical on every platform.
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u32) -> Self {
        Self(seed as u64 ^ 0x5EED_C41B_F00D_0001)
    }

    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform in [0, 1).
    pub fn unit(&mut self) -> f32 {
        (self.next_u64() >> 40) as f32 / (1u64 << 24) as f32
    }

    pub fn range(&mut self, lo: f32, hi: f32) -> f32 {
        lo + (hi - lo) * self.unit()
    }

    pub fn chance(&mut self, p: f32) -> bool {
        self.unit() < p
    }

    pub fn pick<T: Copy>(&mut self, items: &[T]) -> T {
        items[(self.next_u64() % items.len() as u64) as usize]
    }
}

/// Preset names, in the order of [`generate`]'s `preset` argument.
pub const PRESETS: [&str; 11] = [
    "coin",
    "jump",
    "laser",
    "explosion",
    "powerUp",
    "hit",
    "blip",
    "select",
    "hurt",
    "door",
    "random",
];

const PULSE: f32 = 0.0;
const TRIANGLE: f32 = 1.0;
const NOISE: f32 = 2.0;

/// A fresh variation of a preset. Out-of-range presets fall back to `random`.
pub fn generate(preset: usize, seed: u32) -> SfxParams {
    use idx::*;
    let mut r = Rng::new(seed);
    let mut p = SfxParams::default();
    let mut set = |i: usize, v: f32| p.set(i, v);
    let duties = [0.125, 0.25, 0.5];

    match PRESETS.get(preset).copied().unwrap_or("random") {
        "coin" => {
            set(WAVE, PULSE);
            set(DUTY, r.pick(&duties));
            set(PITCH, r.range(700.0, 1400.0));
            set(SUSTAIN, r.range(0.02, 0.1));
            set(PUNCH, r.range(0.3, 0.6));
            set(DECAY, r.range(0.1, 0.35));
            set(JUMP_BY, r.pick(&[4.0, 5.0, 7.0, 12.0]));
            set(JUMP_AFTER, r.range(0.04, 0.1));
        }
        "jump" => {
            set(WAVE, PULSE);
            set(DUTY, r.pick(&duties));
            set(PITCH, r.range(220.0, 480.0));
            set(SLIDE, r.range(1.5, 4.0));
            set(SUSTAIN, r.range(0.05, 0.15));
            set(DECAY, r.range(0.1, 0.25));
            if r.chance(0.4) {
                set(BRIGHTNESS, r.range(3000.0, 9000.0));
            }
        }
        "laser" => {
            set(WAVE, if r.chance(0.8) { PULSE } else { TRIANGLE });
            set(DUTY, r.range(0.1, 0.5));
            set(DUTY_SWEEP, r.range(-0.6, 0.6));
            set(PITCH, r.range(800.0, 2500.0));
            set(SLIDE, r.range(-12.0, -5.0));
            set(SLIDE_CURVE, r.range(0.0, 20.0));
            set(STOP_BELOW, r.range(80.0, 250.0));
            set(SUSTAIN, r.range(0.05, 0.15));
            set(DECAY, r.range(0.05, 0.25));
            if r.chance(0.3) {
                set(WOBBLE_DEPTH, r.range(0.2, 1.0));
                set(WOBBLE_SPEED, r.range(10.0, 25.0));
            }
        }
        "explosion" => {
            set(WAVE, NOISE);
            set(PITCH, r.range(60.0, 400.0));
            set(SLIDE, r.range(-2.0, -0.3));
            set(SUSTAIN, r.range(0.1, 0.35));
            set(PUNCH, r.range(0.3, 0.8));
            set(DECAY, r.range(0.3, 0.8));
            if r.chance(0.3) {
                set(REPEAT, r.range(0.1, 0.3));
            }
            if r.chance(0.4) {
                set(CRUNCH, r.range(0.2, 0.6));
            }
        }
        "powerUp" => {
            set(WAVE, if r.chance(0.7) { PULSE } else { TRIANGLE });
            set(DUTY, r.pick(&duties));
            set(PITCH, r.range(300.0, 600.0));
            set(SLIDE, r.range(1.0, 3.0));
            set(SUSTAIN, r.range(0.2, 0.4));
            set(DECAY, r.range(0.1, 0.4));
            if r.chance(0.5) {
                set(REPEAT, r.range(0.08, 0.15));
            } else {
                set(WOBBLE_DEPTH, r.range(0.3, 1.0));
                set(WOBBLE_SPEED, r.range(8.0, 20.0));
            }
        }
        "hit" => {
            set(WAVE, if r.chance(0.6) { NOISE } else { PULSE });
            set(DUTY, r.pick(&duties));
            set(PITCH, r.range(200.0, 900.0));
            set(SLIDE, r.range(-8.0, -3.0));
            set(SUSTAIN, r.range(0.02, 0.08));
            set(DECAY, r.range(0.08, 0.2));
            if r.chance(0.5) {
                set(CUT_LOWS, r.range(100.0, 600.0));
            }
        }
        "blip" => {
            set(WAVE, if r.chance(0.6) { PULSE } else { TRIANGLE });
            set(DUTY, r.pick(&[0.25, 0.5]));
            set(PITCH, r.range(400.0, 1600.0));
            set(SUSTAIN, r.range(0.02, 0.06));
            set(DECAY, r.range(0.02, 0.08));
        }
        "select" => {
            set(WAVE, PULSE);
            set(DUTY, r.pick(&duties));
            set(PITCH, r.range(500.0, 1000.0));
            set(SUSTAIN, r.range(0.06, 0.12));
            set(DECAY, r.range(0.05, 0.15));
            set(JUMP_BY, r.pick(&[7.0, 12.0]));
            set(JUMP_AFTER, r.range(0.04, 0.07));
        }
        "hurt" => {
            set(WAVE, PULSE);
            set(DUTY, 0.125);
            set(PITCH, r.range(300.0, 700.0));
            set(SLIDE, r.range(-4.0, -1.5));
            set(SUSTAIN, r.range(0.05, 0.12));
            set(DECAY, r.range(0.1, 0.25));
            set(WOBBLE_DEPTH, r.range(0.5, 1.5));
            set(WOBBLE_SPEED, r.range(15.0, 30.0));
        }
        "door" => {
            set(WAVE, NOISE);
            set(METALLIC, 1.0);
            set(PITCH, r.range(80.0, 200.0));
            set(SLIDE, r.range(-1.0, 0.0));
            set(SUSTAIN, r.range(0.05, 0.15));
            set(DECAY, r.range(0.15, 0.35));
            set(BRIGHTNESS, r.range(1500.0, 5000.0));
        }
        _ => {
            for (i, s) in PARAMS.iter().enumerate() {
                set(i, r.range(s.min, s.max));
            }
            // Keep fully random sounds short, audible and in a useful pitch range.
            set(VOLUME, r.range(0.4, 0.8));
            set(PITCH, 60.0 * r.range(0.0, 5.5).exp2());
            set(STOP_BELOW, 0.0);
            set(ATTACK, r.range(0.0, 0.1));
            set(SUSTAIN, r.range(0.02, 0.4));
            set(DECAY, r.range(0.05, 0.6));
            set(SLIDE, r.range(-4.0, 4.0));
            set(SLIDE_CURVE, r.range(-8.0, 8.0));
            set(BRIGHTNESS, r.range(2000.0, 20_000.0));
            set(CUT_LOWS, r.range(0.0, 400.0));
            set(CRUNCH, r.range(0.0, 0.5));
        }
    }
    p
}

/// A nearby variation: about half the parameters move by up to `amount` of their
/// range. The wave type never changes, so a laser stays a laser.
pub fn mutate(params: &SfxParams, seed: u32, amount: f32) -> SfxParams {
    let mut r = Rng::new(seed);
    let mut p = *params;
    for (i, s) in PARAMS.iter().enumerate() {
        if i == idx::WAVE || i == idx::METALLIC || !r.chance(0.5) {
            continue;
        }
        let v = p.get(i);
        let nudged = match i {
            // Pitch-like values move on a musical (log) scale.
            idx::PITCH | idx::BRIGHTNESS => v * (r.range(-1.0, 1.0) * amount * 2.0).exp2(),
            idx::JUMP_BY => v + r.pick(&[-1.0, 0.0, 1.0]),
            // Don't switch off features by nudging; only adjust ones in use.
            _ if v == 0.0 && s.min == 0.0 => continue,
            _ => v + r.range(-1.0, 1.0) * amount * (s.max - s.min),
        };
        p.set(i, nudged);
    }
    p
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f32 = 48_000.0;

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt()
    }

    #[test]
    fn param_table_is_consistent() {
        for (i, s) in PARAMS.iter().enumerate() {
            assert!(s.min < s.max, "{}", s.key);
            assert!((s.min..=s.max).contains(&s.default), "{}", s.key);
            assert_eq!(
                PARAMS.iter().filter(|o| o.key == s.key).count(),
                1,
                "{}",
                s.key
            );
            let mut p = SfxParams::default();
            p.set(i, f32::NAN);
            assert_eq!(p.get(i), s.default);
        }
    }

    #[test]
    fn set_clamps_and_rounds() {
        let mut p = SfxParams::default();
        p.set(idx::PITCH, 1e9);
        assert_eq!(p.get(idx::PITCH), 3000.0);
        p.set(idx::JUMP_BY, 4.6);
        assert_eq!(p.get(idx::JUMP_BY), 5.0);
    }

    #[test]
    fn steady_pulse_plays_its_pitch() {
        let mut p = SfxParams::default();
        p.set(idx::SUSTAIN, 1.0);
        p.set(idx::DECAY, 0.0);
        let out = render(&p, SR);
        let rises = out.windows(2).filter(|w| w[0] < 0.0 && w[1] >= 0.0).count();
        let hz = rises as f32 / p.duration();
        assert!((hz - 440.0).abs() < 3.0, "measured {hz}");
    }

    #[test]
    fn length_follows_the_envelope() {
        let mut p = SfxParams::default();
        p.set(idx::ATTACK, 0.1);
        p.set(idx::SUSTAIN, 0.2);
        p.set(idx::DECAY, 0.3);
        assert_eq!(render(&p, SR).len(), (0.6 * SR) as usize);
    }

    #[test]
    fn stop_below_cuts_a_falling_sound_short() {
        let mut p = SfxParams::default();
        p.set(idx::SLIDE, -8.0);
        p.set(idx::SUSTAIN, 1.0);
        let full = render(&p, SR).len();
        p.set(idx::STOP_BELOW, 200.0);
        let cut = render(&p, SR).len();
        assert!(cut < full / 4, "{cut} vs {full}");
    }

    #[test]
    fn every_preset_is_audible_and_well_formed() {
        for (preset, name) in PRESETS.iter().enumerate() {
            for seed in 0..40 {
                let p = generate(preset, seed);
                let out = render(&p, SR);
                assert!(
                    !out.is_empty() && out.len() <= (MAX_SECONDS * SR) as usize,
                    "{name}"
                );
                assert!(
                    out.iter().all(|v| v.is_finite() && v.abs() <= 1.0),
                    "{name}"
                );
                assert!(rms(&out) > 0.01, "{name} seed {seed} is silent");
                assert!(out.last().unwrap().abs() < 1e-3, "{name} ends on a click");
            }
        }
    }

    #[test]
    fn presets_have_their_character() {
        for seed in 0..20 {
            assert!(generate(0, seed).get(idx::JUMP_BY) > 0.0, "coins jump up");
            assert!(generate(1, seed).get(idx::SLIDE) > 0.0, "jumps rise");
            assert!(generate(2, seed).get(idx::SLIDE) < 0.0, "lasers fall");
            assert_eq!(
                generate(3, seed).get(idx::WAVE),
                NOISE,
                "explosions are noise"
            );
        }
    }

    #[test]
    fn generation_is_seeded() {
        assert_eq!(generate(0, 7), generate(0, 7));
        assert_ne!(generate(0, 7), generate(0, 8));
        assert_eq!(render(&generate(3, 1), SR), render(&generate(3, 1), SR));
    }

    #[test]
    fn mutate_stays_close_and_in_range() {
        let base = generate(2, 3);
        let m = mutate(&base, 99, 0.1);
        assert_ne!(m, base);
        assert_eq!(m.get(idx::WAVE), base.get(idx::WAVE));
        assert_eq!(m, mutate(&base, 99, 0.1));
        for (i, s) in PARAMS.iter().enumerate() {
            assert!((s.min..=s.max).contains(&m.get(i)), "{}", s.key);
        }
    }
}
