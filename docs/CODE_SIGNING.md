# Code signing

ChipForge's installers are **not code-signed yet**. Free signing programs for open-source
projects (such as SignPath Foundation's) are for projects that already have a following,
and ChipForge is new, so for now Windows and macOS warn that the publisher is unknown:

- **Windows:** "Windows protected your PC". Click **More info**, then **Run anyway**.
- **macOS:** "can't be opened". Right-click the app, choose **Open**, then **Open** again.

If you'd rather not, the [web app](https://spiritpaper.site/chipforge/app/) is the same
app with nothing to install.

## Where the installers come from

Every installer attached to a
[ChipForge release](https://github.com/spiritpaper/chipforge/releases) is built by GitHub
Actions from this repository's source (see
[`.github/workflows/desktop.yml`](https://github.com/spiritpaper/chipforge/blob/main/.github/workflows/desktop.yml)).
Nothing is built on a personal computer. Only download installers from the releases page.

## Privacy

The ChipForge desktop app does not transfer any information to other networked systems
unless you ask it to: songs, sounds and conversions are made and kept on your computer.
It connects to the network only when you ask it to: the **Support** link opens a web
page in your browser, and **Split into parts** in Convert downloads the Demucs model
from Hugging Face the first time you use it (it sends nothing about you or your music).

The web app works the same way. If you choose to sign in to a ChipForge server, your
songs and sounds sync to that server, as described in [Self-hosting](../deploy/README.md).

## Reporting a problem

If you think a ChipForge download is malicious or isn't what it should be, report it
privately as described in [Security](../SECURITY.md).
