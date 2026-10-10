//! Tracker songs: patterns of cells, an order list, instruments with per-tick macros,
//! and the sequencer that turns them into channel [`Voice`]s.
//!
//! The model follows FamiTracker closely enough that its users feel at home:
//! a song is a list of patterns played in `order`; every pattern has one column per
//! channel; each row lasts `speed` ticks; instruments are four macros (volume, duty,
//! pitch, arpeggio) stepped once per tick.
//!
//! ## Binary format (version 1, little endian)
//!
//! The web app owns songs as JSON and sends this compact form to the audio thread.
//!
//! ```text
//! header   "CFS" u8 version · u16 bpm · u8 speed · u8 rows_per_beat · u16 pattern_length
//!          u16 pattern_count · u16 order_len · u16 loop_point · u8 instrument_count · u8 0
//! order    order_len × u16 pattern index
//! instr.   instrument_count × 4 macros (volume, duty, pitch, arpeggio), each:
//!          u8 len · u8 loop (255 = none) · u8 release (255 = none) · len × i8 values
//! patterns pattern_count × pattern_length rows × 4 channels × 5-byte cells:
//!          note · instrument · volume · effect (ASCII, 0 = none) · param
//! ```

use crate::apu::Voice;

pub const CHANNELS: usize = 4;
pub const FORMAT_VERSION: u8 = 1;
const HEADER_LEN: usize = 18;
const CELL_LEN: usize = 5;

/// Cell `note` values besides MIDI notes 0..=127.
pub const NOTE_NONE: u8 = 255;
/// Stops the note immediately ("---" in the tracker).
pub const NOTE_OFF: u8 = 254;
/// Lets the instrument play its release ("===" in the tracker).
pub const NOTE_RELEASE: u8 = 253;
/// Cell `instrument` and `volume` value meaning "unchanged".
pub const NONE: u8 = 255;

pub const MAX_INSTRUMENTS: usize = 64;
pub const MAX_PATTERN_LENGTH: u16 = 256;

/// One step of a tracker pattern.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Cell {
    pub note: u8,
    pub instrument: u8,
    pub volume: u8,
    /// Effect command letter (`b'0'`, `b'1'`, … `b'V'`), or 0 for none.
    pub effect: u8,
    pub param: u8,
}

impl Cell {
    pub const EMPTY: Cell = Cell {
        note: NOTE_NONE,
        instrument: NONE,
        volume: NONE,
        effect: 0,
        param: 0,
    };

    pub fn note(note: u8, instrument: u8) -> Self {
        Cell {
            note,
            instrument,
            ..Cell::EMPTY
        }
    }
}

/// A per-tick sequence. Without a loop the last value holds; with a release point the
/// sequence waits there (looping if the loop is before it) until the note is released.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Macro {
    pub values: Vec<i8>,
    pub loop_at: Option<u8>,
    pub release_at: Option<u8>,
}

impl Macro {
    pub fn new(values: &[i8]) -> Self {
        Macro {
            values: values.to_vec(),
            loop_at: None,
            release_at: None,
        }
    }

    /// Index of the step after `pos`.
    fn next(&self, pos: usize, released: bool) -> usize {
        let len = self.values.len();
        let release = self.release_at.map(usize::from).filter(|&r| r < len);
        let looping = self.loop_at.map(usize::from).filter(|&l| l < len);
        if let (Some(r), false) = (release, released)
            && pos >= r
        {
            // Hold at the release point, or loop back to the loop point before it.
            return match looping {
                Some(l) if l <= r => l,
                _ => r,
            };
        }
        if pos + 1 < len {
            return pos + 1;
        }
        match looping {
            // After release, only a loop that lies beyond the release point continues.
            Some(l) if !released || release.is_none_or(|r| l > r) => l,
            _ => len.saturating_sub(1),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Instrument {
    /// 0..=15 per tick; empty means full volume.
    pub volume: Macro,
    /// Pulse duty index 0..=3 (noise: 1 = metallic); empty means 50% / normal noise.
    pub duty: Macro,
    /// Relative pitch change per tick in 1/16 semitones, accumulated.
    pub pitch: Macro,
    /// Absolute semitone offset per tick (chords, drum pitch drops).
    pub arpeggio: Macro,
}

impl Instrument {
    fn macros(&self) -> [&Macro; 4] {
        [&self.volume, &self.duty, &self.pitch, &self.arpeggio]
    }

    /// Whether releasing a note lets something play out, rather than cutting it.
    fn has_release(&self) -> bool {
        self.volume
            .release_at
            .is_some_and(|r| (r as usize) < self.volume.values.len())
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Song {
    pub bpm: u16,
    /// Ticks per row.
    pub speed: u8,
    pub rows_per_beat: u8,
    pub pattern_length: u16,
    /// Pattern indices in play order.
    pub order: Vec<u16>,
    /// Order index the song returns to after the last entry.
    pub loop_point: u16,
    pub instruments: Vec<Instrument>,
    /// `patterns[p][row][channel]`.
    pub patterns: Vec<Vec<[Cell; CHANNELS]>>,
}

impl Default for Song {
    fn default() -> Self {
        Song {
            bpm: 150,
            speed: 6,
            rows_per_beat: 4,
            pattern_length: 64,
            order: vec![0],
            loop_point: 0,
            instruments: vec![Instrument::default()],
            patterns: vec![vec![[Cell::EMPTY; CHANNELS]; 64]],
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DecodeError {
    BadMagic,
    UnsupportedVersion(u8),
    Truncated,
    /// A header field is out of range.
    BadHeader(&'static str),
    /// An order entry points at a pattern that doesn't exist.
    BadOrder(usize),
}

struct Reader<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl Reader<'_> {
    fn take(&mut self, n: usize) -> Result<&[u8], DecodeError> {
        let end = self.pos.checked_add(n).ok_or(DecodeError::Truncated)?;
        let slice = self
            .bytes
            .get(self.pos..end)
            .ok_or(DecodeError::Truncated)?;
        self.pos = end;
        Ok(slice)
    }

    fn u8(&mut self) -> Result<u8, DecodeError> {
        Ok(self.take(1)?[0])
    }

    fn u16(&mut self) -> Result<u16, DecodeError> {
        let b = self.take(2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }

    fn opt(&mut self) -> Result<Option<u8>, DecodeError> {
        Ok(Some(self.u8()?).filter(|&v| v != 255))
    }
}

impl Song {
    pub fn decode(bytes: &[u8]) -> Result<Song, DecodeError> {
        let mut r = Reader { bytes, pos: 0 };
        if r.take(3)? != b"CFS" {
            return Err(DecodeError::BadMagic);
        }
        let version = r.u8()?;
        if version != FORMAT_VERSION {
            return Err(DecodeError::UnsupportedVersion(version));
        }
        let bpm = r.u16()?;
        let speed = r.u8()?;
        let rows_per_beat = r.u8()?;
        let pattern_length = r.u16()?;
        let pattern_count = r.u16()? as usize;
        let order_len = r.u16()? as usize;
        let loop_point = r.u16()?;
        let instrument_count = r.u8()? as usize;
        r.u8()?;

        if !(30..=300).contains(&bpm) {
            return Err(DecodeError::BadHeader("bpm"));
        }
        if !(1..=31).contains(&speed) {
            return Err(DecodeError::BadHeader("speed"));
        }
        if rows_per_beat == 0 {
            return Err(DecodeError::BadHeader("rows_per_beat"));
        }
        if !(1..=MAX_PATTERN_LENGTH).contains(&pattern_length) {
            return Err(DecodeError::BadHeader("pattern_length"));
        }
        if pattern_count == 0 || order_len == 0 || loop_point as usize >= order_len {
            return Err(DecodeError::BadHeader("order"));
        }
        if instrument_count > MAX_INSTRUMENTS {
            return Err(DecodeError::BadHeader("instrument_count"));
        }

        let mut order = Vec::with_capacity(order_len);
        for i in 0..order_len {
            let p = r.u16()?;
            if p as usize >= pattern_count {
                return Err(DecodeError::BadOrder(i));
            }
            order.push(p);
        }

        let mut instruments = Vec::with_capacity(instrument_count);
        for _ in 0..instrument_count {
            let mut macros: [Macro; 4] = Default::default();
            for m in &mut macros {
                let len = r.u8()? as usize;
                m.loop_at = r.opt()?;
                m.release_at = r.opt()?;
                m.values = r.take(len)?.iter().map(|&b| b as i8).collect();
            }
            let [volume, duty, pitch, arpeggio] = macros;
            instruments.push(Instrument {
                volume,
                duty,
                pitch,
                arpeggio,
            });
        }

        let rows = pattern_length as usize;
        let pattern_bytes = r.take(pattern_count * rows * CHANNELS * CELL_LEN)?;
        let patterns = pattern_bytes
            .chunks_exact(rows * CHANNELS * CELL_LEN)
            .map(|pattern| {
                pattern
                    .chunks_exact(CHANNELS * CELL_LEN)
                    .map(|row| {
                        std::array::from_fn(|ch| {
                            let c = &row[ch * CELL_LEN..(ch + 1) * CELL_LEN];
                            Cell {
                                note: c[0],
                                instrument: c[1],
                                volume: c[2],
                                effect: c[3],
                                param: c[4],
                            }
                        })
                    })
                    .collect()
            })
            .collect();

        Ok(Song {
            bpm,
            speed,
            rows_per_beat,
            pattern_length,
            order,
            loop_point,
            instruments,
            patterns,
        })
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(b"CFS");
        out.push(FORMAT_VERSION);
        out.extend_from_slice(&self.bpm.to_le_bytes());
        out.push(self.speed);
        out.push(self.rows_per_beat);
        out.extend_from_slice(&self.pattern_length.to_le_bytes());
        out.extend_from_slice(&(self.patterns.len() as u16).to_le_bytes());
        out.extend_from_slice(&(self.order.len() as u16).to_le_bytes());
        out.extend_from_slice(&self.loop_point.to_le_bytes());
        out.push(self.instruments.len() as u8);
        out.push(0);
        debug_assert_eq!(out.len(), HEADER_LEN);
        for p in &self.order {
            out.extend_from_slice(&p.to_le_bytes());
        }
        for inst in &self.instruments {
            for m in inst.macros() {
                out.push(m.values.len() as u8);
                out.push(m.loop_at.unwrap_or(255));
                out.push(m.release_at.unwrap_or(255));
                out.extend(m.values.iter().map(|&v| v as u8));
            }
        }
        for pattern in &self.patterns {
            for row in pattern {
                for c in row {
                    out.extend_from_slice(&[c.note, c.instrument, c.volume, c.effect, c.param]);
                }
            }
        }
        out
    }

    /// Ticks per second: BPM × rows per beat × ticks per row / 60.
    pub fn tick_rate(&self, speed: u8, bpm: u16) -> f64 {
        bpm as f64 * self.rows_per_beat as f64 * speed as f64 / 60.0
    }
}

/// Everything one channel remembers between ticks.
#[derive(Clone, Debug)]
struct ChannelState {
    active: bool,
    released: bool,
    instrument: usize,
    /// Channel volume from the volume column, 0..=15 (fractional during volume slides).
    volume: f32,
    /// Current base pitch; moves toward `porta_target` during portamento.
    pitch: f32,
    porta_target: Option<f32>,
    porta_speed: f32,
    /// Macro positions: volume, duty, pitch, arpeggio.
    pos: [usize; 4],
    pitch_macro_offset: f32,
    slide_speed: f32,
    slide_offset: f32,
    arpeggio: (u8, u8),
    arp_step: u8,
    vibrato: (u8, u8),
    vib_phase: f32,
    volume_slide: f32,
    cut_at_tick: Option<u8>,
    duty_override: Option<u8>,
}

impl Default for ChannelState {
    fn default() -> Self {
        ChannelState {
            active: false,
            released: false,
            instrument: 0,
            volume: 15.0,
            pitch: 60.0,
            porta_target: None,
            porta_speed: 0.0,
            pos: [0; 4],
            pitch_macro_offset: 0.0,
            slide_speed: 0.0,
            slide_offset: 0.0,
            arpeggio: (0, 0),
            arp_step: 0,
            vibrato: (0, 0),
            vib_phase: 0.0,
            volume_slide: 0.0,
            cut_at_tick: None,
            duty_override: None,
        }
    }
}

impl ChannelState {
    fn trigger(&mut self, note: u8) {
        self.active = true;
        self.released = false;
        self.pitch = note as f32;
        self.porta_target = None;
        self.pos = [0; 4];
        self.pitch_macro_offset = 0.0;
        self.slide_offset = 0.0;
        self.arp_step = 0;
        self.vib_phase = 0.0;
    }

    fn release(&mut self, instruments: &[Instrument]) {
        let Some(inst) = instruments.get(self.instrument) else {
            self.active = false;
            return;
        };
        if !inst.has_release() {
            self.active = false;
            return;
        }
        self.released = true;
        for (pos, m) in self.pos.iter_mut().zip(inst.macros()) {
            if let Some(r) = m
                .release_at
                .map(usize::from)
                .filter(|&r| r < m.values.len())
            {
                *pos = (r + 1).min(m.values.len() - 1);
            }
        }
    }

    /// Applies one cell at the start of its row. Flow-control effects (B, D, F) are
    /// handled by the [`Player`].
    fn apply_cell(&mut self, cell: Cell, instruments: &[Instrument]) {
        if cell.instrument != NONE {
            self.instrument = cell.instrument as usize;
        }
        if cell.volume != NONE {
            self.volume = (cell.volume.min(15)) as f32;
        }
        self.cut_at_tick = None;
        let p = cell.param;
        match cell.effect {
            b'0' => self.arpeggio = (p >> 4, p & 15),
            b'1' => self.slide_speed = p as f32 / 16.0,
            b'2' => self.slide_speed = -(p as f32) / 16.0,
            b'3' => self.porta_speed = p as f32 / 16.0,
            b'4' => self.vibrato = (p >> 4, p & 15),
            b'A' => self.volume_slide = ((p >> 4) as f32 - (p & 15) as f32) / 8.0,
            b'S' => self.cut_at_tick = Some(p),
            b'V' => self.duty_override = Some(p & 3),
            _ => {}
        }
        match cell.note {
            NOTE_NONE => {}
            NOTE_OFF => self.active = false,
            NOTE_RELEASE => self.release(instruments),
            n if n <= 127 => {
                if self.porta_speed > 0.0 && self.active {
                    self.porta_target = Some(n as f32);
                    self.released = false;
                } else {
                    self.trigger(n);
                }
            }
            _ => {}
        }
    }

    /// Advances macros and effects by one tick and returns what the channel plays.
    fn tick(&mut self, tick_in_row: u32, instruments: &[Instrument]) -> Option<Voice> {
        if self.cut_at_tick.is_some_and(|t| tick_in_row >= t as u32) {
            self.active = false;
            self.cut_at_tick = None;
        }
        if !self.active {
            return None;
        }
        let empty = Instrument::default();
        let inst = instruments.get(self.instrument).unwrap_or(&empty);
        let [vol_m, duty_m, pitch_m, arp_m] = inst.macros();
        let value = |m: &Macro, pos: usize| m.values.get(pos).copied();

        let macro_volume = value(vol_m, self.pos[0]).map_or(15.0, |v| v.clamp(0, 15) as f32);
        let duty = self
            .duty_override
            .or(value(duty_m, self.pos[1]).map(|d| (d & 3) as u8))
            .unwrap_or(2);
        self.pitch_macro_offset += value(pitch_m, self.pos[2]).unwrap_or(0) as f32 / 16.0;
        let arp_macro = value(arp_m, self.pos[3]).unwrap_or(0) as f32;

        if let Some(target) = self.porta_target {
            let step = self.porta_speed;
            if (target - self.pitch).abs() <= step {
                self.pitch = target;
                self.porta_target = None;
            } else {
                self.pitch += step.copysign(target - self.pitch);
            }
        }
        if tick_in_row > 0 {
            self.slide_offset += self.slide_speed;
        }
        let arp_effect = if self.arpeggio == (0, 0) {
            0.0
        } else {
            let offset = [0, self.arpeggio.0, self.arpeggio.1][self.arp_step as usize % 3];
            self.arp_step = self.arp_step.wrapping_add(1);
            offset as f32
        };
        let vibrato = if self.vibrato.1 > 0 {
            self.vib_phase = (self.vib_phase + self.vibrato.0 as f32 / 64.0) % 1.0;
            (self.vib_phase * std::f32::consts::TAU).sin() * self.vibrato.1 as f32 / 8.0
        } else {
            0.0
        };
        if self.volume_slide != 0.0 && tick_in_row > 0 {
            self.volume = (self.volume + self.volume_slide).clamp(0.0, 15.0);
        }

        let volume = (macro_volume * self.volume.round() / 15.0).round() as u8;
        let semitones = self.pitch
            + arp_macro
            + arp_effect
            + self.pitch_macro_offset
            + self.slide_offset
            + vibrato;

        for (pos, m) in self.pos.iter_mut().zip([vol_m, duty_m, pitch_m, arp_m]) {
            if !m.values.is_empty() {
                *pos = m.next(*pos, self.released);
            }
        }
        Some(Voice {
            semitones,
            volume,
            duty,
        })
    }
}

/// Where the sequencer is.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Position {
    pub order: usize,
    pub row: usize,
}

/// Plays a [`Song`]. Ticks run even when stopped so previewed notes keep their macros.
#[derive(Clone, Debug)]
pub struct Player {
    song: Song,
    playing: bool,
    loop_pattern: bool,
    order: usize,
    row: usize,
    tick: u32,
    speed: u8,
    bpm: u16,
    samples_to_tick: f64,
    channels: [ChannelState; CHANNELS],
    voices: [Option<Voice>; CHANNELS],
    pending_jump: Option<Position>,
    /// Times the song has wrapped back (end of order or a backward jump), counted when
    /// the first row after the wrap starts playing.
    loops: u32,
    pending_loop: bool,
    /// Set when a row starts playing; see [`Player::take_row_started`].
    row_started: Option<Position>,
    /// Multiplies the tempo (adaptive music: speed up when things get tense).
    tempo_scale: f64,
    /// Stop at the end of the song instead of looping (jingles, stingers).
    play_once: bool,
    /// Set when a play-once song reaches its end; see [`Player::take_finished`].
    finished: bool,
    /// Order entry to switch to when the current pattern ends.
    queued: Option<usize>,
}

impl Default for Player {
    fn default() -> Self {
        Player::new(Song::default())
    }
}

impl Player {
    pub fn new(song: Song) -> Self {
        let (speed, bpm) = (song.speed, song.bpm);
        Player {
            song,
            playing: false,
            loop_pattern: false,
            order: 0,
            row: 0,
            tick: 0,
            speed,
            bpm,
            samples_to_tick: 0.0,
            channels: Default::default(),
            voices: [None; CHANNELS],
            pending_jump: None,
            loops: 0,
            pending_loop: false,
            row_started: None,
            tempo_scale: 1.0,
            play_once: false,
            finished: false,
            queued: None,
        }
    }

    pub fn song(&self) -> &Song {
        &self.song
    }

    /// Swaps in an edited song, keeping the playback position where it still exists.
    pub fn replace_song(&mut self, song: Song) {
        if self.speed == self.song.speed {
            self.speed = song.speed;
        }
        if self.bpm == self.song.bpm {
            self.bpm = song.bpm;
        }
        self.song = song;
        self.order = self.order.min(self.song.order.len() - 1);
        self.row = self.row.min(self.song.pattern_length as usize - 1);
        if self
            .pending_jump
            .is_some_and(|p| p.order >= self.song.order.len())
        {
            self.pending_jump = None;
        }
    }

    pub fn play_from(&mut self, order: usize, row: usize) {
        self.order = order.min(self.song.order.len() - 1);
        self.row = row.min(self.song.pattern_length as usize - 1);
        self.tick = 0;
        self.samples_to_tick = 0.0;
        self.speed = self.song.speed;
        self.bpm = self.song.bpm;
        self.pending_jump = None;
        self.loops = 0;
        self.pending_loop = false;
        self.row_started = None;
        self.finished = false;
        self.queued = None;
        self.channels = Default::default();
        self.playing = true;
    }

    /// Scales the tempo, 0.25×–4×, without changing the song.
    pub fn set_tempo_scale(&mut self, scale: f64) {
        self.tempo_scale = if scale.is_finite() {
            scale.clamp(0.25, 4.0)
        } else {
            1.0
        };
    }

    pub fn tempo_scale(&self) -> f64 {
        self.tempo_scale
    }

    /// With `on`, the song stops at its end (letting notes release) instead of looping.
    pub fn set_play_once(&mut self, on: bool) {
        self.play_once = on;
    }

    /// True once after a play-once song has ended.
    pub fn take_finished(&mut self) -> bool {
        std::mem::take(&mut self.finished)
    }

    /// Switches to order entry `order` when the current pattern ends, so music changes
    /// section on a bar line instead of mid-phrase. Replaces any earlier request.
    pub fn queue_order(&mut self, order: usize) {
        self.queued = Some(order.min(self.song.order.len() - 1));
    }

    pub fn queued_order(&self) -> Option<usize> {
        self.queued
    }

    pub fn stop(&mut self) {
        self.playing = false;
        for ch in &mut self.channels {
            ch.active = false;
        }
    }

    pub fn is_playing(&self) -> bool {
        self.playing
    }

    pub fn set_loop_pattern(&mut self, on: bool) {
        self.loop_pattern = on;
    }

    pub fn position(&self) -> Option<Position> {
        self.playing.then_some(Position {
            order: self.order,
            row: self.row,
        })
    }

    pub fn loops(&self) -> u32 {
        self.loops
    }

    /// The row that started on the most recent tick, if any. Exact to the sample,
    /// unlike [`Self::position`], which moves on at the end of a row's last tick.
    pub fn take_row_started(&mut self) -> Option<Position> {
        self.row_started.take()
    }

    pub fn voices(&self) -> &[Option<Voice>; CHANNELS] {
        &self.voices
    }

    /// Plays a note on one channel outside the song (keyboard preview).
    pub fn preview(&mut self, channel: usize, note: u8, instrument: u8) {
        if let Some(ch) = self.channels.get_mut(channel) {
            ch.apply_cell(Cell::note(note, instrument), &self.song.instruments);
        }
    }

    pub fn preview_off(&mut self, channel: usize) {
        if let Some(ch) = self.channels.get_mut(channel) {
            ch.release(&self.song.instruments);
        }
    }

    /// Advances one sample. Returns true when a tick ran and [`Self::voices`] changed.
    pub fn clock(&mut self, sample_rate: f32) -> bool {
        let ticked = self.samples_to_tick <= 0.0;
        if ticked {
            self.samples_to_tick +=
                sample_rate as f64 / (self.song.tick_rate(self.speed, self.bpm) * self.tempo_scale);
            self.run_tick();
        }
        self.samples_to_tick -= 1.0;
        ticked
    }

    fn run_tick(&mut self) {
        if self.playing && self.tick == 0 {
            self.process_row();
        }
        for (ch, voice) in self.channels.iter_mut().zip(self.voices.iter_mut()) {
            *voice = ch.tick(self.tick, &self.song.instruments);
        }
        if self.playing {
            self.tick += 1;
            if self.tick >= self.speed as u32 {
                self.tick = 0;
                self.advance_row();
            }
        } else {
            // Preview notes still need tick-relative effects like note cut to work.
            self.tick = (self.tick + 1) % self.speed.max(1) as u32;
        }
    }

    fn process_row(&mut self) {
        if std::mem::take(&mut self.pending_loop) {
            if self.play_once {
                self.end();
                return;
            }
            self.loops += 1;
        }
        self.row_started = Some(Position {
            order: self.order,
            row: self.row,
        });
        let pattern = self.song.order[self.order] as usize;
        let cells = self.song.patterns[pattern][self.row];
        for (ch, cell) in self.channels.iter_mut().zip(cells) {
            ch.apply_cell(cell, &self.song.instruments);
            let p = cell.param as usize;
            match cell.effect {
                b'B' if !self.loop_pattern => {
                    let order = p.min(self.song.order.len() - 1);
                    self.pending_jump = Some(Position { order, row: 0 });
                }
                b'D' if !self.loop_pattern => {
                    let next = self.order + 1;
                    let order = if next >= self.song.order.len() {
                        self.song.loop_point as usize
                    } else {
                        next
                    };
                    let row = p.min(self.song.pattern_length as usize - 1);
                    self.pending_jump = Some(Position { order, row });
                }
                b'F' if p > 0 && p < 0x20 => self.speed = p as u8,
                b'F' if p >= 0x20 => self.bpm = (p as u16).max(30),
                _ => {}
            }
        }
    }

    /// Ends a play-once song: notes play their release, then the player stops.
    fn end(&mut self) {
        self.playing = false;
        self.finished = true;
        for ch in &mut self.channels {
            ch.release(&self.song.instruments);
        }
    }

    fn advance_row(&mut self) {
        if let Some(jump) = self.pending_jump.take() {
            if jump.order <= self.order {
                self.pending_loop = true;
            }
            self.order = jump.order;
            self.row = jump.row;
            return;
        }
        self.row += 1;
        if self.row < self.song.pattern_length as usize {
            return;
        }
        self.row = 0;
        if let Some(order) = self.queued.take() {
            self.order = order;
            return;
        }
        if self.loop_pattern {
            return;
        }
        self.order += 1;
        if self.order >= self.song.order.len() {
            self.order = self.song.loop_point as usize;
            self.pending_loop = true;
        }
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    const SR: f32 = 48_000.0;

    /// A song with one instrument per test, cells set by `(row, channel, cell)`.
    pub fn song_with(cells: &[(usize, usize, Cell)], instrument: Instrument) -> Song {
        let mut song = Song {
            instruments: vec![instrument],
            ..Song::default()
        };
        for &(row, ch, cell) in cells {
            song.patterns[0][row][ch] = cell;
        }
        song
    }

    fn fx(note: u8, effect: u8, param: u8) -> Cell {
        Cell {
            effect,
            param,
            ..Cell::note(note, 0)
        }
    }

    /// Runs `ticks` ticks and returns channel 0's voice after each.
    fn ticks(player: &mut Player, n: usize) -> Vec<Option<Voice>> {
        (0..n)
            .map(|_| {
                player.run_tick();
                player.voices()[0]
            })
            .collect()
    }

    fn started(song: Song) -> Player {
        let mut p = Player::new(song);
        p.play_from(0, 0);
        p
    }

    #[test]
    fn encode_decode_round_trips() {
        let mut inst = Instrument {
            volume: Macro {
                values: vec![15, 12, 8, 4],
                loop_at: Some(2),
                release_at: Some(3),
            },
            ..Default::default()
        };
        inst.arpeggio = Macro::new(&[0, 4, 7]);
        inst.pitch = Macro::new(&[-3, 2]);
        let mut song = song_with(
            &[
                (0, 0, fx(60, b'4', 0x37)),
                (5, 3, Cell::note(NOTE_OFF, NONE)),
            ],
            inst,
        );
        song.patterns.push(vec![[Cell::EMPTY; CHANNELS]; 64]);
        song.order = vec![0, 1, 1, 0];
        song.loop_point = 1;
        let bytes = song.encode();
        assert_eq!(Song::decode(&bytes), Ok(song));
    }

    #[test]
    fn decode_rejects_bad_input() {
        let good = Song::default().encode();
        assert_eq!(Song::decode(b"XYZ\x01"), Err(DecodeError::BadMagic));
        assert_eq!(
            Song::decode(&good[..good.len() - 1]),
            Err(DecodeError::Truncated)
        );
        let mut v2 = good.clone();
        v2[3] = 2;
        assert_eq!(Song::decode(&v2), Err(DecodeError::UnsupportedVersion(2)));
        let mut bad_order = good.clone();
        bad_order[HEADER_LEN] = 9;
        assert_eq!(Song::decode(&bad_order), Err(DecodeError::BadOrder(0)));
        let mut bad_speed = good;
        bad_speed[6] = 0;
        assert_eq!(
            Song::decode(&bad_speed),
            Err(DecodeError::BadHeader("speed"))
        );
    }

    #[test]
    fn rows_last_speed_ticks_at_the_song_tempo() {
        // 150 BPM × 4 rows/beat × 6 ticks/row = 60 ticks/s → 800 samples per tick.
        let mut p = started(Song::default());
        let mut ticks_run = 0;
        for _ in 0..800 * 6 * 3 {
            ticks_run += p.clock(SR) as usize;
        }
        assert_eq!(ticks_run, 18);
        assert_eq!(p.position(), Some(Position { order: 0, row: 3 }));
    }

    #[test]
    fn notes_start_and_stop() {
        let song = song_with(
            &[
                (0, 0, Cell::note(60, 0)),
                (1, 0, Cell::note(NOTE_OFF, NONE)),
            ],
            Instrument::default(),
        );
        let v = ticks(&mut started(song), 7);
        assert_eq!(
            v[0],
            Some(Voice {
                semitones: 60.0,
                volume: 15,
                duty: 2
            })
        );
        assert!(v[5].is_some());
        assert_eq!(v[6], None);
    }

    #[test]
    fn volume_macro_and_column_combine() {
        let inst = Instrument {
            volume: Macro::new(&[15, 10, 5, 0]),
            ..Default::default()
        };
        let cell = Cell {
            volume: 8,
            ..Cell::note(60, 0)
        };
        let v = ticks(&mut started(song_with(&[(0, 0, cell)], inst)), 5);
        let vols: Vec<u8> = v.iter().map(|v| v.unwrap().volume).collect();
        assert_eq!(vols, [8, 5, 3, 0, 0]);
    }

    #[test]
    fn macros_loop_and_hold() {
        let looping = Macro {
            values: vec![1, 2, 3],
            loop_at: Some(1),
            release_at: None,
        };
        let steps: Vec<usize> = (0..6)
            .scan(0, |pos, _| {
                Some(std::mem::replace(pos, looping.next(*pos, false)))
            })
            .collect();
        assert_eq!(steps, [0, 1, 2, 1, 2, 1]);
        let hold = Macro::new(&[1, 2]);
        assert_eq!(hold.next(1, false), 1);
    }

    #[test]
    fn release_plays_the_tail_of_the_volume_macro() {
        let inst = Instrument {
            volume: Macro {
                values: vec![15, 12, 6, 2],
                loop_at: None,
                release_at: Some(1),
            },
            ..Default::default()
        };
        let song = song_with(
            &[
                (0, 0, Cell::note(60, 0)),
                (1, 0, Cell::note(NOTE_RELEASE, NONE)),
            ],
            inst,
        );
        let vols: Vec<u8> = ticks(&mut started(song), 9)
            .iter()
            .map(|v| v.map_or(0, |v| v.volume))
            .collect();
        // Holds at the release point (12) until row 1, then plays 6, 2 and holds.
        assert_eq!(vols, [15, 12, 12, 12, 12, 12, 6, 2, 2]);
    }

    #[test]
    fn release_without_release_point_cuts() {
        let song = song_with(
            &[
                (0, 0, Cell::note(60, 0)),
                (1, 0, Cell::note(NOTE_RELEASE, NONE)),
            ],
            Instrument::default(),
        );
        assert_eq!(ticks(&mut started(song), 7)[6], None);
    }

    #[test]
    fn arpeggio_effect_cycles_chord_tones() {
        let v = ticks(
            &mut started(song_with(
                &[(0, 0, fx(60, b'0', 0x47))],
                Instrument::default(),
            )),
            4,
        );
        let notes: Vec<f32> = v.iter().map(|v| v.unwrap().semitones).collect();
        assert_eq!(notes, [60.0, 64.0, 67.0, 60.0]);
    }

    #[test]
    fn arpeggio_macro_offsets_pitch() {
        let inst = Instrument {
            arpeggio: Macro::new(&[0, 12, 0]),
            ..Default::default()
        };
        let v = ticks(
            &mut started(song_with(&[(0, 0, Cell::note(48, 0))], inst)),
            3,
        );
        let notes: Vec<f32> = v.iter().map(|v| v.unwrap().semitones).collect();
        assert_eq!(notes, [48.0, 60.0, 48.0]);
    }

    #[test]
    fn slide_up_moves_a_semitone_per_tick_at_10() {
        let v = ticks(
            &mut started(song_with(
                &[(0, 0, fx(60, b'1', 0x10))],
                Instrument::default(),
            )),
            4,
        );
        let notes: Vec<f32> = v.iter().map(|v| v.unwrap().semitones).collect();
        assert_eq!(notes, [60.0, 61.0, 62.0, 63.0]);
    }

    #[test]
    fn portamento_glides_without_retriggering() {
        let inst = Instrument {
            volume: Macro::new(&[15, 14, 13, 12, 11, 10, 9, 8, 7, 6]),
            ..Default::default()
        };
        let song = song_with(
            &[(0, 0, fx(60, b'3', 0x20)), (1, 0, Cell::note(64, NONE))],
            inst,
        );
        let v = ticks(&mut started(song), 9);
        let notes: Vec<f32> = v[6..].iter().map(|v| v.unwrap().semitones).collect();
        assert_eq!(notes, [62.0, 64.0, 64.0]);
        // The volume macro kept running: no retrigger.
        assert_eq!(v[6].unwrap().volume, 9);
    }

    #[test]
    fn volume_slide_fades() {
        let v = ticks(
            &mut started(song_with(
                &[(0, 0, fx(60, b'A', 0x08))],
                Instrument::default(),
            )),
            4,
        );
        let vols: Vec<u8> = v.iter().map(|v| v.unwrap().volume).collect();
        assert_eq!(vols, [15, 14, 13, 12]);
    }

    #[test]
    fn note_cut_after_ticks() {
        let v = ticks(
            &mut started(song_with(&[(0, 0, fx(60, b'S', 2))], Instrument::default())),
            3,
        );
        assert!(v[1].is_some());
        assert_eq!(v[2], None);
    }

    #[test]
    fn duty_effect_overrides_macro() {
        let inst = Instrument {
            duty: Macro::new(&[0]),
            ..Default::default()
        };
        let v = ticks(&mut started(song_with(&[(0, 0, fx(60, b'V', 3))], inst)), 1);
        assert_eq!(v[0].unwrap().duty, 3);
    }

    #[test]
    fn speed_and_tempo_effects() {
        let mut song = song_with(&[(0, 1, fx(NOTE_NONE, b'F', 2))], Instrument::default());
        song.patterns[0][0][2] = fx(NOTE_NONE, b'F', 0x78);
        let mut p = started(song);
        ticks(&mut p, 4);
        assert_eq!(p.position().unwrap().row, 2);
        assert_eq!(p.bpm, 120);
    }

    #[test]
    fn song_end_loops_to_the_loop_point() {
        let mut song = Song {
            pattern_length: 2,
            ..Song::default()
        };
        song.patterns = vec![vec![[Cell::EMPTY; CHANNELS]; 2]; 2];
        song.order = vec![0, 1];
        song.loop_point = 1;
        let mut p = started(song);
        ticks(&mut p, 6 * 4);
        assert_eq!(p.position(), Some(Position { order: 1, row: 0 }));
        assert_eq!(p.loops(), 0, "counted once the looped row plays");
        ticks(&mut p, 1);
        assert_eq!(p.loops(), 1);
        assert_eq!(p.take_row_started(), Some(Position { order: 1, row: 0 }));
    }

    #[test]
    fn jump_and_break_effects() {
        let mut song = Song {
            pattern_length: 4,
            ..Song::default()
        };
        song.patterns = vec![vec![[Cell::EMPTY; CHANNELS]; 4]; 3];
        song.order = vec![0, 1, 2];
        song.patterns[0][0][3] = fx(NOTE_NONE, b'D', 2);
        song.patterns[1][2][3] = fx(NOTE_NONE, b'B', 0);
        let mut p = started(song);
        ticks(&mut p, 6);
        assert_eq!(p.position(), Some(Position { order: 1, row: 2 }));
        ticks(&mut p, 7);
        assert_eq!(p.position(), Some(Position { order: 0, row: 0 }));
        assert_eq!(p.loops(), 1);
    }

    #[test]
    fn loop_pattern_repeats_and_ignores_jumps() {
        let mut song = Song {
            pattern_length: 2,
            ..Song::default()
        };
        song.patterns = vec![vec![[Cell::EMPTY; CHANNELS]; 2]; 2];
        song.order = vec![0, 1];
        song.patterns[0][0][0] = fx(NOTE_NONE, b'B', 1);
        let mut p = started(song);
        p.set_loop_pattern(true);
        ticks(&mut p, 6 * 3);
        assert_eq!(p.position(), Some(Position { order: 0, row: 1 }));
    }

    #[test]
    fn preview_plays_while_stopped() {
        let mut p = Player::default();
        p.preview(1, 72, 0);
        p.run_tick();
        assert_eq!(p.voices()[1].map(|v| v.semitones), Some(72.0));
        p.preview_off(1);
        p.run_tick();
        assert_eq!(p.voices()[1], None);
    }

    fn two_patterns(len: u16) -> Song {
        let mut song = Song {
            pattern_length: len,
            ..Song::default()
        };
        song.patterns = vec![vec![[Cell::EMPTY; CHANNELS]; len as usize]; 3];
        song.order = vec![0, 1, 2];
        song
    }

    #[test]
    fn tempo_scale_speeds_up_ticks() {
        let mut p = started(Song::default());
        p.set_tempo_scale(2.0);
        let ticks_run: usize = (0..800 * 6).map(|_| p.clock(SR) as usize).sum();
        // 60 ticks/s doubled: 800 samples now hold two ticks.
        assert_eq!(ticks_run, 12);
        p.set_tempo_scale(f64::NAN);
        assert_eq!(p.tempo_scale(), 1.0);
        p.set_tempo_scale(100.0);
        assert_eq!(p.tempo_scale(), 4.0);
    }

    #[test]
    fn play_once_stops_at_the_end_and_reports_it() {
        let mut song = two_patterns(2);
        song.order = vec![0];
        song.patterns[0][0][0] = Cell::note(60, 0);
        let mut p = started(song);
        p.set_play_once(true);
        ticks(&mut p, 12);
        assert!(p.is_playing());
        assert!(!p.take_finished());
        ticks(&mut p, 1);
        assert!(!p.is_playing());
        assert!(p.take_finished());
        assert!(!p.take_finished(), "reported once");
        assert_eq!(p.loops(), 0);
    }

    #[test]
    fn queued_order_switches_at_the_end_of_the_pattern() {
        let mut p = started(two_patterns(4));
        ticks(&mut p, 6);
        p.queue_order(2);
        ticks(&mut p, 6 * 2);
        assert_eq!(
            p.position(),
            Some(Position { order: 0, row: 3 }),
            "still finishing the pattern"
        );
        ticks(&mut p, 6);
        assert_eq!(p.position(), Some(Position { order: 2, row: 0 }));
        assert_eq!(p.queued_order(), None);
    }

    #[test]
    fn replacing_the_song_keeps_position() {
        let mut p = started(Song::default());
        ticks(&mut p, 6 * 10);
        let mut edited = Song::default();
        edited.patterns[0][20][0] = Cell::note(70, 0);
        p.replace_song(edited);
        assert_eq!(p.position(), Some(Position { order: 0, row: 10 }));
        let mut short = Song {
            pattern_length: 4,
            ..Song::default()
        };
        short.patterns = vec![vec![[Cell::EMPTY; CHANNELS]; 4]];
        p.replace_song(short);
        assert_eq!(p.position().unwrap().row, 3);
    }
}
