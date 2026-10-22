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
  results. [Split into parts](#split-into-parts) first, use the Lo-fi filter, or convert
  and then clean up in Compose.
- Expect to fix a few notes. The piano roll's [multi-select](compose.md#piano-roll)
  makes moving and deleting groups of notes quick.

## Split into parts

For full songs, tick **Split into parts first** before **Make the chip version**.
ChipForge then separates the song into **vocals**, **drums**, **bass** and the **other
instruments** with [Demucs](https://github.com/adefossez/demucs), and converts each part
on its own:

| Part | Becomes |
|---|---|
| Vocals | The melody, on Pulse 1 (when nobody sings, the top line of the other instruments) |
| Other instruments | Harmony and chords, on Pulse 2 |
| Bass | The Triangle |
| Drums | The Noise channel |

This works much better than guessing the parts from the whole mix: the bass stays bass
even when it plays high, the singer's line doesn't get mixed up with the guitar's, and
drum hits are found in the drums alone.

Afterwards, the **Parts** list lets you:

- **listen** to each part on its own (the play button),
- **leave a part out** of the chip version (untick it), for example a busy guitar,
- **download** a part as WAV or OGG, such as the vocals alone or the song without them.

### What to expect

- **The first time**, it downloads the Demucs model (84 MB) from its author's Hugging
  Face page. It's checked and kept in your browser, so later splits start straight
  away and work offline. Nothing is uploaded.
- **Speed:** with a graphics card the browser can use (WebGPU, in recent Chrome and
  Edge), splitting runs on that. Otherwise it uses up to 8 processor cores, and takes
  about as long as the song on our 8-core test machine (longer with fewer cores). Then
  ChipForge finds the notes in each part; parts that are silent, like the vocals of an
  instrumental, are skipped. The progress bar says what it's using.
- The very first time you open ChipForge in a browser, the page reloads itself once
  after a moment. That lets the part splitter use all your processor cores.
- Songs up to 10 minutes can be split. A split song needs a few hundred MB of memory
  while it works.

### About the model's license

Demucs's code is MIT-licensed, but its trained model currently has **no license**: its
author removed the MIT license from the model page on 31 August 2026, and the model was
once described as for research use. ChipForge doesn't include or host the model; your
browser downloads it from the author when you ask. Keep that in mind before using split
parts commercially. Details: [Third-party notices](../../THIRD_PARTY_NOTICES.md).

## Whose music is it?

Converting a song doesn't change who owns it. A chip version of someone else's song,
or a part split out of it, is still their song, so you need permission to publish it or use it in a game,
and video sites may flag it. Convert your own music, music you have the rights to, or
public-domain pieces. See the [FAQ](faq.md#can-i-convert-any-song-and-use-it).
