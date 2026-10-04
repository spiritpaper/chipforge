<script lang="ts">
  import { converter } from '../../convert/converter.svelte'

  const PIXEL = 2
  let canvas: HTMLCanvasElement
  let width = $state(0)
  let height = $state(0)
  let position = $state(0)

  $effect(() => {
    const bars = converter.overview
    // The colour comes from CSS and changes with the A/B choice, so redraw then too.
    void converter.original
    if (!width || !height) return
    const ctx = canvas.getContext('2d')!
    const w = (canvas.width = Math.floor(width / PIXEL))
    const h = (canvas.height = Math.floor(height / PIXEL))
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = getComputedStyle(canvas).color
    const mid = h / 2
    for (let x = 0; x < w; x++) {
      const v = bars[Math.floor((x / w) * bars.length)] ?? 0
      const half = Math.max(0.5, v * mid)
      ctx.fillRect(x, Math.round(mid - half), 1, Math.max(1, Math.round(half * 2)))
    }
  })

  $effect(() => {
    let frame = requestAnimationFrame(function tick() {
      position = converter.position()
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  })

  const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  function seekTo(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    converter.seek(((e.clientX - rect.left) / rect.width) * converter.seconds)
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      e.stopPropagation()
      converter.seek(position + (e.key === 'ArrowRight' ? 5 : -5))
    }
  }
</script>

<div
  class="overview"
  class:original={converter.original}
  role="slider"
  tabindex="0"
  aria-label="Position"
  aria-valuemin="0"
  aria-valuemax={Math.round(converter.seconds)}
  aria-valuenow={Math.round(position)}
  aria-valuetext="{time(position)} of {time(converter.seconds)}"
  onpointerdown={seekTo}
  {onkeydown}
>
  <canvas bind:this={canvas} bind:clientWidth={width} bind:clientHeight={height} aria-hidden="true"></canvas>
  <span class="played" style:width="{(position / Math.max(1, converter.seconds)) * 100}%"></span>
  <span class="time">{time(position)} / {time(converter.seconds)}</span>
</div>

<style>
  .overview {
    position: relative;
    height: 120px;
    border-radius: var(--radius-key);
    background: var(--panel);
    overflow: hidden;
    cursor: pointer;
  }

  canvas {
    width: 100%;
    height: 100%;
    color: var(--pulse1);
    image-rendering: pixelated;
  }

  .original canvas {
    color: var(--muted);
  }

  .played {
    position: absolute;
    inset: 0 auto 0 0;
    border-right: 2px solid var(--text);
    background: rgb(232 228 255 / 0.06);
    pointer-events: none;
  }

  .time {
    position: absolute;
    right: calc(var(--u) * 2);
    bottom: var(--u);
    font-family: var(--font-data);
    font-size: var(--step--1);
    color: var(--muted);
  }
</style>
