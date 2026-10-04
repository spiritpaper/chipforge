<script lang="ts">
  import { engine } from '../../audio/engine.svelte'
  import { composer } from '../../composer/composer.svelte'
  import ComposeToolbar from './ComposeToolbar.svelte'
  import InstrumentPanel from './InstrumentPanel.svelte'
  import TrackerGrid from './TrackerGrid.svelte'
  import PianoRoll from './PianoRoll.svelte'

  // Follow playback into the next pattern.
  $effect(() => {
    const pos = engine.position
    if (composer.follow && engine.playing && pos && pos.order !== composer.orderIndex) composer.goToOrder(pos.order)
  })

  const hex = (i: number) => i.toString(16).toUpperCase().padStart(2, '0')
</script>

<div class="compose">
  {#if composer.status !== 'ready'}
    <p class="state">Opening your song…</p>
  {:else}
    <div class="top">
      <ComposeToolbar />
      <nav class="orders" aria-label="Song order">
        <button class="key small" onclick={() => composer.goToOrder(composer.orderIndex - 1)} disabled={composer.orderIndex === 0} aria-label="Previous pattern" title="Previous (Ctrl+←)">‹</button>
        <span>
          Pattern <span class="mono">{hex(composer.patternIndex)}</span>, part {composer.orderIndex + 1} of {composer.song.order.length}
        </span>
        <button class="key small" onclick={() => composer.goToOrder(composer.orderIndex + 1)} disabled={composer.orderIndex >= composer.song.order.length - 1} aria-label="Next pattern" title="Next (Ctrl+→)">›</button>
      </nav>
    </div>
    <div class="editor">
      {#if composer.view === 'tracker'}<TrackerGrid />{:else}<PianoRoll />{/if}
      <InstrumentPanel />
    </div>
  {/if}
</div>

<style>
  .compose {
    grid-area: work;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
  }

  .state {
    padding: calc(var(--u) * 6);
    color: var(--muted);
  }

  .top {
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 3);
    padding: calc(var(--u) * 4) calc(var(--u) * 6);
    border-bottom: 1px solid var(--line);
  }

  .orders {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 2);
    color: var(--muted);
  }

  .small {
    min-width: 32px;
    padding: 0;
  }

  .mono {
    font-family: var(--font-data);
    color: var(--text);
  }

  .editor {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    min-height: 0;
  }

  @media (max-width: 960px) {
    .editor {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(320px, 1fr) auto;
    }

    .editor :global(.instruments) {
      border-left: 0;
      border-top: 1px solid var(--line);
      max-height: 200px;
    }
  }

  @media (max-width: 720px) {
    .compose {
      overflow-y: auto;
    }

    .top {
      padding: calc(var(--u) * 3) calc(var(--u) * 4);
    }

    .editor {
      flex: none;
      grid-template-rows: 420px auto;
    }

    .editor :global(.instruments) {
      max-height: none;
    }
  }
</style>
