# Licensing

ChipForge uses two licenses, so that games can embed its player freely while the
app itself stays open when others run it as a service.

| Part | License | What it means |
|---|---|---|
| `core/` (the chip, tracker and SFX engine) | [MIT](core/LICENSE) | Use it anywhere, including closed-source games and tools. Keep the copyright notice. |
| `native/` (C library) | [MIT](native/LICENSE) | Same. |
| `engines/` (Godot plugin, Unity package) | [MIT](engines/LICENSE) | Same: ship them in commercial games. |
| Everything else: `web/` (the app), `api/` (the server), docs, tooling | [AGPL-3.0](LICENSE) | Use, change and self-host freely. If you run a modified version for other people over a network, you must offer them its source. |

**Music and sounds you make are yours.** Songs, sound effects and exports made with
ChipForge are not covered by either license; use them however you like, in
commercial games and monetized videos, with no credit required. That includes songs
started from the built-in templates and the starter song. (Converting someone else's
recording doesn't make it yours: the original song's rights still apply.)

**Contributions** are accepted under the license of the part they change (inbound =
outbound), as described in [CONTRIBUTING.md](CONTRIBUTING.md).

Third-party code and assets bundled with ChipForge keep their own licenses; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
