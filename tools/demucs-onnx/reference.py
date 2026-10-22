"""Separates a clip with Demucs itself, to check ChipForge's browser version against.

    uv run python reference.py IN.f32 OUT_DIR

IN.f32 is raw float32 stereo (interleaved) at 44.1 kHz, e.g. from
`ffmpeg -i song.mp3 -t 20 -f f32le -ac 2 -ar 44100 IN.f32`. Writes OUT_DIR/<source>.f32
as raw float32 mono (the mean of both channels), with the settings the app uses:
split into overlapping segments, no random shifts.
"""

import sys
from pathlib import Path

import numpy as np
import torch
from huggingface_hub import hf_hub_download

from demucs.apply import apply_model
from demucs.hf import load_safetensors_model

from export import REPO, REVISION, WEIGHTS


def main(src: Path, out: Path):
    model = load_safetensors_model(hf_hub_download(REPO, WEIGHTS, revision=REVISION)).eval()
    wav = torch.from_numpy(np.fromfile(src, dtype=np.float32).reshape(-1, 2).T.copy())
    # As demucs.api.Separator does: normalise by the mono mix.
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    with torch.no_grad():
        sources = apply_model(model, ((wav - mean) / std)[None], shifts=0, split=True, overlap=0.25)[0]
    sources = sources * std + mean
    out.mkdir(parents=True, exist_ok=True)
    for name, source in zip(model.sources, sources):
        source.mean(0).numpy().astype(np.float32).tofile(out / f"{name}.f32")
        print(f"{name}: rms {source.pow(2).mean().sqrt():.4f}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
