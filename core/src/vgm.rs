//! VGM export: a song as a log of sound-chip register writes (VGM 1.61) for the NES
//! 2A03 or the Game Boy DMG, playable in VGM players and emulators (VGMPlay,
//! foobar2000) on real chip models.
//!
//! The tracker player runs exactly as it does for audio; each tick its channel state is
//! translated into register writes, writing only what changed. Pitches use the same
//! hardware timer values the chip core plays.

use crate::apu::{Voice, noise_period, pulse_timer, semitones_to_hz, triangle_timer};
use crate::gb;
use crate::tracker::{CHANNELS, ChipKind, Player, Song};

/// VGM's fixed sample clock.
pub const VGM_RATE: u32 = 44_100;
const NES_CLOCK: u32 = 1_789_772;
const GB_CLOCK: u32 = 4_194_304;
/// VGM commands: write a register on the NES APU ($4000+) or Game Boy ($FF10+).
const CMD_NES: u8 = 0xB4;
const CMD_GB: u8 = 0xB3;
const HEADER_LEN: usize = 0x100;
/// Songs that never loop are cut here.
const MAX_SAMPLES: u64 = VGM_RATE as u64 * 600;

/// APU register offsets from $4000.
const PULSE: [u8; 2] = [0x00, 0x04];
const TRI_CONTROL: u8 = 0x08;
const TRI_LO: u8 = 0x0A;
const TRI_HI: u8 = 0x0B;
const NOISE_VOL: u8 = 0x0C;
const NOISE_PERIOD: u8 = 0x0E;
const NOISE_LENGTH: u8 = 0x0F;
const STATUS: u8 = 0x15;
const FRAME_COUNTER: u8 = 0x17;
/// Length-counter load bits for $4003/$4007/$400B/$400F; with the halt flag set the
/// length never runs out, but it must be loaded once for the channel to sound.
const LENGTH_LOAD: u8 = 0x08;

/// Game Boy register offsets from $FF10.
mod dmg {
    /// NRx1 (duty), NRx2 (envelope), NRx3 (frequency low), NRx4 (trigger, high).
    pub const PULSE: [u8; 2] = [0x01, 0x06];
    pub const SWEEP: u8 = 0x00;
    pub const WAVE_DAC: u8 = 0x0A;
    pub const WAVE_LEVEL: u8 = 0x0C;
    pub const WAVE_LO: u8 = 0x0D;
    pub const WAVE_HI: u8 = 0x0E;
    pub const NOISE_ENV: u8 = 0x11;
    pub const NOISE_POLY: u8 = 0x12;
    pub const NOISE_TRIGGER: u8 = 0x13;
    pub const MASTER_VOLUME: u8 = 0x14;
    pub const PANNING: u8 = 0x15;
    pub const POWER: u8 = 0x16;
    /// Wave RAM ($FF30–$FF3F).
    pub const WAVE_RAM: u8 = 0x20;
    pub const TRIGGER: u8 = 0x80;
}

struct Writer {
    cmd: u8,
    data: Vec<u8>,
    regs: [Option<u8>; 0x30],
    /// The waveform in Game Boy wave RAM.
    wave: Option<u8>,
    pending_wait: u64,
}

impl Writer {
    fn new(chip: ChipKind) -> Self {
        Writer {
            cmd: match chip {
                ChipKind::Nes => CMD_NES,
                ChipKind::GameBoy => CMD_GB,
            },
            data: Vec::new(),
            regs: [None; 0x30],
            wave: None,
            pending_wait: 0,
        }
    }

    fn write(&mut self, reg: u8, value: u8) {
        if self.regs[reg as usize] == Some(value) {
            return;
        }
        self.force(reg, value);
    }

    fn force(&mut self, reg: u8, value: u8) {
        self.flush_wait();
        self.data.extend_from_slice(&[self.cmd, reg, value]);
        self.regs[reg as usize] = Some(value);
    }

    /// Writes a Game Boy NRx4: with `trigger`, restarts the channel so a new envelope
    /// (volume) takes effect; otherwise only changes the frequency's high bits.
    fn gb_high(&mut self, reg: u8, high: u8, trigger: bool) {
        if trigger {
            self.force(reg, dmg::TRIGGER | high);
            self.regs[reg as usize] = Some(high);
        } else {
            self.write(reg, high);
        }
    }

    fn flush_wait(&mut self) {
        while self.pending_wait > 0 {
            let n = self.pending_wait.min(65_535);
            match n {
                735 => self.data.push(0x62),
                882 => self.data.push(0x63),
                1..=16 => self.data.push(0x70 + (n - 1) as u8),
                _ => {
                    self.data.push(0x61);
                    self.data.extend_from_slice(&(n as u16).to_le_bytes());
                }
            }
            self.pending_wait -= n;
        }
    }

    /// Forgets what's been written, so the next tick writes every register in full.
    fn invalidate(&mut self) {
        self.regs = [None; 0x30];
        self.wave = None;
    }

    fn init(&mut self, chip: ChipKind) {
        if chip == ChipKind::GameBoy {
            self.write(dmg::POWER, 0x80);
            self.write(dmg::MASTER_VOLUME, 0x77);
            self.write(dmg::PANNING, 0xFF);
            self.write(dmg::SWEEP, 0x00);
            self.write(dmg::WAVE_DAC, 0x00);
            return;
        }
        self.write(STATUS, 0x0F);
        self.write(FRAME_COUNTER, 0x40);
        // Sweep units off with negate set, so they can't silence low notes.
        self.write(0x01, 0x08);
        self.write(0x05, 0x08);
        self.write(NOISE_LENGTH, LENGTH_LOAD);
    }

    fn pulse(&mut self, i: usize, v: Option<Voice>) {
        let base = PULSE[i];
        let timer = v
            .filter(|v| v.volume > 0)
            .and_then(|v| pulse_timer(semitones_to_hz(v.semitones)));
        match (v, timer) {
            (Some(v), Some(t)) => {
                // Duty, length halt, constant volume.
                self.write(base, ((v.duty & 3) << 6) | 0x30 | v.volume.min(15));
                self.write(base + 2, (t & 0xFF) as u8);
                // Writing the high byte restarts the waveform; only do it when it changes.
                self.write(base + 3, ((t >> 8) as u8 & 0x07) | LENGTH_LOAD);
            }
            _ => {
                let duty = self.regs[base as usize].unwrap_or(0) & 0xC0;
                self.write(base, duty | 0x30);
            }
        }
    }

    fn triangle(&mut self, v: Option<Voice>) {
        let timer = v
            .filter(|v| v.volume > 0)
            .and_then(|v| triangle_timer(semitones_to_hz(v.semitones)));
        match timer {
            Some(t) => {
                self.write(TRI_LO, (t & 0xFF) as u8);
                self.write(TRI_HI, ((t >> 8) as u8 & 0x07) | LENGTH_LOAD);
                // Control flag set and a full linear counter: plays until told otherwise.
                self.write(TRI_CONTROL, 0xFF);
            }
            // A zero linear-counter reload halts the triangle at its current step.
            None => self.write(TRI_CONTROL, 0x80),
        }
    }

    fn noise(&mut self, v: Option<Voice>) {
        match v.filter(|v| v.volume > 0) {
            Some(v) => {
                self.write(
                    NOISE_PERIOD,
                    ((v.duty & 1) << 7) | noise_period(v.semitones),
                );
                self.write(NOISE_VOL, 0x30 | v.volume.min(15));
            }
            None => self.write(NOISE_VOL, 0x30),
        }
    }

    fn apply(&mut self, chip: ChipKind, voices: &[Option<Voice>; CHANNELS]) {
        match chip {
            ChipKind::Nes => {
                self.pulse(0, voices[0]);
                self.pulse(1, voices[1]);
                self.triangle(voices[2]);
                self.noise(voices[3]);
            }
            ChipKind::GameBoy => {
                self.gb_pulse(0, voices[0]);
                self.gb_pulse(1, voices[1]);
                self.gb_wave(voices[2]);
                self.gb_noise(voices[3]);
            }
        }
    }

    fn gb_pulse(&mut self, i: usize, v: Option<Voice>) {
        let base = dmg::PULSE[i];
        let freq = v
            .filter(|v| v.volume > 0)
            .and_then(|v| gb::pulse_freq(semitones_to_hz(v.semitones)));
        match (v, freq) {
            (Some(v), Some(x)) => {
                let envelope = v.volume.min(15) << 4;
                let retrigger = self.regs[(base + 1) as usize] != Some(envelope);
                self.write(base, (v.duty & 3) << 6);
                self.write(base + 1, envelope);
                self.write(base + 2, (x & 0xFF) as u8);
                self.gb_high(base + 3, (x >> 8) as u8 & 0x07, retrigger);
            }
            // An envelope of zero turns the channel's DAC off.
            _ => self.write(base + 1, 0x00),
        }
    }

    fn gb_wave(&mut self, v: Option<Voice>) {
        let level = v.map_or(0, |v| gb::wave_level(v.volume));
        let freq = v.and_then(|v| gb::wave_freq(semitones_to_hz(v.semitones)));
        match (v, freq) {
            (Some(v), Some(x)) if level > 0 => {
                let wave = v.duty & 7;
                let mut retrigger = self.regs[dmg::WAVE_DAC as usize] != Some(0x80);
                if self.wave != Some(wave) {
                    // Wave RAM is only safely writable with the channel's DAC off.
                    self.write(dmg::WAVE_DAC, 0x00);
                    for (i, pair) in gb::WAVES[wave as usize].chunks_exact(2).enumerate() {
                        self.force(dmg::WAVE_RAM + i as u8, (pair[0] << 4) | pair[1]);
                    }
                    self.wave = Some(wave);
                    retrigger = true;
                }
                self.write(dmg::WAVE_DAC, 0x80);
                self.write(dmg::WAVE_LEVEL, level << 5);
                self.write(dmg::WAVE_LO, (x & 0xFF) as u8);
                self.gb_high(dmg::WAVE_HI, (x >> 8) as u8 & 0x07, retrigger);
            }
            // Output level zero mutes the wave but leaves it running, without a click.
            _ => self.write(dmg::WAVE_LEVEL, 0x00),
        }
    }

    fn gb_noise(&mut self, v: Option<Voice>) {
        match v.filter(|v| v.volume > 0) {
            Some(v) => {
                let (divisor, shift) = gb::NOISE_SETTINGS[noise_period(v.semitones) as usize];
                let envelope = v.volume.min(15) << 4;
                let retrigger = self.regs[dmg::NOISE_ENV as usize] != Some(envelope);
                self.write(
                    dmg::NOISE_POLY,
                    (shift << 4) | ((v.duty & 1) << 3) | divisor,
                );
                self.write(dmg::NOISE_ENV, envelope);
                if retrigger {
                    self.force(dmg::NOISE_TRIGGER, dmg::TRIGGER);
                }
            }
            None => self.write(dmg::NOISE_ENV, 0x00),
        }
    }
}

/// UTF-16LE, NUL-terminated, as GD3 tags store text.
fn gd3_string(s: &str, out: &mut Vec<u8>) {
    for unit in s.encode_utf16().chain([0]) {
        out.extend_from_slice(&unit.to_le_bytes());
    }
}

/// Renders `song` once through as a VGM file, looping where the song loops.
pub fn render_vgm(song: Song, title: &str) -> Vec<u8> {
    let order_count = song.order.len();
    let chip = song.chip;
    let mut player = Player::new(song);
    player.play_from(0, 0);
    let mut w = Writer::new(chip);
    w.init(chip);

    // Byte offset and sample at which each order entry first started.
    let mut entered: Vec<Option<(usize, u64)>> = vec![None; order_count];
    let mut samples: u64 = 0;
    let mut loop_at: Option<(usize, u64)> = None;
    while samples < MAX_SAMPLES {
        if player.clock(VGM_RATE as f32) {
            if let Some(row) = player.take_row_started() {
                if player.loops() > 0 {
                    loop_at = entered[row.order];
                    break;
                }
                if row.row == 0 && entered[row.order].is_none() {
                    // A loop may come back here: start this section from a full state.
                    w.flush_wait();
                    w.invalidate();
                    entered[row.order] = Some((w.data.len(), samples));
                }
            }
            w.apply(chip, player.voices());
        }
        w.pending_wait += 1;
        samples += 1;
    }
    w.flush_wait();
    w.data.push(0x66);

    let mut gd3 = Vec::new();
    for field in [
        title,
        "",
        "",
        "",
        match chip {
            ChipKind::Nes => "Nintendo Entertainment System",
            ChipKind::GameBoy => "Nintendo Game Boy",
        },
        "",
        "",
        "",
        "",
        "ChipForge",
        "",
    ] {
        gd3_string(field, &mut gd3);
    }

    let data_len = w.data.len();
    let gd3_at = HEADER_LEN + data_len;
    let total = gd3_at + 12 + gd3.len();
    let mut out = vec![0u8; HEADER_LEN];
    let put =
        |out: &mut Vec<u8>, at: usize, v: u32| out[at..at + 4].copy_from_slice(&v.to_le_bytes());
    out[0..4].copy_from_slice(b"Vgm ");
    put(&mut out, 0x04, (total - 0x04) as u32);
    put(&mut out, 0x08, 0x0000_0161);
    put(&mut out, 0x14, (gd3_at - 0x14) as u32);
    put(&mut out, 0x18, samples as u32);
    if let Some((offset, at)) = loop_at {
        put(&mut out, 0x1C, (HEADER_LEN + offset - 0x1C) as u32);
        put(&mut out, 0x20, (samples - at) as u32);
    }
    put(&mut out, 0x34, (HEADER_LEN - 0x34) as u32);
    match chip {
        ChipKind::Nes => put(&mut out, 0x84, NES_CLOCK),
        ChipKind::GameBoy => put(&mut out, 0x80, GB_CLOCK),
    }
    out.extend_from_slice(&w.data);
    out.extend_from_slice(b"Gd3 ");
    out.extend_from_slice(&0x0100u32.to_le_bytes());
    out.extend_from_slice(&(gd3.len() as u32).to_le_bytes());
    out.extend_from_slice(&gd3);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tracker::tests::song_with;
    use crate::tracker::{Cell, Instrument, Macro};

    fn u32_at(v: &[u8], at: usize) -> u32 {
        u32::from_le_bytes(v[at..at + 4].try_into().unwrap())
    }

    /// Register writes in the data, as (register, value).
    fn writes(v: &[u8]) -> Vec<(u8, u8)> {
        let mut out = Vec::new();
        let mut i = HEADER_LEN;
        loop {
            match v[i] {
                CMD_NES | CMD_GB => {
                    out.push((v[i + 1], v[i + 2]));
                    i += 3;
                }
                0x61 => i += 3,
                0x62 | 0x63 | 0x70..=0x7F => i += 1,
                0x66 => return out,
                b => panic!("unexpected command {b:#x}"),
            }
        }
    }

    #[test]
    fn header_describes_an_nes_vgm() {
        let v = render_vgm(
            song_with(&[(0, 0, Cell::note(69, 0))], Instrument::default()),
            "Test",
        );
        assert_eq!(&v[0..4], b"Vgm ");
        assert_eq!(u32_at(&v, 0x04) as usize, v.len() - 4);
        assert_eq!(u32_at(&v, 0x08), 0x161);
        assert_eq!(u32_at(&v, 0x84), NES_CLOCK);
        // 64 rows × 6 ticks at 60 ticks/s = 6.4 s, looping from the start.
        assert_eq!(u32_at(&v, 0x18), (6.4 * VGM_RATE as f64) as u32);
        assert_eq!(u32_at(&v, 0x20), u32_at(&v, 0x18));
        // The loop starts after the one-time setup writes, on a full register state.
        let loop_at = 0x1C + u32_at(&v, 0x1C) as usize;
        assert_eq!(loop_at, HEADER_LEN + 5 * 3);
        assert_eq!(v[loop_at], 0xB4);
        let gd3 = 0x14 + u32_at(&v, 0x14) as usize;
        assert_eq!(&v[gd3..gd3 + 4], b"Gd3 ");
    }

    #[test]
    fn notes_become_hardware_timer_writes() {
        let v = render_vgm(
            song_with(
                &[(0, 0, Cell::note(69, 0)), (0, 2, Cell::note(45, 0))],
                Instrument::default(),
            ),
            "",
        );
        let w = writes(&v);
        let t = pulse_timer(440.0).unwrap();
        assert!(w.contains(&(0x02, (t & 0xFF) as u8)), "pulse timer low");
        assert!(
            w.contains(&(0x03, (t >> 8) as u8 | LENGTH_LOAD)),
            "pulse timer high"
        );
        assert!(
            w.contains(&(0x00, (2 << 6) | 0x30 | 15)),
            "50% duty, full volume"
        );
        assert!(w.contains(&(0x08, 0xFF)), "triangle on");
        assert!(w.contains(&(0x15, 0x0F)), "channels enabled");
    }

    /// Decodes with libvgm's vgm2wav, the VGM format maintainer's player, which has its
    /// own NES APU emulation. (game-music-emu's VGM reader only drives Sega chips.)
    /// Uses `VGM2WAV`, else `vgm2wav` on PATH; None if unavailable.
    fn decode_with_libvgm(vgm: &[u8]) -> Option<Vec<f32>> {
        let tool = std::env::var("VGM2WAV").unwrap_or_else(|_| "vgm2wav".into());
        // Tests run in parallel: each call gets its own directory.
        static CALLS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let call = CALLS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("chipforge-vgm-{}-{call}", std::process::id()));
        std::fs::create_dir_all(&dir).ok()?;
        let (vgm_path, wav_path) = (dir.join("song.vgm"), dir.join("song.wav"));
        std::fs::write(&vgm_path, vgm).ok()?;
        let ok = std::process::Command::new(tool)
            .arg(&vgm_path)
            .arg(&wav_path)
            .output()
            .ok()?
            .status
            .success();
        let wav = std::fs::read(&wav_path).ok();
        std::fs::remove_dir_all(&dir).ok();
        let wav = wav.filter(|_| ok)?;
        // 16-bit stereo PCM after a 44-byte header; keep the left channel.
        Some(
            wav[44..]
                .chunks_exact(4)
                .map(|f| i16::from_le_bytes([f[0], f[1]]) as f32 / 32768.0)
                .collect(),
        )
    }

    /// Pitch of 2 s of `pcm` from half a second in, by mean crossings.
    fn libvgm_hz(pcm: &[f32]) -> f32 {
        let rate = 44_100.0;
        let tail = &pcm[(0.5 * rate) as usize..(2.5 * rate) as usize];
        let mean = tail.iter().sum::<f32>() / tail.len() as f32;
        let rises = tail
            .windows(2)
            .filter(|w| w[0] < mean && w[1] >= mean)
            .count();
        rises as f32 / 2.0
    }

    fn gb_song(cells: &[(usize, usize, Cell)], instrument: Instrument) -> Song {
        Song {
            chip: ChipKind::GameBoy,
            ..song_with(cells, instrument)
        }
    }

    #[test]
    fn plays_in_an_independent_emulator_at_the_right_pitch() {
        // A held A4 on pulse 1 for the whole pattern.
        let v = render_vgm(
            song_with(&[(0, 0, Cell::note(69, 0))], Instrument::default()),
            "A4",
        );
        let Some(pcm) = decode_with_libvgm(&v) else {
            eprintln!("vgm2wav (libvgm) not available; skipping");
            return;
        };
        let hz = libvgm_hz(&pcm);
        assert!((hz - 440.0).abs() < 3.0, "libvgm plays {hz} Hz");
    }

    #[test]
    fn header_describes_a_game_boy_vgm() {
        let v = render_vgm(
            gb_song(&[(0, 0, Cell::note(69, 0))], Instrument::default()),
            "",
        );
        assert_eq!(u32_at(&v, 0x80), GB_CLOCK);
        assert_eq!(u32_at(&v, 0x84), 0, "no NES chip");
        let w = writes(&v);
        assert_eq!(w[0], (dmg::POWER, 0x80), "sound powered on first");
        let x = gb::pulse_freq(440.0).unwrap();
        assert!(w.contains(&(0x01, 2 << 6)), "50% duty");
        assert!(w.contains(&(0x02, 0xF0)), "full volume");
        assert!(w.contains(&(0x03, (x & 0xFF) as u8)));
        assert!(w.contains(&(0x04, 0x80 | (x >> 8) as u8)), "triggered");
    }

    #[test]
    fn game_boy_volume_changes_retrigger_and_waves_load_wave_ram() {
        let v = render_vgm(
            gb_song(
                &[(0, 0, Cell::note(69, 0)), (0, 2, Cell::note(57, 0))],
                Instrument {
                    volume: Macro::new(&[15, 10, 5]),
                    ..Default::default()
                },
            ),
            "",
        );
        let w = writes(&v);
        let triggers = w
            .iter()
            .filter(|&&(r, v)| r == 0x04 && v & 0x80 != 0)
            .count();
        assert_eq!(triggers, 3, "one per volume step");
        let triangle: Vec<u8> = gb::WAVES[2].chunks(2).map(|p| (p[0] << 4) | p[1]).collect();
        let ram: Vec<u8> = (0..16)
            .map(|i| w.iter().find(|(r, _)| *r == dmg::WAVE_RAM + i).unwrap().1)
            .collect();
        assert_eq!(ram, triangle);
        assert!(w.contains(&(dmg::WAVE_LEVEL, 1 << 5)), "wave at full level");
    }

    #[test]
    fn game_boy_vgm_plays_in_an_independent_emulator() {
        for (channel, note, hz) in [(0, 69, 440.0), (2, 57, 220.0)] {
            let v = render_vgm(
                gb_song(&[(0, channel, Cell::note(note, 0))], Instrument::default()),
                "",
            );
            let Some(pcm) = decode_with_libvgm(&v) else {
                eprintln!("vgm2wav (libvgm) not available; skipping");
                return;
            };
            let got = libvgm_hz(&pcm);
            assert!(
                (got - hz).abs() < 3.0,
                "channel {channel}: libvgm plays {got} Hz"
            );
        }
    }

    #[test]
    fn unchanged_registers_are_not_rewritten() {
        let v = render_vgm(
            song_with(&[(0, 0, Cell::note(69, 0))], Instrument::default()),
            "",
        );
        let w = writes(&v);
        let high_writes = w.iter().filter(|(r, _)| *r == 0x03).count();
        // Once at the start; the loop restarts from a full state, which isn't in this pass.
        assert_eq!(high_writes, 1);
    }
}
