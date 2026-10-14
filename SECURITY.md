# Security policy

Please report security problems privately, not in public issues: use
[Report a vulnerability](https://github.com/spiritpaper/chipforge/security/advisories/new)
on GitHub (the repository's Security tab). Include steps to reproduce and what an
attacker could do.

You'll get a reply within a week. Fixes are released as soon as they're ready, and
reporters are credited unless they'd rather not be.

The most relevant areas are the server (sign-in links and sessions, sync, share
links, and payments: checkout, the ZarinPal callback and BTCPay webhooks), file
parsing (.chipsong, MIDI, audio files, share links), and the native libraries used
by the engine plugins and the desktop app.
