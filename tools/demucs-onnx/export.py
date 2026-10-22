"""Exports the HTDemucs network as an ONNX graph that holds no weights.

    uv run python export.py OUT.onnx

ChipForge's "Split into parts" runs Demucs (https://github.com/adefossez/demucs) in the
browser. It doesn't ship or host the model's weights: the browser downloads the
author's own file from Hugging Face (adefossez/HTDemucs, pinned below) and hands it to
ONNX Runtime as external data. This script makes the graph that fits that file:

- It exports only the network, between the spectrogram and the mask. The STFT, the
  inverse STFT and the complex mask are done by the app (web/src/convert/separate/),
  because ONNX has no inverse STFT.
- Every weight becomes a float16 initializer whose external data points at its byte
  range inside 955717e8.safetensors, followed by a Cast to float32, so the maths runs
  in float32 on every backend. Tensors the file doesn't hold (constants the exporter
  makes) stay inside the graph.

It then checks the graph against PyTorch on random audio, using the downloaded file.
"""

import json
import shutil
import struct
import sys
import tempfile
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
from huggingface_hub import hf_hub_download
from onnx import TensorProto, helper, numpy_helper

from demucs.hf import load_safetensors_model

REPO = "adefossez/HTDemucs"
REVISION = "cbc8a9b1a87023b7fd74e7b3412e6321c0eab003"
WEIGHTS = "955717e8.safetensors"


class Network(torch.nn.Module):
    """HTDemucs.forward from the normalized inputs to the de-normalized outputs:
    `mag` is the spectrogram as real channels (cac), `mix` the waveform. Returns the
    frequency branch (sources × 4 channels × freqs × frames, still to be turned back
    into complex numbers) and the time branch (sources × 2 × samples)."""

    def __init__(self, model):
        super().__init__()
        self.m = model

    def forward(self, mix, mag):
        m = self.m
        x = mag
        B, C, Fq, T = x.shape
        mean = x.mean(dim=(1, 2, 3), keepdim=True)
        std = x.std(dim=(1, 2, 3), keepdim=True)
        x = (x - mean) / (1e-5 + std)
        xt = mix
        meant = xt.mean(dim=(1, 2), keepdim=True)
        stdt = xt.std(dim=(1, 2), keepdim=True)
        xt = (xt - meant) / (1e-5 + stdt)

        saved, saved_t, lengths, lengths_t = [], [], [], []
        for idx, encode in enumerate(m.encoder):
            lengths.append(x.shape[-1])
            inject = None
            if idx < len(m.tencoder):
                lengths_t.append(xt.shape[-1])
                tenc = m.tencoder[idx]
                xt = tenc(xt)
                if not tenc.empty:
                    saved_t.append(xt)
                else:
                    inject = xt
            x = encode(x, inject)
            if idx == 0 and m.freq_emb is not None:
                frs = torch.arange(x.shape[-2], device=x.device)
                emb = m.freq_emb(frs).t()[None, :, :, None].expand_as(x)
                x = x + m.freq_emb_scale * emb
            saved.append(x)
        if m.crosstransformer:
            if m.bottom_channels:
                b, c, f, t = x.shape
                x = x.reshape(b, c, f * t)
                x = m.channel_upsampler(x)
                x = x.reshape(b, -1, f, t)
                xt = m.channel_upsampler_t(xt)
            x, xt = m.crosstransformer(x, xt)
            if m.bottom_channels:
                b, c, f, t = x.shape
                x = x.reshape(b, c, f * t)
                x = m.channel_downsampler(x)
                x = x.reshape(b, -1, f, t)
                xt = m.channel_downsampler_t(xt)
        for idx, decode in enumerate(m.decoder):
            skip = saved.pop(-1)
            x, pre = decode(x, skip, lengths.pop(-1))
            offset = m.depth - len(m.tdecoder)
            if idx >= offset:
                tdec = m.tdecoder[idx - offset]
                length_t = lengths_t.pop(-1)
                if tdec.empty:
                    pre = pre[:, :, 0]
                    xt, _ = tdec(pre, None, length_t)
                else:
                    skip = saved_t.pop(-1)
                    xt, _ = tdec(xt, skip, length_t)
        S = len(m.sources)
        x = x.view(B, S, -1, Fq, T)
        x = x * std[:, None] + mean[:, None]
        xt = xt.view(B, S, -1, mix.shape[-1])
        xt = xt * stdt[:, None] + meant[:, None]
        return x, xt


def safetensors_layout(path):
    """name → (absolute byte offset, length, dtype, shape) for every tensor in the file."""
    with open(path, "rb") as f:
        n = struct.unpack("<Q", f.read(8))[0]
        header = json.loads(f.read(n))
    header.pop("__metadata__", None)
    base = 8 + n
    return {
        name: (base + t["data_offsets"][0], t["data_offsets"][1] - t["data_offsets"][0], t["dtype"], t["shape"])
        for name, t in header.items()
    }


def point_at_file(model: onnx.ModelProto, layout) -> int:
    """Turns initializers that match a tensor in the file into float16 external data
    plus a Cast. Returns how many were moved."""
    graph = model.graph
    moved, keep, casts = 0, [], []
    for init in graph.initializer:
        # The exporter names weights after the wrapper's attribute: "m.encoder.0…".
        hit = layout.get(init.name.removeprefix("m."))
        if hit is None or init.data_type != TensorProto.FLOAT:
            keep.append(init)
            continue
        offset, length, dtype, shape = hit
        assert dtype == "F16" and list(shape) == list(init.dims), (init.name, dtype, shape, init.dims)
        half = f"{init.name}::f16"
        ext = TensorProto(name=half, data_type=TensorProto.FLOAT16, dims=init.dims)
        ext.data_location = TensorProto.EXTERNAL
        for key, value in (("location", WEIGHTS), ("offset", str(offset)), ("length", str(length))):
            entry = ext.external_data.add()
            entry.key, entry.value = key, value
        keep.append(ext)
        casts.append(helper.make_node("Cast", [half], [init.name], to=TensorProto.FLOAT, name=f"{init.name}::cast"))
        moved += 1
    del graph.initializer[:]
    graph.initializer.extend(keep)
    nodes = list(graph.node)
    del graph.node[:]
    graph.node.extend(casts + nodes)
    return moved


def main(out: Path):
    weights = hf_hub_download(REPO, WEIGHTS, revision=REVISION)
    model = load_safetensors_model(weights).eval()
    segment = int(model.segment * model.samplerate)  # 343980 samples, 7.8 s
    frames = -(-segment // model.hop_length)
    print(f"segment {segment} samples, {frames} frames, sources {model.sources}")

    # The fused attention kernel has no ONNX form; the plain one exports.
    torch.backends.mha.set_fastpath_enabled(False)
    net = Network(model).eval()
    mix = torch.randn(1, 2, segment) * 0.1
    mag = model._magnitude(model._spec(mix))
    raw = out.with_suffix(".raw.onnx")
    with torch.no_grad():
        torch.onnx.export(
            net, (mix, mag), raw, input_names=["mix", "mag"], output_names=["freq", "time"],
            opset_version=17, do_constant_folding=False, dynamo=False,
        )
    graph = onnx.load(raw)
    raw.unlink()
    moved = point_at_file(graph, safetensors_layout(weights))
    print(f"{moved} of {len(safetensors_layout(weights))} weights read from {WEIGHTS}")
    onnx.save(graph, out)
    print(f"wrote {out} ({out.stat().st_size / 1e6:.2f} MB)")

    # The graph against PyTorch, with the weights read from the author's file.
    with tempfile.TemporaryDirectory() as folder:
        # The Hugging Face cache holds symlinks, which ONNX Runtime won't follow out
        # of the model's folder; a copy beside the graph is what the browser has too.
        shutil.copy(out, Path(folder) / "model.onnx")
        shutil.copy(weights, Path(folder) / WEIGHTS)
        session = ort.InferenceSession(str(Path(folder) / "model.onnx"))
    freq, time = session.run(None, {"mix": mix.numpy(), "mag": mag.numpy()})
    with torch.no_grad():
        ref_freq, ref_time = net(mix, mag)
    for name, got, want in (("freq", freq, ref_freq.numpy()), ("time", time, ref_time.numpy())):
        err = np.abs(got - want).max() / (np.abs(want).max() + 1e-9)
        print(f"{name}: shape {got.shape}, max relative error {err:.2e}")
        assert err < 1e-3, name


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "htdemucs.onnx"))
