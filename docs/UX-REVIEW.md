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

## Smaller things (done)

5. **Keyboard focus.** The Tab order already started at the mode rail; what was missing
   was a way past it. A **Skip to content** button now appears on the first Tab and jumps
   to the page's first control (on SFX Lab, the Chip/Classic switch). The page is wrapped
   in a `main` landmark for screen readers.
6. **SFX download row on phones.** Format and sample rate moved into a small popover
   behind a sliders button next to Download; it closes on Escape or a click elsewhere.
7. **Account page without a server** now opens with "You don't need an account", says
   how to keep copies (Export in Compose, the kept-sounds .zip) and links to the
   self-hosting guide on the website.
8. **Chip vs Classic.** A one-line note under the switch explains the selected synth
   until you press **Got it**.

## Working well

- SFX Lab on desktop: clear, fast, every action has a key, and the loudness and pitch
  views make sounds easy to read.
- Convert: a clear choice between the two kinds of 8-bit, readable sliders with plain
  explanations, and an honest "nothing is uploaded".
- Dialogs (Songs, Export, Import) fit phones and say what each option is for.
- No sideways scrolling on any screen at phone width.
