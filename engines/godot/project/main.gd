# ChipForge demo: adaptive music with a ChipSongPlayer.
#   Space    play / stop
#   1 2      switch section on the next bar line (Overworld has two)
#   Q W E R  toggle the pulse 1, pulse 2, triangle and noise layers
#   Up/Down  tempo
#   J        play the victory jingle once
extends Node

@onready var music: ChipSongPlayer = $Music
@onready var jingle: ChipSongPlayer = $Jingle
@onready var label: Label = $Label


func _ready() -> void:
	jingle.finished.connect(func(): music.set_channel_muted(0, false))
	music.section_changed.connect(func(_s): _update())
	_update()


func _unhandled_key_input(event: InputEvent) -> void:
	if not event.is_pressed():
		return
	match event.keycode:
		KEY_SPACE:
			if music.is_playing(): music.stop()
			else: music.play()
		KEY_1, KEY_2:
			music.queue_section(event.keycode - KEY_1)
		KEY_Q, KEY_W, KEY_E, KEY_R:
			var ch := [KEY_Q, KEY_W, KEY_E, KEY_R].find(event.keycode)
			music.set_channel_muted(ch, not music.is_channel_muted(ch))
		KEY_UP:
			music.tempo_scale += 0.1
		KEY_DOWN:
			music.tempo_scale -= 0.1
		KEY_J:
			music.set_channel_muted(0, true)
			jingle.play()
	_update()


func _update() -> void:
	var layers := ""
	for ch in 4:
		layers += "-" if music.is_channel_muted(ch) else "QWER"[ch]
	label.text = "ChipForge demo\n\nSpace play/stop · 1 2 sections · QWER layers [%s] · ↑↓ tempo %.1f× · J jingle\nSection %d" % [
		layers, music.tempo_scale, music.get_section()]
