# Contributing to ChipForge

Thanks for helping! Bug reports, ideas, songs made with it and code are all welcome.

## Ground rules

- Be kind: see the [Code of Conduct](CODE_OF_CONDUCT.md).
- For anything bigger than a small fix, open an issue first so we can agree on the
  approach before you spend time on it.
- Contributions are licensed like the part they change (inbound = outbound): MIT in
  `core/`, `native/` and `engines/`, AGPL-3.0 elsewhere. See [LICENSING.md](LICENSING.md).
  By opening a pull request you confirm you wrote the change or have the right to
  submit it under that license.

## Set up

You need Rust (stable) with the `wasm32-unknown-unknown` target, Node 24 with pnpm,
and [uv](https://docs.astral.sh/uv/) for the API.

```sh
rustup target add wasm32-unknown-unknown
pnpm install
pnpm dev          # app at http://localhost:5173
```

## Before you open a pull request

```sh
pnpm test                                  # Rust workspace, web unit tests, API
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
pnpm --filter web check                    # TypeScript and Svelte
pnpm build && pnpm --filter web e2e        # browser checks (needs Chrome or Chromium)
```

Touching the engine plugins or the C library? Also run the matching script:
`native/tests/c/run.sh`, `engines/godot/test.sh` (Godot 4.3+), `engines/unity/test.sh`
(.NET SDK). CI runs all of these on every pull request.

## How the code is organised

- `core/` is the sound engine: chip channels (`apu.rs`), the tracker player
  (`tracker.rs`, which also documents the `.chipsong` format), the SFX synth and
  VGM export. Everything that makes sound lives here, so the browser, the plugins and
  the exports all sound the same.
- `web/src/` is the Svelte app: `audio/` (the AudioWorklet and engine), `song/` (the
  song model and pure, tested edits), `composer/`, `sfx/`, `convert/`, `export/`.
- `docs/DESIGN.md` is the design system; please follow it for UI changes, and keep
  copy plain and specific.

## Style

- Match the code around you; formatting is enforced by `cargo fmt` and checked by CI.
- New behaviour comes with tests. Pure logic (song edits, analysis) gets unit tests;
  user-facing flows get an e2e check.
- Commit messages: a short imperative subject ("Add …", "Fix …"), then what changed
  and why.
