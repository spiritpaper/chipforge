# FAQ

## Can I use what I make in a commercial game or a monetized video?

Yes. Songs, sound effects and exports you make with ChipForge are yours, including songs
started from the built-in templates. Use them anywhere, commercially, with no credit
required (credit is always appreciated). ChipForge's own licenses cover the app's code,
not what you make with it; see [Licensing](../../LICENSING.md).

## Can I convert any song and use it?

You can convert any song for yourself. Publishing it is another matter: a chip version
of someone else's song is still their song (it's a cover or arrangement), so you need
the rights to use it in a game or a video, and video sites' copyright systems may
still recognise the melody. Convert your own music, music you've licensed, or
public-domain pieces (most classical music is a good start).

## Is anything uploaded?

No. Sound effects, songs and conversions are all made on your device. Without an
account nothing leaves it. (**Split into parts** downloads the Demucs model the first
time you use it; that's a download, nothing is sent.) With an account on a ChipForge server, your songs and
sounds sync to that server so they reach your other devices.

## Does it work offline?

Yes. After the first visit the web app works without a connection, and the desktop app
always does.

## Where are my songs stored, and how do I back them up?

In your browser's storage on this device (or the desktop app's). Clearing site data
deletes them. Back up with **Compose → Export → Song file** for songs and **SFX Lab →
Download kept as .zip** for sounds.

## Why does Windows say "Windows protected your PC"?

The installer isn't code-signed yet. Click **More info → Run anyway**. Signed installers
are coming. Or skip the install and use the [web app](https://spiritpaper.site/chipforge/app/).

## Why does macOS say the app can't be opened?

Same reason: right-click the app, choose **Open**, then **Open** again.

## Which browsers work?

Current Chrome, Edge, Firefox and Safari. Chrome and Edge are the fastest at **Chip
version** conversions, and MIDI keyboards need Chrome, Edge or Firefox.

## Why are there only four channels?

That's the chip. The NES and Game Boy each have two pulse channels, one more melodic
channel and a noise channel, and the limits are a big part of the sound. Chords become
arpeggios (effect `0xy` or the Chord graph); drums share the noise channel.

## The chip version got notes wrong. What can I do?

Try a different **Detail** setting and check the **Tempo** (Half or Double), then fix
the rest in Compose. Songs with one clear melody convert best. See
[Converting music](convert.md#getting-good-results).

## Is it free? What do accounts cost?

The app is free and open source, and everything in it works without an account.
Accounts (for syncing between devices and share links) need a ChipForge server; you can
[run your own](../../deploy/README.md).

## How can I help?

Report bugs and ideas on [GitHub](https://github.com/spiritpaper/chipforge/issues),
share what you made, or [support the project](https://spiritpaper.site/#support).
Code contributions are welcome: see [Contributing](../../CONTRIBUTING.md).
