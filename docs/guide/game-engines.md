# Using ChipForge in games

There are two ways to put ChipForge audio in a game.

## 1. Audio files: any engine

Export sound effects as WAV and music as OGG or WAV (**Loop for games**), then import
them like any other audio. This works everywhere: Godot, Unity, GameMaker, Construct,
Phaser, Defold, RPG Maker, Bevy, LÖVE, PICO-8 ports and the rest. See
[Exporting](export.md) for loop points.

## 2. Live chip playback: Godot, Unity, C/C++

The plugins play `.chipsong` files (a few KB each) on the same emulated chips as the
app, live in your game. Because the music is generated as it plays, it can react to
the game:

- **Switch section** on the next bar line (calm → combat → boss).
- **Mute layers** (drop the drums when the player is hiding).
- **Change tempo** (speed up when time runs out).
- **Play-once jingles** (level clear, game over).

Export with **Compose → Export → Game engine file**.

| Engine | Guide |
|---|---|
| Godot 4.3+ | [Godot plugin](../../engines/godot/README.md) |
| Unity 2021.3+ | [Unity package](../../engines/unity/README.md) |
| Anything else (C, C++, Rust, …) | The C library: [`native/include/chipforge.h`](https://github.com/spiritpaper/chipforge/blob/main/native/include/chipforge.h) |

For now the plugins are built from source, which needs Rust. Ready-made downloads for
both engines are planned (see the [roadmap](../PLAN.md)).

## Game jam checklist

1. **Sound effects first:** in SFX Lab, press the number keys for each kind of sound your
   game needs, mutate (**M**) until each is right, keep (**S**) them, then **Download
   kept as .zip**.
2. **One looping track:** start from a template in Compose (Overworld, Dungeon, Boss),
   change the melody, export OGG with **Loop for games**.
3. **A jingle:** the Victory template is a two-bar fanfare for winning a level.
4. Credit is optional; a "Music and sounds made with ChipForge" line in your credits is
   always appreciated.
