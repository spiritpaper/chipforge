# Converting music to 8-bit

Drop in an MP3, WAV, OGG, FLAC or M4A and ChipForge gives you two kinds of 8-bit
version. Everything happens on your device; the file is never uploaded.

## Lo-fi filter: instant, keeps the recording

The original recording, crunched in real time: fewer bits, a lower sample rate, a square
"drive" and a tone filter. It keeps the vocals and everything else, so it sounds like the
song played through old hardware.

| Preset | Sound |
|---|---|
| NES | Four-bit steps and a gritty edge |
| Game Boy speaker | Tiny, buzzy and narrow |
| Arcade cabinet | Brighter, more bits, heavy drive |
| Gentle lo-fi | Crunchy but still clearly the original |

Adjust **Sample rate**, **Bit depth** and the rest by ear. **B** switches between the
original and the 8-bit version so you can compare. **Save the 8-bit version** downloads
it as WAV or OGG.

## Chip version: a real chip song you can edit

ChipForge listens for the notes, the beat and the drums, then writes them as a song for
the chip: melody on Pulse 1, chords on Pulse 2, bass on the Triangle, drums on Noise.
The result opens in [Compose](compose.md), where you can change anything.

1. Choose **Chip version**, then **Make the chip version**. It uses a small
   note-detection model (Spotify's Basic Pitch, about 1 MB, part of the app) and runs on
   your graphics card when the browser allows.
2. Check the **Tempo**. ChipForge finds it, but if notes land between rows, try **Half**
   or **Double**.
3. Pick the **Detail**: **Simple** keeps only the clearest notes, **Balanced** most of
   them, **Detailed** quiet notes too (it can get busy).
4. Turn **Chords as arpeggios** and **Drums** on or off.
5. **Open in Compose** to edit it, or download it as WAV or OGG.

### Getting good results

- Songs with **one clear melody** work best: chiptune, game music, piano pieces, pop with
  a strong lead.
- Dense mixes (rock with distorted guitars, orchestras, heavy reverb) give muddier
  results. Use the Lo-fi filter for those, or convert and then clean up in Compose.
- Expect to fix a few notes. The piano roll's [multi-select](compose.md#piano-roll)
  makes moving and deleting groups of notes quick.

Coming next: splitting a song into vocals, drums, bass and the rest before converting,
so each part gets its own chip channel. See the [roadmap](../PLAN.md).

## Whose music is it?

Converting a song doesn't change who owns it. A chip version of someone else's song is
still their song (a cover), so you need permission to publish it or use it in a game,
and video sites may flag it. Convert your own music, music you have the rights to, or
public-domain pieces. See the [FAQ](faq.md#can-i-convert-any-song-and-use-it).
