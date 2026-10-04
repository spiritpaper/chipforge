<script lang="ts">
  import { engine } from '../audio/engine.svelte'
  import { CHANNELS } from '../audio/channels'
  import { cellLabel, isDrum, pitchPosition, segments } from '../lib/grid'

  const STEPS_PER_BAR = 16
  const ROW_H = 56
  const NOTE_H = 6

  const tracks = $derived(
    engine.grid.map((cells) => {
      const segs = segments(cells)
      const pitches = segs.filter((s) => !isDrum(s.value)).map((s) => s.value)
      const lowest = Math.min(...pitches)
      const highest = Math.max(...pitches)
      return segs.map((s) => ({
        ...s,
        y: (1 - pitchPosition(s.value, lowest, highest)) * (ROW_H - NOTE_H - 8) + 4,
        label: cellLabel(s.value),
      }))
    }),
  )
  const length = $derived(engine.grid[0]?.length ?? 0)
</script>

<section class="song" aria-labelledby="song-title">
  <div class="intro">
    <h1 id="song-title">First Light</h1>
    <p>A four-bar loop in A minor, played live by the chip core.</p>
  </div>

  {#if length === 0}
    <div class="empty">
      <p>Loading the song…</p>
    </div>
  {:else}
    <div class="grid" style:--steps={length}>
      {#each CHANNELS as ch, i (ch.name)}
        <div class="row" class:silent={!engine.audible(i)} style:--c={ch.color}>
          <span class="label">{ch.role}</span>
          <svg viewBox="0 0 {length} {ROW_H}" preserveAspectRatio="none" role="img" aria-label="{ch.name} part">
            {#each { length: length / 4 } as _, beat}
              <rect
                class={beat % (STEPS_PER_BAR / 4) === 0 ? 'bar' : 'beat'}
                x={beat * 4}
                y="0"
                width="0.06"
                height={ROW_H}
              />
            {/each}
            {#each tracks[i] as seg (seg.start)}
              <rect
                class="note"
                class:on={engine.step >= seg.start && engine.step < seg.start + seg.length}
                x={seg.start + 0.1}
                y={seg.y}
                width={seg.length - 0.2}
                height={NOTE_H}
              >
                <title>{seg.label}</title>
              </rect>
            {/each}
            {#if engine.step >= 0}
              <rect class="playhead" x={engine.step} y="0" width="1" height={ROW_H} />
            {/if}
          </svg>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .song {
    grid-area: work;
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 6);
    padding: calc(var(--u) * 8) calc(var(--u) * 6);
    overflow: auto;
    min-width: 0;
  }

  h1 {
    font-size: var(--step-4);
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: 0.01em;
  }

  .intro p {
    margin-top: var(--u);
    color: var(--muted);
    max-width: 60ch;
  }

  .empty {
    display: grid;
    place-items: center;
    min-height: 240px;
    border: 1px dashed var(--line);
    border-radius: var(--radius-key);
    color: var(--muted);
    text-align: center;
    padding: calc(var(--u) * 6);
  }

  .grid {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 2);
  }

  .row {
    flex: 1 1 56px;
    max-height: 104px;
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: calc(var(--u) * 3);
  }

  .label {
    align-self: center;
    font-size: var(--step--1);
    color: var(--muted);
    border-left: 3px solid var(--c);
    padding-left: calc(var(--u) * 2);
  }

  svg {
    width: 100%;
    height: 100%;
    min-height: 56px;
    background: var(--panel);
    border-radius: 2px;
  }

  .beat {
    fill: var(--line);
    opacity: 0.5;
  }

  .bar {
    fill: var(--line);
  }

  .note {
    fill: var(--c);
    opacity: 0.55;
  }

  .note.on {
    opacity: 1;
  }

  .playhead {
    fill: var(--text);
    opacity: 0.1;
  }

  .row.silent .note {
    fill: var(--muted);
    opacity: 0.25;
  }

  @media (max-width: 720px) {
    .song {
      padding: calc(var(--u) * 6) calc(var(--u) * 4);
    }

    .row {
      flex: none;
      grid-template-columns: 1fr;
      gap: var(--u);
    }
  }
</style>
