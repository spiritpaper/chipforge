//! Classic sfxr sounds: a faithful port of jsfxr's synthesizer
//! (<https://github.com/chr15m/jsfxr>, the Unlicense), itself a port of DrPetter's sfxr
//! (MIT, Copyright (c) 2007 Tomas Pettersson). Sounds made in sfxr, jsfxr or rFXGen
//! sound the same here, which the chip-only synth in [`crate::sfx`] can't promise:
//! classic sounds have sawtooth and sine waves, a resonant filter and a flanger.
//!
//! Parameters keep sfxr's names and its 0..1 (or -1..1) scales, so imported sounds
//! carry over number for number. The maths runs in f64 like the JavaScript original,
//! because the slides multiply every sample and f32 would drift. The one difference
//! is noise: jsfxr uses `Math.random`, this uses a fixed seed, so a sound is the same
//! every time it plays.

use crate::sfx::{ParamSpec, Rng};
use std::f64::consts::PI;

/// sfxr's own rate; other rates are resampled from it.
pub const BASE_RATE: f64 = 44_100.0;
const OVERSAMPLING: usize = 8;
/// Longest possible envelope (three stages of 100 000 samples), with room to spare.
const MAX_SAMPLES: usize = 320_000;

const fn spec(key: &'static str, min: f32, max: f32, default: f32, integer: bool) -> ParamSpec {
    ParamSpec {
        key,
        min,
        max,
        default,
        integer,
    }
}

/// Parameter indices into [`SfxrParams`], in jsfxr's serialization order (plus the
/// volume, which its share codes leave out).
pub mod idx {
    pub const WAVE: usize = 0;
    pub const ATTACK: usize = 1;
    pub const SUSTAIN: usize = 2;
    pub const PUNCH: usize = 3;
    pub const DECAY: usize = 4;
    pub const BASE_FREQ: usize = 5;
    pub const FREQ_LIMIT: usize = 6;
    pub const FREQ_RAMP: usize = 7;
    pub const FREQ_DRAMP: usize = 8;
    pub const VIB_STRENGTH: usize = 9;
    pub const VIB_SPEED: usize = 10;
    pub const ARP_MOD: usize = 11;
    pub const ARP_SPEED: usize = 12;
    pub const DUTY: usize = 13;
    pub const DUTY_RAMP: usize = 14;
    pub const REPEAT_SPEED: usize = 15;
    pub const PHA_OFFSET: usize = 16;
    pub const PHA_RAMP: usize = 17;
    pub const LPF_FREQ: usize = 18;
    pub const LPF_RAMP: usize = 19;
    pub const LPF_RESONANCE: usize = 20;
    pub const HPF_FREQ: usize = 21;
    pub const HPF_RAMP: usize = 22;
    pub const SOUND_VOL: usize = 23;
}

pub const PARAM_COUNT: usize = 24;

/// `wave_type` is 0 square, 1 sawtooth, 2 sine, 3 noise. Repeat and change speed go
/// below zero because jsfxr's random sounds use those values (slower than the slider's
/// slowest); other parameters only matter by size, see [`SfxrParams::canonical`].
pub const PARAMS: [ParamSpec; PARAM_COUNT] = [
    spec("wave_type", 0.0, 3.0, 0.0, true),
    spec("p_env_attack", 0.0, 1.0, 0.0, false),
    spec("p_env_sustain", 0.0, 1.0, 0.3, false),
    spec("p_env_punch", 0.0, 1.0, 0.0, false),
    spec("p_env_decay", 0.0, 1.0, 0.4, false),
    // jsfxr's random sounds reach 1.5 (about 8 kHz); its slider stops at 1.
    spec("p_base_freq", 0.0, 1.5, 0.3, false),
    spec("p_freq_limit", 0.0, 1.0, 0.0, false),
    spec("p_freq_ramp", -1.0, 1.0, 0.0, false),
    spec("p_freq_dramp", -1.0, 1.0, 0.0, false),
    spec("p_vib_strength", 0.0, 1.0, 0.0, false),
    spec("p_vib_speed", 0.0, 1.0, 0.0, false),
    spec("p_arp_mod", -1.0, 1.0, 0.0, false),
    spec("p_arp_speed", -1.0, 1.0, 0.0, false),
    spec("p_duty", 0.0, 1.0, 0.0, false),
    spec("p_duty_ramp", -1.0, 1.0, 0.0, false),
    spec("p_repeat_speed", -1.0, 1.0, 0.0, false),
    spec("p_pha_offset", -1.0, 1.0, 0.0, false),
    spec("p_pha_ramp", -1.0, 1.0, 0.0, false),
    spec("p_lpf_freq", 0.0, 1.0, 1.0, false),
    spec("p_lpf_ramp", -1.0, 1.0, 0.0, false),
    spec("p_lpf_resonance", 0.0, 1.0, 0.0, false),
    spec("p_hpf_freq", 0.0, 1.0, 0.0, false),
    spec("p_hpf_ramp", -1.0, 1.0, 0.0, false),
    spec("sound_vol", 0.0, 1.0, 0.5, false),
];

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SfxrParams(pub [f32; PARAM_COUNT]);

impl Default for SfxrParams {
    fn default() -> Self {
        Self(std::array::from_fn(|i| PARAMS[i].default))
    }
}

impl SfxrParams {
    pub fn get(&self, i: usize) -> f64 {
        self.0[i] as f64
    }

    /// Sets a parameter, clamped to its range (rounded for the wave). Non-finite values
    /// fall back to the default.
    pub fn set(&mut self, i: usize, value: f64) {
        let s = &PARAMS[i];
        let v = if value.is_finite() {
            (value as f32).clamp(s.min, s.max)
        } else {
            s.default
        };
        self.0[i] = if s.integer { v.round() } else { v };
    }

    /// Brings values sfxr allows outside the sliders back into range without changing
    /// the sound: negative values of parameters sfxr squares become positive, and a
    /// negative vibrato or duty means "none" to the synth. Then clamps everything.
    pub fn canonical(mut self) -> Self {
        use idx::*;
        for i in [
            ATTACK,
            SUSTAIN,
            DECAY,
            BASE_FREQ,
            FREQ_LIMIT,
            VIB_SPEED,
            LPF_RESONANCE,
            HPF_FREQ,
        ] {
            self.0[i] = self.0[i].abs();
        }
        for i in [VIB_STRENGTH, DUTY] {
            self.0[i] = self.0[i].max(0.0);
        }
        for i in 0..PARAM_COUNT {
            self.set(i, self.0[i] as f64);
        }
        self
    }
}

/// The per-repeat part of the synth state (jsfxr's `initForRepeat`).
struct Pitch {
    period: f64,
    period_max: f64,
    cutoff: bool,
    period_mult: f64,
    period_mult_slide: f64,
    duty: f64,
    duty_slide: f64,
    arp_mult: f64,
    arp_time: u32,
    elapsed: u32,
}

impl Pitch {
    fn new(p: &SfxrParams) -> Self {
        use idx::*;
        let arp = p.get(ARP_MOD);
        Self {
            period: 100.0 / (p.get(BASE_FREQ).powi(2) + 0.001),
            period_max: 100.0 / (p.get(FREQ_LIMIT).powi(2) + 0.001),
            cutoff: p.get(FREQ_LIMIT) > 0.0,
            period_mult: 1.0 - p.get(FREQ_RAMP).powi(3) * 0.01,
            period_mult_slide: -p.get(FREQ_DRAMP).powi(3) * 0.000001,
            duty: 0.5 - p.get(DUTY) * 0.5,
            duty_slide: -p.get(DUTY_RAMP) * 0.00005,
            arp_mult: if arp >= 0.0 {
                1.0 - arp.powi(2) * 0.9
            } else {
                1.0 + arp.powi(2) * 10.0
            },
            arp_time: if p.get(ARP_SPEED) == 1.0 {
                0
            } else {
                ((1.0 - p.get(ARP_SPEED)).powi(2) * 20_000.0 + 32.0).floor() as u32
            },
            elapsed: 0,
        }
    }
}

/// Renders a sound at sfxr's 44.1 kHz, as jsfxr's `getRawBuffer` (its "normalized"
/// output). Deterministic for the same parameters.
pub fn render_native(p: &SfxrParams) -> Vec<f32> {
    use idx::*;
    let wave = p.get(WAVE) as u8;

    let mut fltw = p.get(LPF_FREQ).powi(3) * 0.1;
    let lpf_on = p.0[LPF_FREQ] != 1.0;
    let fltw_d = 1.0 + p.get(LPF_RAMP) * 0.0001;
    let fltdmp = (5.0 / (1.0 + p.get(LPF_RESONANCE).powi(2) * 20.0) * (0.01 + fltw)).min(0.8);
    let mut flthp = p.get(HPF_FREQ).powi(2) * 0.1;
    let flthp_d = 1.0 + p.get(HPF_RAMP) * 0.0003;

    let vib_speed = p.get(VIB_SPEED).powi(2) * 0.01;
    let vib_amp = p.get(VIB_STRENGTH) * 0.5;

    let env_len =
        [ATTACK, SUSTAIN, DECAY].map(|i| (p.get(i) * p.get(i) * 100_000.0).floor() as u32);
    let punch = p.get(PUNCH);

    let mut flanger = p.get(PHA_OFFSET).powi(2) * 1020.0;
    if p.get(PHA_OFFSET) < 0.0 {
        flanger = -flanger;
    }
    let mut flanger_slide = p.get(PHA_RAMP).powi(2);
    if p.get(PHA_RAMP) < 0.0 {
        flanger_slide = -flanger_slide;
    }

    let repeat_time = if p.get(REPEAT_SPEED) == 0.0 {
        0
    } else {
        ((1.0 - p.get(REPEAT_SPEED)).powi(2) * 20_000.0 + 32.0).floor() as u32
    };
    let gain = p.get(SOUND_VOL).exp() - 1.0;

    let mut pitch = Pitch::new(p);
    let mut rng = Rng::new(0x5F58_5246);
    let mut noise = [0.0f64; 32];
    for v in noise.iter_mut() {
        *v = rng.unit() as f64 * 2.0 - 1.0;
    }

    let (mut fltp, mut fltdp, mut fltphp) = (0.0f64, 0.0f64, 0.0f64);
    let mut stage = 0usize;
    let mut stage_elapsed = 0u32;
    let mut vib_phase = 0.0f64;
    let mut phase = 0usize;
    let mut ipp = 0usize;
    let mut flanger_buf = [0.0f64; 1024];
    let mut out = Vec::new();

    for t in 0..MAX_SAMPLES as u32 {
        if repeat_time != 0 {
            pitch.elapsed += 1;
            if pitch.elapsed >= repeat_time {
                pitch = Pitch::new(p);
            }
        }
        // jsfxr compares the sample count since the start, not since the repeat.
        if pitch.arp_time != 0 && t >= pitch.arp_time {
            pitch.arp_time = 0;
            pitch.period *= pitch.arp_mult;
        }

        pitch.period_mult += pitch.period_mult_slide;
        pitch.period *= pitch.period_mult;
        if pitch.period > pitch.period_max {
            pitch.period = pitch.period_max;
            if pitch.cutoff {
                break;
            }
        }

        let mut rfperiod = pitch.period;
        if vib_amp > 0.0 {
            vib_phase += vib_speed;
            rfperiod = pitch.period * (1.0 + vib_phase.sin() * vib_amp);
        }
        let iperiod = (rfperiod.floor() as usize).max(OVERSAMPLING);

        pitch.duty = (pitch.duty + pitch.duty_slide).clamp(0.0, 0.5);

        stage_elapsed += 1;
        if stage_elapsed > env_len[stage] {
            stage_elapsed = 0;
            stage += 1;
            if stage > 2 {
                break;
            }
        }
        // jsfxr divides 0 by 0 here for one sample when a stage has no length (a NaN
        // reaches the speakers); counting it as the start of the stage is silent.
        let envf = if env_len[stage] == 0 {
            0.0
        } else {
            stage_elapsed as f64 / env_len[stage] as f64
        };
        let env_vol = match stage {
            0 => envf,
            1 => 1.0 + (1.0 - envf) * 2.0 * punch,
            _ => 1.0 - envf,
        };

        flanger += flanger_slide;
        let iphase = (flanger.floor().abs() as usize).min(1023);

        if flthp_d != 0.0 {
            flthp = (flthp * flthp_d).clamp(0.00001, 0.1);
        }

        let mut sample = 0.0f64;
        for _ in 0..OVERSAMPLING {
            phase += 1;
            if phase >= iperiod {
                phase %= iperiod;
                if wave == 3 {
                    for v in noise.iter_mut() {
                        *v = rng.unit() as f64 * 2.0 - 1.0;
                    }
                }
            }
            let fp = phase as f64 / iperiod as f64;
            let duty = pitch.duty;
            let mut sub = match wave {
                0 => {
                    if fp < duty {
                        0.5
                    } else {
                        -0.5
                    }
                }
                1 => {
                    if fp < duty {
                        -1.0 + 2.0 * fp / duty
                    } else {
                        1.0 - 2.0 * (fp - duty) / (1.0 - duty)
                    }
                }
                2 => (fp * 2.0 * PI).sin(),
                _ => noise[(phase * 32 / iperiod).min(31)],
            };

            let pp = fltp;
            fltw = (fltw * fltw_d).clamp(0.0, 0.1);
            if lpf_on {
                fltdp += (sub - fltp) * fltw;
                fltdp -= fltdp * fltdmp;
            } else {
                fltp = sub;
                fltdp = 0.0;
            }
            fltp += fltdp;

            fltphp += fltp - pp;
            fltphp -= fltphp * flthp;
            sub = fltphp;

            flanger_buf[ipp & 1023] = sub;
            sub += flanger_buf[(ipp + 1024 - iphase) & 1023];
            ipp = (ipp + 1) & 1023;

            sample += sub * env_vol;
        }
        out.push((sample / OVERSAMPLING as f64 * gain) as f32);
    }
    out
}

/// Renders at any sample rate (linear resampling from 44.1 kHz), clamped to [-1, 1]
/// with a 2 ms fade so a cut-off sound never ends on a click.
pub fn render(p: &SfxrParams, sample_rate: f32) -> Vec<f32> {
    let native = render_native(p);
    let ratio = BASE_RATE / sample_rate as f64;
    let mut out: Vec<f32> = if (ratio - 1.0).abs() < 1e-9 {
        native
    } else {
        let n = (native.len() as f64 / ratio) as usize;
        (0..n)
            .map(|i| {
                let x = i as f64 * ratio;
                let k = x as usize;
                let f = (x - k as f64) as f32;
                let a = native[k.min(native.len() - 1)];
                let b = native[(k + 1).min(native.len() - 1)];
                a + (b - a) * f
            })
            .collect()
    };
    for s in out.iter_mut() {
        *s = s.clamp(-1.0, 1.0);
    }
    let fade = ((0.002 * sample_rate) as usize).min(out.len());
    let len = out.len();
    for (k, s) in out[len - fade..].iter_mut().enumerate() {
        *s *= 1.0 - (k + 1) as f32 / fade as f32;
    }
    out
}

/// jsfxr's presets, in the order of [`generate`]'s `preset` argument.
pub const PRESETS: [&str; 11] = [
    "pickupCoin",
    "laserShoot",
    "explosion",
    "powerUp",
    "hitHurt",
    "jump",
    "blipSelect",
    "synth",
    "tone",
    "click",
    "random",
];

/// jsfxr's random helpers, seeded.
struct Dice(Rng);

impl Dice {
    /// `frnd(range)`: uniform in [0, range).
    fn frnd(&mut self, range: f64) -> f64 {
        self.0.unit() as f64 * range
    }
    /// `rndr(from, to)`.
    fn rndr(&mut self, from: f64, to: f64) -> f64 {
        self.frnd(to - from) + from
    }
    /// `rnd(max)`: an integer in 0..=max.
    fn rnd(&mut self, max: u32) -> u32 {
        ((self.0.unit() as f64 * (max + 1) as f64).floor() as u32).min(max)
    }
    fn coin(&mut self) -> bool {
        self.rnd(1) == 1
    }
}

const SQUARE: f64 = 0.0;
const SAWTOOTH: f64 = 1.0;
const SINE: f64 = 2.0;
const NOISE: f64 = 3.0;

/// A fresh variation of a jsfxr preset. Out-of-range presets fall back to `random`.
pub fn generate(preset: usize, seed: u32) -> SfxrParams {
    let mut d = Dice(Rng::new(seed));
    let name = PRESETS.get(preset).copied().unwrap_or("random");
    // Built in f64 like jsfxr, with no clamping until the end.
    let mut v: [f64; PARAM_COUNT] = std::array::from_fn(|i| PARAMS[i].default as f64);
    // jsfxr's presets start from Params() but sound_vol stays at its default.
    fill(name, &mut v, &mut d);
    let mut p = SfxrParams::default();
    for (i, x) in v.iter().enumerate() {
        p.0[i] = *x as f32;
    }
    p.canonical()
}

fn fill(name: &str, v: &mut [f64; PARAM_COUNT], d: &mut Dice) {
    use idx::*;
    let sqr = |x: f64| x * x;
    let cube = |x: f64| x * x * x;
    match name {
        "pickupCoin" => {
            v[WAVE] = SAWTOOTH;
            v[BASE_FREQ] = 0.4 + d.frnd(0.5);
            v[ATTACK] = 0.0;
            v[SUSTAIN] = d.frnd(0.1);
            v[DECAY] = 0.1 + d.frnd(0.4);
            v[PUNCH] = 0.3 + d.frnd(0.3);
            if d.coin() {
                v[ARP_SPEED] = 0.5 + d.frnd(0.2);
                v[ARP_MOD] = 0.2 + d.frnd(0.4);
            }
        }
        "laserShoot" => {
            v[WAVE] = d.rnd(2) as f64;
            if v[WAVE] == SINE && d.coin() {
                v[WAVE] = d.rnd(1) as f64;
            }
            if d.rnd(2) == 0 {
                v[BASE_FREQ] = 0.3 + d.frnd(0.6);
                v[FREQ_LIMIT] = d.frnd(0.1);
                v[FREQ_RAMP] = -0.35 - d.frnd(0.3);
            } else {
                v[BASE_FREQ] = 0.5 + d.frnd(0.5);
                v[FREQ_LIMIT] = (v[BASE_FREQ] - 0.2 - d.frnd(0.6)).max(0.2);
                v[FREQ_RAMP] = -0.15 - d.frnd(0.2);
            }
            if v[WAVE] == SAWTOOTH {
                v[DUTY] = 1.0;
            }
            if d.coin() {
                v[DUTY] = d.frnd(0.5);
                v[DUTY_RAMP] = d.frnd(0.2);
            } else {
                v[DUTY] = 0.4 + d.frnd(0.5);
                v[DUTY_RAMP] = -d.frnd(0.7);
            }
            v[ATTACK] = 0.0;
            v[SUSTAIN] = 0.1 + d.frnd(0.2);
            v[DECAY] = d.frnd(0.4);
            if d.coin() {
                v[PUNCH] = d.frnd(0.3);
            }
            if d.rnd(2) == 0 {
                v[PHA_OFFSET] = d.frnd(0.2);
                v[PHA_RAMP] = -d.frnd(0.2);
            }
            v[HPF_FREQ] = d.frnd(0.3);
        }
        "explosion" => {
            v[WAVE] = NOISE;
            if d.coin() {
                v[BASE_FREQ] = sqr(0.1 + d.frnd(0.4));
                v[FREQ_RAMP] = -0.1 + d.frnd(0.4);
            } else {
                v[BASE_FREQ] = sqr(0.2 + d.frnd(0.7));
                v[FREQ_RAMP] = -0.2 - d.frnd(0.2);
            }
            if d.rnd(4) == 0 {
                v[FREQ_RAMP] = 0.0;
            }
            if d.rnd(2) == 0 {
                v[REPEAT_SPEED] = 0.3 + d.frnd(0.5);
            }
            v[ATTACK] = 0.0;
            v[SUSTAIN] = 0.1 + d.frnd(0.3);
            v[DECAY] = d.frnd(0.5);
            if d.coin() {
                v[PHA_OFFSET] = -0.3 + d.frnd(0.9);
                v[PHA_RAMP] = -d.frnd(0.3);
            }
            v[PUNCH] = 0.2 + d.frnd(0.6);
            if d.coin() {
                v[VIB_STRENGTH] = d.frnd(0.7);
                v[VIB_SPEED] = d.frnd(0.6);
            }
            if d.rnd(2) == 0 {
                v[ARP_SPEED] = 0.6 + d.frnd(0.3);
                v[ARP_MOD] = 0.8 - d.frnd(1.6);
            }
        }
        "powerUp" => {
            if d.coin() {
                v[WAVE] = SAWTOOTH;
                v[DUTY] = 1.0;
            } else {
                v[DUTY] = d.frnd(0.6);
            }
            v[BASE_FREQ] = 0.2 + d.frnd(0.3);
            if d.coin() {
                v[FREQ_RAMP] = 0.1 + d.frnd(0.4);
                v[REPEAT_SPEED] = 0.4 + d.frnd(0.4);
            } else {
                v[FREQ_RAMP] = 0.05 + d.frnd(0.2);
                if d.coin() {
                    v[VIB_STRENGTH] = d.frnd(0.7);
                    v[VIB_SPEED] = d.frnd(0.6);
                }
            }
            v[ATTACK] = 0.0;
            v[SUSTAIN] = d.frnd(0.4);
            v[DECAY] = 0.1 + d.frnd(0.4);
        }
        "hitHurt" => {
            v[WAVE] = d.rnd(2) as f64;
            if v[WAVE] == SINE {
                v[WAVE] = NOISE;
            }
            if v[WAVE] == SQUARE {
                v[DUTY] = d.frnd(0.6);
            }
            if v[WAVE] == SAWTOOTH {
                v[DUTY] = 1.0;
            }
            v[BASE_FREQ] = 0.2 + d.frnd(0.6);
            v[FREQ_RAMP] = -0.3 - d.frnd(0.4);
            v[ATTACK] = 0.0;
            v[SUSTAIN] = d.frnd(0.1);
            v[DECAY] = 0.1 + d.frnd(0.2);
            if d.coin() {
                v[HPF_FREQ] = d.frnd(0.3);
            }
        }
        "jump" => {
            v[WAVE] = SQUARE;
            v[DUTY] = d.frnd(0.6);
            v[BASE_FREQ] = 0.3 + d.frnd(0.3);
            v[FREQ_RAMP] = 0.1 + d.frnd(0.2);
            v[ATTACK] = 0.0;
            v[SUSTAIN] = 0.1 + d.frnd(0.3);
            v[DECAY] = 0.1 + d.frnd(0.2);
            if d.coin() {
                v[HPF_FREQ] = d.frnd(0.3);
            }
            if d.coin() {
                v[LPF_FREQ] = 1.0 - d.frnd(0.6);
            }
        }
        "blipSelect" => {
            v[WAVE] = d.rnd(1) as f64;
            v[DUTY] = if v[WAVE] == SQUARE { d.frnd(0.6) } else { 1.0 };
            v[BASE_FREQ] = 0.2 + d.frnd(0.4);
            v[ATTACK] = 0.0;
            v[SUSTAIN] = 0.1 + d.frnd(0.1);
            v[DECAY] = d.frnd(0.2);
            v[HPF_FREQ] = 0.1;
        }
        "synth" => {
            v[WAVE] = d.rnd(1) as f64;
            v[BASE_FREQ] =
                [0.2723171360931539, 0.19255692561524382, 0.13615778746815113][d.rnd(2) as usize];
            v[ATTACK] = if d.rnd(4) > 3 { d.frnd(0.5) } else { 0.0 };
            v[SUSTAIN] = d.frnd(1.0);
            v[PUNCH] = d.frnd(1.0);
            v[DECAY] = d.frnd(0.9) + 0.1;
            v[ARP_MOD] = [0.0, 0.0, 0.0, 0.0, -0.3162, 0.7454, 0.7454][d.rnd(6) as usize];
            v[ARP_SPEED] = d.frnd(0.5) + 0.4;
            v[DUTY] = d.frnd(1.0);
            v[DUTY_RAMP] = if d.rnd(2) == 2 { d.frnd(1.0) } else { 0.0 };
            v[LPF_FREQ] = if d.coin() {
                0.9 * d.frnd(1.0) * d.frnd(1.0) + 0.1
            } else {
                1.0
            };
            v[LPF_RAMP] = d.rndr(-1.0, 1.0);
            v[LPF_RESONANCE] = d.frnd(1.0);
            v[HPF_FREQ] = if d.rnd(3) == 3 { d.frnd(1.0) } else { 0.0 };
            v[HPF_RAMP] = if d.rnd(3) == 3 { d.frnd(1.0) } else { 0.0 };
        }
        "tone" => {
            v[WAVE] = SINE;
            v[BASE_FREQ] = 0.35173364; // 440 Hz
            v[ATTACK] = 0.0;
            v[SUSTAIN] = 0.6641; // 1 second
            v[DECAY] = 0.0;
            v[PUNCH] = 0.0;
        }
        "click" => {
            let base = if d.coin() { "hitHurt" } else { "explosion" };
            fill(base, v, d);
            if d.coin() {
                v[FREQ_RAMP] = -0.5 + d.frnd(1.0);
            }
            if d.coin() {
                v[SUSTAIN] *= d.frnd(0.4) + 0.2;
                v[DECAY] *= d.frnd(0.4) + 0.2;
            }
            if d.rnd(3) == 0 {
                v[ATTACK] = d.frnd(0.3);
            }
            v[BASE_FREQ] = 1.0 - d.frnd(0.25);
            v[HPF_FREQ] = 1.0 - d.frnd(0.1);
        }
        _ => {
            v[WAVE] = d.rnd(3) as f64;
            v[BASE_FREQ] = if d.coin() {
                cube(d.frnd(2.0) - 1.0) + 0.5
            } else {
                sqr(d.frnd(1.0))
            };
            v[FREQ_LIMIT] = 0.0;
            v[FREQ_RAMP] = (d.frnd(2.0) - 1.0).powi(5);
            if v[BASE_FREQ] > 0.7 && v[FREQ_RAMP] > 0.2 {
                v[FREQ_RAMP] = -v[FREQ_RAMP];
            }
            if v[BASE_FREQ] < 0.2 && v[FREQ_RAMP] < -0.05 {
                v[FREQ_RAMP] = -v[FREQ_RAMP];
            }
            v[FREQ_DRAMP] = cube(d.frnd(2.0) - 1.0);
            v[DUTY] = d.frnd(2.0) - 1.0;
            v[DUTY_RAMP] = cube(d.frnd(2.0) - 1.0);
            v[VIB_STRENGTH] = cube(d.frnd(2.0) - 1.0);
            v[VIB_SPEED] = d.rndr(-1.0, 1.0);
            v[ATTACK] = cube(d.rndr(-1.0, 1.0));
            v[SUSTAIN] = sqr(d.rndr(-1.0, 1.0));
            v[DECAY] = d.rndr(-1.0, 1.0);
            v[PUNCH] = sqr(d.frnd(0.8));
            if v[ATTACK] + v[SUSTAIN] + v[DECAY] < 0.2 {
                v[SUSTAIN] += 0.2 + d.frnd(0.3);
                v[DECAY] += 0.2 + d.frnd(0.3);
            }
            v[LPF_RESONANCE] = d.rndr(-1.0, 1.0);
            v[LPF_FREQ] = 1.0 - cube(d.frnd(1.0));
            v[LPF_RAMP] = cube(d.frnd(2.0) - 1.0);
            if v[LPF_FREQ] < 0.1 && v[LPF_RAMP] < -0.05 {
                v[LPF_RAMP] = -v[LPF_RAMP];
            }
            v[HPF_FREQ] = d.frnd(1.0).powi(5);
            v[HPF_RAMP] = (d.frnd(2.0) - 1.0).powi(5);
            v[PHA_OFFSET] = cube(d.frnd(2.0) - 1.0);
            v[PHA_RAMP] = cube(d.frnd(2.0) - 1.0);
            v[REPEAT_SPEED] = d.frnd(2.0) - 1.0;
            v[ARP_SPEED] = d.frnd(2.0) - 1.0;
            v[ARP_MOD] = d.frnd(2.0) - 1.0;
        }
    }
}

/// jsfxr's mutate: each tone parameter has an even chance of moving by up to ±0.05
/// (scaled by `amount / 0.1`, so 0.1 is jsfxr's own step). The wave stays.
pub fn mutate(params: &SfxrParams, seed: u32, amount: f32) -> SfxrParams {
    let mut d = Dice(Rng::new(seed));
    let step = amount as f64;
    let mut p = *params;
    for i in 1..PARAM_COUNT {
        if i == idx::SOUND_VOL || !d.coin() {
            continue;
        }
        let nudged = p.get(i) + d.frnd(step) - step / 2.0;
        p.set(i, nudged);
    }
    p
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt()
    }

    #[test]
    fn param_table_is_consistent() {
        for (i, s) in PARAMS.iter().enumerate() {
            assert!(
                s.min < s.max && (s.min..=s.max).contains(&s.default),
                "{}",
                s.key
            );
            assert_eq!(
                PARAMS.iter().position(|o| o.key == s.key),
                Some(i),
                "{}",
                s.key
            );
        }
    }

    #[test]
    fn every_preset_makes_sound_and_is_repeatable() {
        for (preset, name) in PRESETS.iter().enumerate() {
            for seed in 0..20 {
                let p = generate(preset, seed);
                assert_eq!(p, generate(preset, seed));
                for (i, s) in PARAMS.iter().enumerate() {
                    assert!((s.min..=s.max).contains(&p.0[i]), "{name} {}", s.key);
                }
                let out = render(&p, 44_100.0);
                assert!(out.iter().all(|v| v.is_finite() && v.abs() <= 1.0));
                assert_eq!(out, render(&p, 44_100.0), "noise must be seeded");
            }
            // Most takes of a preset are audible (random ones may be silent, as in sfxr).
            let loud = (0..20)
                .filter(|&s| rms(&render(&generate(preset, s), 44_100.0)) > 0.01)
                .count();
            assert!(loud >= 12 || *name == "random", "{name}: {loud}");
        }
    }

    #[test]
    fn the_tone_preset_is_a_440_hz_second() {
        let out = render_native(&generate(8, 1));
        assert!(
            (out.len() as f64 / BASE_RATE - 1.0).abs() < 0.01,
            "{}",
            out.len()
        );
        // Count rising zero crossings over the steady middle half second.
        let mid = &out[11_025..33_075];
        let rising = mid.windows(2).filter(|w| w[0] < 0.0 && w[1] >= 0.0).count();
        assert!((219..=221).contains(&rising), "{rising}");
    }

    #[test]
    fn canonical_keeps_the_sound() {
        let mut odd = SfxrParams::default();
        odd.0[idx::WAVE] = 1.0;
        odd.0[idx::ATTACK] = -0.2;
        odd.0[idx::DECAY] = -0.5;
        odd.0[idx::VIB_STRENGTH] = -0.4;
        odd.0[idx::DUTY] = -0.3;
        let fixed = odd.canonical();
        assert_eq!(fixed.0[idx::ATTACK], 0.2);
        assert_eq!(fixed.0[idx::VIB_STRENGTH], 0.0);
        assert_eq!(render_native(&odd), render_native(&fixed));
    }

    #[test]
    fn resampling_keeps_the_length_in_seconds() {
        let p = generate(0, 5);
        let a = render(&p, 44_100.0).len() as f32 / 44_100.0;
        let b = render(&p, 48_000.0).len() as f32 / 48_000.0;
        assert!((a - b).abs() < 0.001);
    }

    #[test]
    fn mutate_stays_close_and_keeps_the_wave() {
        let base = generate(1, 3);
        let m = mutate(&base, 9, 0.1);
        assert_ne!(m, base);
        assert_eq!(m.0[idx::WAVE], base.0[idx::WAVE]);
        for (i, s) in PARAMS.iter().enumerate().skip(1) {
            assert!((m.0[i] - base.0[i]).abs() <= 0.051, "{}", s.key);
        }
    }
}
