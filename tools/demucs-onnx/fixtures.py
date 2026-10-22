"""Writes small reference spectrograms for web/src/convert/separate/demucs.test.ts.

    uv run python fixtures.py ../../web/src/convert/separate/fixtures.json

Runs Demucs's own _spec and _ispec code (with a 16-point FFT so the numbers stay
small) on fixed signals, so the TypeScript port can be checked against PyTorch.
"""

import json
import math
import sys

import torch
import torch.nn.functional as F

from demucs.hdemucs import pad1d
from demucs.spec import ispectro, spectro


def demucs_spec(x, nfft):
    hl = nfft // 4
    le = int(math.ceil(x.shape[-1] / hl))
    pad = hl // 2 * 3
    x = pad1d(x[None], (pad, pad + le * hl - x.shape[-1]), mode="reflect")  # reflect wants a channel dim
    z = spectro(x, nfft, hl)[..., :-1, :]
    return z[0, :, 2: 2 + le]


def demucs_ispec(z, length):
    hl = (z.shape[-2] * 2) // 4
    z = z[None, None]  # F.pad's constant mode wants batch and channel dimensions
    z = F.pad(z, (0, 0, 0, 1))
    z = F.pad(z, (2, 2))
    pad = hl // 2 * 3
    le = hl * int(math.ceil(length / hl)) + 2 * pad
    x = ispectro(z, hl, length=le)
    return x[0, 0, pad: pad + length]


def main(out):
    torch.manual_seed(7)
    cases = []
    for length in (50, 37):
        x = torch.sin(torch.arange(length) * 0.7) + 0.3 * torch.randn(length)
        z = demucs_spec(x, 16)
        # An edited spectrogram, as the network's output would be, for the inverse.
        edited = z * (0.5 + torch.rand(z.shape)) + 0.05 * torch.randn(z.shape, dtype=torch.cfloat)
        cases.append({
            "x": x.tolist(),
            "re": z.real.flatten().tolist(),
            "im": z.imag.flatten().tolist(),
            "freqs": z.shape[0],
            "frames": z.shape[1],
            "edited_re": edited.real.flatten().tolist(),
            "edited_im": edited.imag.flatten().tolist(),
            "inverse": demucs_ispec(edited, length).tolist(),
        })
    with open(out, "w") as f:
        json.dump({"nfft": 16, "cases": cases}, f)
    print(f"wrote {out}")


if __name__ == "__main__":
    main(sys.argv[1])
