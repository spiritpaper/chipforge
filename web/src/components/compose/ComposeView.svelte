<script lang="ts">
  import { engine } from '../../audio/engine.svelte'
  import { composer } from '../../composer/composer.svelte'
  import ComposeToolbar from './ComposeToolbar.svelte'
  import InstrumentPanel from './InstrumentPanel.svelte'
  import TrackerGrid from './TrackerGrid.svelte'
  import PianoRoll from './PianoRoll.svelte'
  import ArrangementStrip from './ArrangementStrip.svelte'

  // Follow playback into the next pattern.
  $effect(() => {
    const pos = engine.position
    if (composer.follow && engine.playing && pos && pos.order !== composer.orderIndex) composer.goToOrder(pos.order)
  })

</script>

<div class="compose">
  {#if composer.status !== 'ready'}
    <p class="state">Opening your song…</p>
  {:else}
    <div class="top">
      <ComposeToolbar />
      <ArrangementStrip />
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
