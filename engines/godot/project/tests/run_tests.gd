# Headless checks for the ChipForge extension:
#   godot --headless --path engines/godot/project --script res://tests/run_tests.gd
#
# Godot itself reports "N ObjectDB instances were leaked" (AudioStreamGeneratorPlayback)
# at exit with the headless audio driver; a plain GDScript generator player does the
# same with no extension involved, so that warning is not ours.
extends SceneTree

var failures := 0


func check(label: String, ok: bool, detail = "") -> void:
	print(("  ✓ " if ok else "  ✗ ") + label + (" — %s" % str(detail) if str(detail) != "" else ""))
	if not ok:
		failures += 1


func rms(samples: PackedFloat32Array) -> float:
	var sum := 0.0
	for s in samples:
		sum += s * s
	return sqrt(sum / max(1, samples.size()))


func wait_seconds(seconds: float) -> void:
	await create_timer(seconds).timeout


func _initialize() -> void:
	run.call_deferred()


func run() -> void:
	print("ChipForge extension, Godot %s" % Engine.get_version_info().string)

	var song = load("res://songs/first_light.chipsong")
	check(".chipsong files load as ChipSong", song is ChipSong, song)
	check("the song is valid", song != null and song.is_valid(), song.get_error() if song else "")
	check("song info", song.get_section_count() == 1 and song.get_bpm() == 140, "%d sections, %d BPM" % [song.get_section_count(), song.get_bpm()])

	var bad := ChipSong.from_bytes(PackedByteArray([1, 2, 3, 4]))
	check("bad data is reported, not crashed on", not bad.is_valid() and bad.get_error() != "", bad.get_error())

	var player := ChipSongPlayer.new()
	player.song = song
	root.add_child(player)
	await process_frame

	var samples := player.render(2.0, 22050.0)
	check("offline render is audible", samples.size() == 44100 and rms(samples) > 0.05, "rms %.3f" % rms(samples))
	for ch in 4:
		player.set_channel_muted(ch, true)
	check("muting every channel silences it", rms(player.render(1.0, 22050.0)) < 0.0001)
	for ch in 4:
		player.set_channel_muted(ch, false)

	player.play()
	await wait_seconds(0.5)
	check("plays in real time", player.is_playing() and player.get_playback_seconds() > 0.2, "%.2f s" % player.get_playback_seconds())
	check("reports its position", player.get_section() == 0 and player.get_row() > 0, "row %d" % player.get_row())
	player.stop()
	check("stops", not player.is_playing())

	# A jingle: play once at 4× tempo (about 0.9 s) and wait for `finished`.
	var jingle := ChipSongPlayer.new()
	jingle.song = load("res://songs/victory.chipsong")
	jingle.play_once = true
	jingle.tempo_scale = 4.0
	root.add_child(jingle)
	await process_frame
	var state := {"finished": false}
	jingle.finished.connect(func(): state.finished = true)
	jingle.play()
	await wait_seconds(2.0)
	check("a play-once song emits finished and stops", state.finished and not jingle.is_playing())

	# Adaptive: queue the next section; it changes at the end of the pattern.
	var adaptive := ChipSongPlayer.new()
	adaptive.song = load("res://songs/overworld.chipsong")
	adaptive.tempo_scale = 4.0
	root.add_child(adaptive)
	await process_frame
	var sections := []
	adaptive.section_changed.connect(func(s): sections.append(s))
	adaptive.play()
	await wait_seconds(0.3)
	check("still in the first section", adaptive.get_section() == 0)
	adaptive.queue_section(1)
	await wait_seconds(2.0)
	check("queued section plays from the next bar line", sections.size() > 0 and sections[0] == 1, sections)

	# Free everything like a game unloading its scene, then let the frees land.
	for node in [player, jingle, adaptive]:
		node.queue_free()
	await process_frame
	await process_frame

	print("%s" % ("All checks passed" if failures == 0 else "%d check(s) failed" % failures))
	quit(failures)
