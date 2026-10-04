<script lang="ts">
  import { lab } from '../../sfx/lab.svelte'
  import { peaks } from '../../sfx/analysis'
  import type { SfxEntry } from '../../sfx/library-core'
  import { waveColor } from '../../sfx/params'
  import PixelIcon from '../PixelIcon.svelte'

  let { entry, selected }: { entry: SfxEntry; selected: boolean } = $props()

  const THUMB_RATE = 8000
  const BARS = 28

  const preview = $derived.by(() => {
    const samples = lab.synth?.render(entry.params, THUMB_RATE) ?? new Float32Array(0)
    return { bars: peaks(samples, BARS), seconds: samples.length / THUMB_RATE }
  })

  let row: HTMLLIElement
  $effect(() => {
    if (selected) row.scrollIntoView({ block: 'nearest' })
  })
</script>

<li bind:this={row} class:selected style:--wave={waveColor(entry.params)}>
  <button class="pick" aria-current={selected ? 'true' : undefined} onclick={() => lab.select(entry.id)}>
    <svg class="thumb" viewBox="0 0 {BARS * 2} 16" preserveAspectRatio="none" aria-hidden="true">
      {#each preview.bars as v, i (i)}
        <rect x={i * 2} y={8 - Math.max(0.5, v * 8)} width="1.4" height={Math.max(1, v * 16)} />
      {/each}
    </svg>
    <span class="name">{entry.name}</span>
    <span class="seconds">{preview.seconds.toFixed(2)} s</span>
  </button>
  <button
    class="star"
    aria-pressed={entry.starred}
    aria-label={entry.starred ? `Stop keeping ${entry.name}` : `Keep ${entry.name}`}
    title={entry.starred ? 'Kept: never removed from history' : 'Keep this sound'}
    onclick={() => lab.toggleKeep(entry.id)}
  >
    <PixelIcon name="star" />
  </button>
</li>

<style>
  li {
    display: flex;
    align-items: center;
    border-radius: var(--radius-key);
  }

  li:hover {
    background: var(--panel);
  }

  li.selected {
    background: var(--line);
  }

  .pick {
    flex: 1;
    display: grid;
    grid-template-columns: 44px 1fr auto;
    align-items: center;
    gap: calc(var(--u) * 2);
    min-width: 0;
    min-height: 36px;
    padding: var(--u) calc(var(--u) * 2);
    border: 0;
    background: none;
    text-align: left;
    cursor: pointer;
  }

  .thumb {
    width: 44px;
    height: 18px;
    fill: var(--wave);
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .seconds {
    font-family: var(--font-data);
    font-size: var(--step--1);
    color: var(--muted);
  }

  .star {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: var(--radius-key);
    background: none;
    color: var(--line);
    cursor: pointer;
  }

  li.selected .star,
  li:hover .star {
    color: var(--muted);
  }

  .star[aria-pressed='true'],
  li .star[aria-pressed='true'] {
    color: var(--pulse2);
  }

  @media (pointer: coarse) {
    .pick {
      min-height: 44px;
    }

    .star {
      width: 44px;
      height: 44px;
      color: var(--muted);
    }
  }
</style>
