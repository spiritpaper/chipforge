# Code signing policy

ChipForge's Windows installers are being set up for signing, so Windows can show who
made them instead of warning about an unknown publisher.

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by
[SignPath Foundation](https://signpath.org/).

## What is signed

Only the Windows installers (`.exe` and `.msi`) attached to
[ChipForge releases](https://github.com/spiritpaper/chipforge/releases). They are built
by GitHub Actions from this repository's source (see
[`.github/workflows/desktop.yml`](https://github.com/spiritpaper/chipforge/blob/main/.github/workflows/desktop.yml)),
and every signing request is approved by hand. Nothing built elsewhere is signed.

## Team roles

| Role | Who |
|---|---|
| Authors (may change the source without further review) | [spiritpaper](https://github.com/spiritpaper) |
| Reviewers (review every change from anyone else, such as pull requests) | [spiritpaper](https://github.com/spiritpaper) |
| Approvers (approve each signing request) | [spiritpaper](https://github.com/spiritpaper) |

All of them use multi-factor authentication for GitHub and SignPath.

## Privacy

The ChipForge desktop app does not transfer any information to other networked systems
unless you ask it to: songs, sounds and conversions are made and kept on your computer.
The only network action is the **Support** link, which opens a web page in your browser
when you click it.

The web app works the same way. If you choose to sign in to a ChipForge server, your
songs and sounds sync to that server, as described in [Self-hosting](../deploy/README.md).

## Reporting a problem

If you think a signed ChipForge file is malicious or was signed by mistake, report it
privately as described in [Security](../SECURITY.md).
