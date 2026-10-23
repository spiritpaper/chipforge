# UI/UX review (October 2026)

A walk through every screen at desktop (1280×800) and phone (390×844) sizes, as a
first-time visitor.

## Worth fixing first (done)

All four are fixed. At 1280×800 the tracker grew from 349 to 462 px (about 8 rows to
about 13): the song order is one line with its buttons under **Arrange**, and the channel
scopes are half as tall. The piano roll help sits behind a **?** button, the view
scrolls instead of overlapping the strips, and on phones Rows, Octave, Step, Follow and
MIDI fold under **Settings**. The SFX history now scrolls only its own list.

1. **Phone, SFX Lab opens scrolled down.** On a first visit the "Make a new sound"
   heading and the Chip/Classic switch are hidden under the play bar. Cause:
   `components/sfx/HistoryRow.svelte` scrolls the selected sound into view, and on
   phones the history sits below everything else, so the whole page scrolls. Only
   scroll the history list itself, or only when the selection changes after load.
2. **Compose has little room for the music.** At 800 px tall the tracker shows about
   8 rows: the toolbar (two lines), the song order strip and the channel scopes take
   the rest. Ideas: fold the song order into one line until it's used, and hide the
   scopes while nothing plays (or make them a thin strip).
3. **Piano roll overlaps the channel strips in short windows.** Its help text runs to
   three lines and the roll keeps a 240 px minimum height. Move the help into a "?"
   button or tooltip.
4. **Compose on phones:** the editor starts below the fold, after the toolbar and song
   order. A collapsible header ("Song settings") would put the notes on screen first.

## Smaller things (not changed yet)

5. **Keyboard focus starts in the wrong place.** The first Tab goes to the history list
   on the right, then the page, then the navigation rail; there's no "skip to content"
   link. Start with the preset buttons, then the current sound, then history.
6. **SFX download row is crowded on phones.** The button, the WAV/OGG menu and the
   sample-rate menu wrap awkwardly. Put format and rate behind one small settings menu
   next to Download.
7. **Account page without a server** explains self-hosting but gives no next step for
   most people. Say plainly that everything is saved on this device, and link to the
   self-hosting guide on the website.
8. **Two synths, little explanation in the app.** The Chip/Classic switch only explains
   itself in tooltips. A one-line note under it the first time ("Classic sounds like
   jsfxr; Chip sounds like a real NES") would help newcomers.

## Working well

- SFX Lab on desktop: clear, fast, every action has a key, and the loudness and pitch
  views make sounds easy to read.
- Convert: a clear choice between the two kinds of 8-bit, readable sliders with plain
  explanations, and an honest "nothing is uploaded".
- Dialogs (Songs, Export, Import) fit phones and say what each option is for.
- No sideways scrolling on any screen at phone width.
