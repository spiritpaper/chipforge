<script lang="ts">
  import { engine } from '../../audio/engine.svelte'
  import { spectrogram } from '../../sfx/analysis'

  let {
    samples,
    sampleRate,
    onplay,
  }: { samples: Float32Array; sampleRate: number; onplay: () => void } = $props()

  /** CSS pixels per drawn pixel: chunky like the channel scopes, but finer. */
  const PIXEL = 2
  /** Lowest pitch row; lower bins are dominated by DC and window leakage. */
  const LOW_HZ = 100

  let waveCanvas: HTMLCanvasElement
  let pitchCanvas: HTMLCanvasElement
  let width = $state(0)
  let waveHeight = $state(0)
  let pitchHeight = $state(0)
  let progress = $state<number | null>(null)

  const seconds = $derived(samples.length / sampleRate)

  function rgb(el: HTMLElement): [number, number, number] {
    const m = getComputedStyle(el).color.match(/\d+(\.\d+)?/g) ?? ['255', '255', '255']
    return [Number(m[0]), Number(m[1]), Number(m[2])]
  }

  function drawWave() {
    const ctx = waveCanvas.getContext('2d')!
    const w = (waveCanvas.width = Math.max(1, Math.floor(width / PIXEL)))
    const h = (waveCanvas.height = Math.max(1, Math.floor(waveHeight / PIXEL)))
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = getComputedStyle(waveCanvas).color
    const mid = (h - 1) / 2
    for (let x = 0; x < w; x++) {
      const start = Math.floor((x * samples.length) / w)
      const end = Math.max(start + 1, Math.floor(((x + 1) * samples.length) / w))
      let lo = 0
      let hi = 0
      for (let i = start; i < end && i < samples.length; i++) {
        lo = Math.min(lo, samples[i])
        hi = Math.max(hi, samples[i])
      }
      const top = Math.round(mid - hi * mid)
      const bottom = Math.round(mid - lo * mid)
      ctx.fillRect(x, top, 1, Math.max(1, bottom - top + 1))
    }
  }

  function drawPitch() {
    const ctx = pitchCanvas.getContext('2d')!
    const w = (pitchCanvas.width = Math.max(1, Math.floor(width / PIXEL)))
    const h = (pitchCanvas.height = Math.max(1, Math.floor(pitchHeight / PIXEL)))
    const image = ctx.createImageData(w, h)
    if (samples.length > 0) {
      const { data, bins } = spectrogram(samples, w)
      const [r, g, b] = rgb(pitchCanvas)
      const highHz = Math.min(16_000, sampleRate / 2)
      // Log frequency rows, highest at the top, so slides read as lines.
      const rowBins = Array.from({ length: h }, (_, y) => {
        const f = LOW_HZ * (highHz / LOW_HZ) ** (1 - y / (h - 1))
        return Math.min(bins - 1, Math.round((f / (sampleRate / 2)) * bins))
      })
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          const v = data[x * bins + rowBins[y]]
          const o = (y * w + x) * 4
          image.data[o] = r
          image.data[o + 1] = g
          image.data[o + 2] = b
          image.data[o + 3] = Math.round(v ** 2 * 255)
        }
      }
    }
    ctx.putImageData(image, 0, 0)
  }

  $effect(() => {
    if (width && waveHeight && pitchHeight) {
      void samples
      drawWave()
      drawPitch()
    }
  })

  $effect(() => {
    if (!engine.sfxPlaying) {
      progress = null
      return
    }
    let frame = requestAnimationFrame(function tick() {
      progress = Math.min(1, (engine.now() - engine.sfxStart) / engine.sfxDuration)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  })
</script>

<button class="view" onclick={onplay} title="Play (Space)">
  <span class="track">
    <span class="caption">Loudness</span>
    <canvas bind:this={waveCanvas} bind:clientWidth={width} bind:clientHeight={waveHeight} aria-hidden="true"></canvas>
  </span>
  <span class="track">
    <span class="caption">Pitch</span>
    <canvas bind:this={pitchCanvas} bind:clientHeight={pitchHeight} aria-hidden="true"></canvas>
  </span>
  {#if progress !== null}
    <span class="playhead" style:left="{progress * 100}%"></span>
  {/if}
  <span class="visually-hidden">Play this sound, {seconds.toFixed(2)} seconds long</span>
</button>

<style>
  .view {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 0;
    border: 0;
    border-radius: var(--radius-key);
    background: var(--line);
    overflow: hidden;
    cursor: pointer;
    text-align: left;
  }

  .track {
    position: relative;
    display: block;
    background: var(--panel);
  }

  .caption {
    position: absolute;
    top: calc(var(--u) * 2);
    left: calc(var(--u) * 3);
    font-size: var(--step--1);
    color: var(--muted);
  }

  canvas {
    display: block;
    width: 100%;
    color: var(--wave);
    image-rendering: pixelated;
  }

  .track:first-child canvas {
    height: 128px;
  }

  .track:nth-child(2) canvas {
    height: 144px;
  }

  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--text);
    opacity: 0.7;
    pointer-events: none;
  }

  @media (max-width: 720px) {
    .track:first-child canvas {
      height: 88px;
    }

    .track:nth-child(2) canvas {
      height: 104px;
    }
  }
</style>
