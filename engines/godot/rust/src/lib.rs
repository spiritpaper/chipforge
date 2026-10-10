//! ChipForge for Godot 4: plays `.chipsong` files (exported from the ChipForge web app)
//! live on an emulated NES sound chip.
//!
//! - [`ChipSong`] is a resource holding a song; `.chipsong` files load as one, so they
//!   can be assigned in the Inspector and are included in exported games.
//! - [`ChipSongPlayer`] is a node that plays a song with adaptive controls: switch
//!   section on the bar line, mute channels as layers, change tempo, play once.

use chipcore::chip::{CHANNELS, Chip};
use chipcore::tracker::{DecodeError, Song};
use godot::classes::{
    AudioServer, AudioStreamGenerator, AudioStreamGeneratorPlayback, AudioStreamPlayer, Engine,
    FileAccess, INode, IResourceFormatLoader, Node, Resource, ResourceFormatLoader, ResourceLoader,
    node::InternalMode,
};
use godot::global::Error as GdError;
use godot::prelude::*;

struct ChipForgeExtension;

thread_local! {
    static LOADER: std::cell::RefCell<Option<Gd<ChipSongLoader>>> = const { std::cell::RefCell::new(None) };
}

#[gdextension]
unsafe impl ExtensionLibrary for ChipForgeExtension {
    fn on_stage_init(stage: InitStage) {
        if stage == InitStage::Scene {
            let loader = ChipSongLoader::new_gd();
            ResourceLoader::singleton().add_resource_format_loader(&loader);
            LOADER.with(|l| *l.borrow_mut() = Some(loader));
        }
    }

    fn on_stage_deinit(stage: InitStage) {
        if stage == InitStage::Scene
            && let Some(loader) = LOADER.with(|l| l.borrow_mut().take())
        {
            ResourceLoader::singleton().remove_resource_format_loader(&loader);
        }
    }
}

fn describe(e: DecodeError) -> &'static str {
    match e {
        DecodeError::BadMagic => "not a .chipsong file",
        DecodeError::UnsupportedVersion(_) => "made by a newer ChipForge; update the plugin",
        DecodeError::Truncated => "the file is cut short",
        DecodeError::BadHeader(_) => "a song setting is out of range",
        DecodeError::BadOrder(_) => "the song order points at a missing pattern",
    }
}

/// A ChipForge song. Load a `.chipsong` file like any resource, or build one from
/// bytes with `ChipSong.from_bytes()`.
#[derive(GodotClass)]
#[class(base = Resource, init)]
pub struct ChipSong {
    /// The song in ChipForge's binary format.
    #[export]
    #[var(set = set_data)]
    data: PackedByteArray,
    song: Option<Song>,
    error: GString,
    base: Base<Resource>,
}

#[godot_api]
impl ChipSong {
    /// Makes a song from the bytes of a `.chipsong` file.
    #[func]
    fn from_bytes(bytes: PackedByteArray) -> Gd<ChipSong> {
        let mut song = ChipSong::new_gd();
        song.bind_mut().set_data(bytes);
        song
    }

    #[func]
    fn set_data(&mut self, data: PackedByteArray) {
        match Song::decode(data.as_slice()) {
            Ok(song) => {
                self.song = Some(song);
                self.error = GString::new();
            }
            Err(e) => {
                self.song = None;
                self.error = describe(e).into();
            }
        }
        self.data = data;
    }

    /// Whether the data is a song this plugin can play.
    #[func]
    fn is_valid(&self) -> bool {
        self.song.is_some()
    }

    /// Why the song can't be played, or "" when it can.
    #[func]
    fn get_error(&self) -> GString {
        self.error.clone()
    }

    /// Number of entries in the song order (its sections).
    #[func]
    fn get_section_count(&self) -> i32 {
        self.song.as_ref().map_or(0, |s| s.order.len() as i32)
    }

    #[func]
    fn get_bpm(&self) -> i32 {
        self.song.as_ref().map_or(0, |s| s.bpm as i32)
    }
}

impl ChipSong {
    fn song(&self) -> Option<&Song> {
        self.song.as_ref()
    }
}

/// Loads `.chipsong` files as [`ChipSong`] resources.
#[derive(GodotClass)]
#[class(base = ResourceFormatLoader, init, tool)]
struct ChipSongLoader {
    base: Base<ResourceFormatLoader>,
}

#[godot_api]
impl IResourceFormatLoader for ChipSongLoader {
    fn get_recognized_extensions(&self) -> PackedStringArray {
        PackedStringArray::from(&[GString::from("chipsong")])
    }

    fn handles_type(&self, ty: StringName) -> bool {
        ty == "ChipSong" || ty == "Resource"
    }

    fn get_resource_type(&self, path: GString) -> GString {
        if path.to_string().to_lowercase().ends_with(".chipsong") {
            "ChipSong".into()
        } else {
            GString::new()
        }
    }

    fn load(
        &self,
        path: GString,
        _original_path: GString,
        _use_sub_threads: bool,
        _cache_mode: i32,
    ) -> Variant {
        let bytes = FileAccess::get_file_as_bytes(&path);
        if bytes.is_empty() {
            return GdError::ERR_FILE_CANT_OPEN.to_variant();
        }
        let song = ChipSong::from_bytes(bytes);
        if !song.bind().is_valid() {
            godot_error!("{path}: {}", song.bind().get_error());
            return GdError::ERR_FILE_CORRUPT.to_variant();
        }
        song.to_variant()
    }
}

/// Plays a [`ChipSong`] on an emulated NES sound chip.
///
/// Adaptive music: `queue_section()` switches section when the current pattern ends,
/// `set_channel_muted()` fades layers in and out, `tempo_scale` speeds the music up,
/// and `play_once` turns a song into a jingle that emits `finished`.
#[derive(GodotClass)]
#[class(base = Node, init)]
pub struct ChipSongPlayer {
    /// The song to play.
    #[export]
    #[var(set = set_song)]
    song: Option<Gd<ChipSong>>,
    /// Start playing when the node enters the scene tree.
    #[export]
    autoplay: bool,
    /// Stop at the end of the song (and emit `finished`) instead of looping.
    #[export]
    #[var(set = set_play_once)]
    play_once: bool,
    /// Tempo multiplier, 0.25–4.
    #[export(range = (0.25, 4.0, 0.01))]
    #[var(set = set_tempo_scale)]
    #[init(val = 1.0)]
    tempo_scale: f32,
    /// Output volume in decibels.
    #[export(range = (-80.0, 24.0, 0.1, suffix = "dB"))]
    #[var(set = set_volume_db)]
    volume_db: f32,
    /// Audio bus to play on.
    #[export]
    #[var(set = set_bus)]
    #[init(val = StringName::from("Master"))]
    bus: StringName,

    chip: Option<Chip>,
    output: Option<Gd<AudioStreamPlayer>>,
    muted: [bool; CHANNELS],
    sample_rate: f32,
    frames_played: u64,
    last_loops: u32,
    last_section: i32,
    base: Base<Node>,
}

/// Seconds of audio kept queued ahead; covers frame-rate hitches.
const BUFFER_SECONDS: f32 = 0.15;

#[godot_api]
impl INode for ChipSongPlayer {
    fn ready(&mut self) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
        self.sample_rate = AudioServer::singleton().get_mix_rate();
        let mut generator = AudioStreamGenerator::new_gd();
        generator.set_mix_rate(self.sample_rate);
        generator.set_buffer_length(BUFFER_SECONDS);
        let mut output = AudioStreamPlayer::new_alloc();
        output.set_stream(&generator);
        output.set_bus(&self.bus);
        output.set_volume_db(self.volume_db);
        self.base_mut()
            .add_child_ex(&output)
            .internal(InternalMode::FRONT)
            .done();
        self.output = Some(output);
        self.rebuild_chip();
        if self.autoplay {
            self.play();
        }
    }

    fn process(&mut self, _delta: f64) {
        self.fill();
    }

    /// Stops the stream when leaving the tree, so its playback is released (otherwise
    /// a game quitting mid-song leaks it).
    fn exit_tree(&mut self) {
        if let Some(out) = self.output.as_mut() {
            out.stop();
        }
    }
}

#[godot_api]
impl ChipSongPlayer {
    /// Emitted when a `play_once` song reaches its end.
    #[signal]
    fn finished();
    /// Emitted each time the song loops back; `count` starts at 1.
    #[signal]
    fn looped(count: i32);
    /// Emitted when playback moves to another section (order entry).
    #[signal]
    fn section_changed(section: i32);

    #[func]
    fn set_song(&mut self, song: Option<Gd<ChipSong>>) {
        self.song = song;
        if let Some(s) = &self.song
            && !s.bind().is_valid()
        {
            godot_warn!("ChipSongPlayer: {}", s.bind().get_error());
        }
        self.rebuild_chip();
    }

    /// Plays from the start.
    #[func]
    fn play(&mut self) {
        self.play_section(0);
    }

    /// Plays from the start of a section (order entry).
    #[func]
    fn play_section(&mut self, section: i32) {
        if self.chip.is_none() {
            self.rebuild_chip();
        }
        let Some(chip) = self.chip.as_mut() else {
            godot_warn!("ChipSongPlayer: no playable song assigned");
            return;
        };
        chip.play_from(section.max(0) as usize, 0);
        self.frames_played = 0;
        self.last_loops = 0;
        self.last_section = section.max(0);
        if let Some(out) = self.output.as_mut()
            && !out.is_playing()
        {
            out.play();
        }
    }

    #[func]
    fn stop(&mut self) {
        if let Some(chip) = self.chip.as_mut() {
            chip.stop();
        }
    }

    #[func]
    fn is_playing(&self) -> bool {
        self.chip.as_ref().is_some_and(|c| c.player().is_playing())
    }

    /// The section (order entry) playing now, or -1 when stopped.
    #[func]
    fn get_section(&self) -> i32 {
        self.chip
            .as_ref()
            .and_then(|c| c.position())
            .map_or(-1, |p| p.order as i32)
    }

    /// The row playing now, or -1 when stopped.
    #[func]
    fn get_row(&self) -> i32 {
        self.chip
            .as_ref()
            .and_then(|c| c.position())
            .map_or(-1, |p| p.row as i32)
    }

    /// Seconds of audio produced since `play()`.
    #[func]
    fn get_playback_seconds(&self) -> f64 {
        if self.sample_rate > 0.0 {
            self.frames_played as f64 / self.sample_rate as f64
        } else {
            0.0
        }
    }

    /// Switches to `section` when the current pattern ends, so the change lands on the
    /// bar line.
    #[func]
    fn queue_section(&mut self, section: i32) {
        if let Some(chip) = self.chip.as_mut() {
            chip.player_mut().queue_order(section.max(0) as usize);
        }
    }

    /// Mutes or unmutes a channel: 0 pulse 1, 1 pulse 2, 2 triangle, 3 noise.
    #[func]
    fn set_channel_muted(&mut self, channel: i32, muted: bool) {
        if let Some(m) = self.muted.get_mut(channel as usize) {
            *m = muted;
        }
        if let Some(chip) = self.chip.as_mut() {
            chip.set_muted(channel as usize, muted);
        }
    }

    #[func]
    fn is_channel_muted(&self, channel: i32) -> bool {
        self.muted.get(channel as usize).copied().unwrap_or(false)
    }

    #[func]
    fn set_play_once(&mut self, on: bool) {
        self.play_once = on;
        if let Some(chip) = self.chip.as_mut() {
            chip.player_mut().set_play_once(on);
        }
    }

    #[func]
    fn set_tempo_scale(&mut self, scale: f32) {
        self.tempo_scale = scale.clamp(0.25, 4.0);
        if let Some(chip) = self.chip.as_mut() {
            chip.player_mut().set_tempo_scale(self.tempo_scale as f64);
        }
    }

    #[func]
    fn set_volume_db(&mut self, db: f32) {
        self.volume_db = db;
        if let Some(out) = self.output.as_mut() {
            out.set_volume_db(db);
        }
    }

    #[func]
    fn set_bus(&mut self, bus: StringName) {
        if let Some(out) = self.output.as_mut() {
            out.set_bus(&bus);
        }
        self.bus = bus;
    }

    /// Renders the song from the start, offline, as mono samples at `sample_rate`. Use it
    /// to bake an `AudioStreamWAV` or to inspect a song. Applies mutes and tempo scale.
    #[func]
    fn render(&self, seconds: f32, sample_rate: f32) -> PackedFloat32Array {
        let Some(song) = self.song.as_ref().and_then(|s| s.bind().song().cloned()) else {
            return PackedFloat32Array::new();
        };
        let sr = sample_rate.clamp(8000.0, 192_000.0);
        let mut chip = Chip::new(sr);
        chip.load_song(song);
        for (ch, &m) in self.muted.iter().enumerate() {
            chip.set_muted(ch, m);
        }
        chip.player_mut().set_tempo_scale(self.tempo_scale as f64);
        chip.player_mut().set_play_once(self.play_once);
        chip.play_from(0, 0);
        let total = (seconds.clamp(0.0, 600.0) * sr) as usize;
        let mut out = Vec::with_capacity(total);
        while out.len() < total {
            let n = (total - out.len()).min(4096);
            out.extend_from_slice(chip.render(n));
        }
        PackedFloat32Array::from(out.as_slice())
    }
}

impl ChipSongPlayer {
    /// Makes a fresh chip for the current song, carrying the node's settings over.
    fn rebuild_chip(&mut self) {
        let song = self.song.as_ref().and_then(|s| s.bind().song().cloned());
        let sr = if self.sample_rate > 0.0 {
            self.sample_rate
        } else {
            44_100.0
        };
        self.chip = song.map(|song| {
            let mut chip = Chip::new(sr);
            chip.load_song(song);
            for (ch, &m) in self.muted.iter().enumerate() {
                chip.set_muted(ch, m);
            }
            chip.player_mut().set_tempo_scale(self.tempo_scale as f64);
            chip.player_mut().set_play_once(self.play_once);
            chip
        });
    }

    /// Tops up the audio buffer and reports song events as signals.
    fn fill(&mut self) {
        let Some(chip) = self.chip.as_mut() else {
            return;
        };
        let Some(out) = self.output.as_ref().filter(|o| o.is_playing()) else {
            return;
        };
        let Some(playback) = out.get_stream_playback() else {
            return;
        };
        let Ok(mut playback) = playback.try_cast::<AudioStreamGeneratorPlayback>() else {
            return;
        };
        let frames = playback.get_frames_available().max(0) as usize;
        if frames == 0 {
            return;
        }
        let mut buffer = PackedVector2Array::new();
        buffer.resize(frames);
        let slice = buffer.as_mut_slice();
        let mut done = 0;
        while done < frames {
            let n = (frames - done).min(4096);
            for (i, &s) in chip.render(n).iter().enumerate() {
                slice[done + i] = Vector2::new(s, s);
            }
            done += n;
        }
        playback.push_buffer(&buffer);
        if chip.player().is_playing() {
            self.frames_played += frames as u64;
        }

        let finished = chip.player_mut().take_finished();
        let loops = chip.player().loops();
        let section = chip.position().map_or(-1, |p| p.order as i32);
        if loops > self.last_loops {
            self.last_loops = loops;
            self.base_mut()
                .emit_signal("looped", &[(loops as i32).to_variant()]);
        }
        if section >= 0 && section != self.last_section {
            self.last_section = section;
            self.base_mut()
                .emit_signal("section_changed", &[section.to_variant()]);
        }
        if finished {
            self.base_mut().emit_signal("finished", &[]);
        }
    }
}
