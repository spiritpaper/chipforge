<script lang="ts">
  import { engine } from '../audio/engine.svelte'
  import type { ChannelInfo } from '../audio/channels'
  import { traceRows } from '../lib/scope'

  let { channel, info }: { channel: number; info: ChannelInfo } = $props()

  /** CSS pixels per chip pixel: the scope is drawn at low resolution on purpose. */
  const PIXEL = 3

  let canvas: HTMLCanvasElement
  const audible = $derived(engine.audible(channel))

  $effect(() => {
    const ctx = canvas.getContext('2d')!
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      canvas.width = Math.max(8, Math.floor(width / PIXEL))
      canvas.height = Math.max(4, Math.floor(height / PIXEL))
    })
    resize.observe(canvas)

    let frame = 0
    let lastDraw = 0
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      if (reduceMotion && now - lastDraw < 500) return
      lastDraw = now
      const { width, height } = canvas
      const samples = engine.scopes[channel] ?? new Float32Array(0)
      const rows = traceRows(samples, width, height - 2)
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = getComputedStyle(canvas).color
      let prev = rows[0]
      for (let x = 0; x < width; x++) {
        const y = rows[x]
        const top = Math.min(prev, y)
        ctx.fillRect(x, top + 1, 1, Math.abs(y - prev) + 1)
        prev = y
      }
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
    }
  })
</script>

<div class="strip" class:silent={!audible} style:--c={info.color}>
  <div class="head">
    <span class="name">{info.name}</span>
    <span class="role">{info.role}</span>
    <div class="buttons">
      <button
        class="toggle"
        aria-pressed={engine.muted[channel] && engine.soloed === null}
        onclick={() => engine.toggleMute(channel)}
        title="Mute {info.name} ({info.key})"
      >
        Mute
      </button>
      <button
        class="toggle"
        aria-pressed={engine.soloed === channel}
        onclick={() => engine.toggleSolo(channel)}
        title="Solo {info.name} (Shift+{info.key})"
      >
        Solo
      </button>
    </div>
  </div>
  <canvas bind:this={canvas} aria-hidden="true"></canvas>
</div>

<style>
  .strip {
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 2);
    min-width: 0;
    padding: calc(var(--u) * 3) calc(var(--u) * 4);
    border-top: 3px solid var(--c);
    background: var(--panel);
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: calc(var(--u) * 2);
  }

  .name {
    font-weight: 600;
    white-space: nowrap;
  }

  .role {
    color: var(--muted);
    font-size: var(--step--1);
  }

  .buttons {
    display: flex;
    gap: var(--u);
    margin-left: auto;
  }

  .toggle {
    padding: 2px calc(var(--u) * 2);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: none;
    font-size: var(--step--1);
    color: var(--muted);
    cursor: pointer;
  }

  .toggle:hover {
    color: var(--text);
  }

  .toggle[aria-pressed='true'] {
    background: var(--text);
    border-color: var(--text);
    color: var(--ink);
  }

  canvas {
    width: 100%;
    height: 72px;
    color: var(--c);
    image-rendering: pixelated;
  }

  .silent canvas {
    color: var(--line);
  }

  .silent .name {
    color: var(--muted);
  }

  @media (max-width: 720px) {
    .strip {
      padding: calc(var(--u) * 2) calc(var(--u) * 3);
    }

    .role {
      display: none;
    }

    canvas {
      height: 48px;
    }
  }

  @media (pointer: coarse) {
    .toggle {
      min-height: 44px;
      padding: 0 calc(var(--u) * 2);
    }
  }
</style>
