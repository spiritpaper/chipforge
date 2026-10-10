# ChipForge for Unity

Play songs made in [ChipForge](../../README.md) live in Unity 2021.3 or newer, on the
same emulated NES chip as the web app, with adaptive controls.

## Install

1. Build the native library: `cargo build --release -p chipforge` and copy
   `target/release/libchipforge.so` (Linux), `chipforge.dll` (Windows) or
   `libchipforge.dylib` (macOS) into `com.chipforge.player/Runtime/Plugins/`.
2. In Unity: **Window → Package Manager → + → Add package from disk…** and pick
   `com.chipforge.player/package.json`.
3. Export songs from ChipForge (**Compose → Export → Game engine file**) and drop the
   `.chipsong` files into `Assets/`; they import as ChipSong assets.

## Use

Add **ChipForge Song Player** to a GameObject (it adds an AudioSource, whose volume,
mixer group and 3D settings apply) and assign a song.

```csharp
using ChipForge;

public class Music : MonoBehaviour
{
    public ChipSongPlayer music, jingle;

    public void EnterBossRoom()
    {
        music.QueueSection(2);          // switches on the next bar line
        music.tempoScale = 1.2f;
    }

    public void PlayerHurt() => music.SetChannelMuted(0, true);   // drop the lead layer

    public void LevelCleared()
    {
        jingle.playOnce = true;
        jingle.finished.AddListener(() => Debug.Log("jingle done"));
        jingle.Play();
    }
}
```

`ChipForgePlayer` is the same player without Unity (any .NET code): `Load(bytes)`,
`Play`, `QueueSection`, `SetChannelMuted`, `SetTempoScale`, `SetPlayOnce`,
`TakeFinished`, `Render(buffer, channels)`. It's thread-safe, so the main thread can
steer it while the audio thread renders.

## What's tested

`./test.sh` compiles `ChipForgePlayer` and its P/Invoke layer with the .NET SDK and
runs 14 checks against the real native library, including control from one thread
while another renders. The MonoBehaviour and the importer need Unity's own assemblies
and haven't been run in Unity yet.
