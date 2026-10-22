# demucs-onnx

Makes `web/src/convert/separate/htdemucs.onnx`, the Demucs network that ChipForge's
**Split into parts** runs in the browser, and checks the app's version of Demucs
against the original. Needs [uv](https://docs.astral.sh/uv/); it installs PyTorch (CPU)
and Demucs from the author's repository at a fixed commit.

```sh
cd tools/demucs-onnx
uv run python export.py ../../web/src/convert/separate/htdemucs.onnx   # the graph
uv run python fixtures.py ../../web/src/convert/separate/fixtures.json # spectrogram test data
```

The graph holds **no weights**: each weight points at its bytes in the author's
`955717e8.safetensors` (adefossez/HTDemucs on Hugging Face, pinned revision), which the
app downloads on first use. `export.py` checks the graph against PyTorch before it
writes it.

To check the whole browser pipeline (spectrograms, segments, the graph) against Demucs
on real music:

```sh
ffmpeg -i song.mp3 -t 20 -f f32le -ac 2 -ar 44100 clip.f32
uv run python reference.py clip.f32 ref/                     # Demucs's own separation
cd ../../web && pnpm exec tsx scripts/check-separation.ts \
  ../tools/demucs-onnx/htdemucs.onnx ~/.cache/…/955717e8.safetensors clip.f32 ref/
```

It prints how far below each part the difference is; above 40 dB passes.

Behind a SOCKS proxy, run uv with `env -u ALL_PROXY -u all_proxy`: the Hugging Face
client doesn't accept `socks://` proxy URLs.
