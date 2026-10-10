# ChipForge for Godot

Play songs made in [ChipForge](../../README.md) live in Godot 4.3 or newer, on the
same emulated NES chip as the web app, with adaptive controls.

## Install

1. Build the extension: `./build.sh --release` (needs Rust), or download a release.
2. Copy `project/addons/chipforge` into your project's `addons/` folder.
3. Export songs from ChipForge: **Compose → Export → Game engine file** (`.chipsong`).
   Drop them anywhere in your project; they load as `ChipSong` resources.

## Use

Add a **ChipSongPlayer** node, assign a `.chipsong` file to **Song**, tick **Autoplay**.

```gdscript
@onready var music: ChipSongPlayer = $Music

func enter_boss_room() -> void:
    music.queue_section(2)         # switches on the next bar line
    music.tempo_scale = 1.2        # a little faster

func player_hurt() -> void:
    music.set_channel_muted(0, true)   # drop the lead layer

func level_cleared() -> void:
    $Jingle.play()                 # a ChipSongPlayer with play_once = true
    await $Jingle.finished
```

| Member | |
|---|---|
| `song: ChipSong` | The song to play. |
| `autoplay`, `play_once`, `tempo_scale` (0.25–4), `volume_db`, `bus` | Settings. |
| `play()`, `play_section(n)`, `stop()`, `is_playing()` | Playback. |
| `queue_section(n)` | Switch section when the current pattern ends. |
| `set_channel_muted(ch, muted)` | 0 pulse 1, 1 pulse 2, 2 triangle, 3 noise. |
| `get_section()`, `get_row()`, `get_playback_seconds()` | Position. |
| `render(seconds, sample_rate) -> PackedFloat32Array` | Offline render (bake to `AudioStreamWAV`). |
| signals `finished`, `looped(count)`, `section_changed(section)` | Events. |

`ChipSong.from_bytes(bytes)` builds a song at runtime (downloaded levels, mods);
`is_valid()` and `get_error()` say whether it can play.

## Develop

`./test.sh` builds the extension and runs `project/tests/run_tests.gd` headless
(`GODOT=/path/to/godot` if it isn't on `PATH`). Open `project/` in Godot for the demo:
Space plays, 1/2 switch sections, Q W E R toggle layers, ↑/↓ tempo, J jingle.
