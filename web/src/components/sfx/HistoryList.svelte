<script lang="ts">
  import { lab } from '../../sfx/lab.svelte'
  import { library } from '../../sfx/library.svelte'
  import PixelIcon from '../PixelIcon.svelte'
  import HistoryRow from './HistoryRow.svelte'
</script>

<aside class="history" aria-labelledby="history-title">
  <div class="head">
    <h2 id="history-title">History</h2>
    <div class="filter" role="group" aria-label="Show">
      <button aria-pressed={library.filter === 'all'} onclick={() => (library.filter = 'all')}>
        All <span class="count">{library.entries.length}</span>
      </button>
      <button aria-pressed={library.filter === 'kept'} onclick={() => (library.filter = 'kept')}>
        Kept <span class="count">{library.keptCount}</span>
      </button>
    </div>
  </div>

  {#if library.visible.length === 0}
    <p class="empty">
      {library.filter === 'kept'
        ? 'Nothing kept yet. Press S or a star to keep a sound. Kept sounds are never removed.'
        : 'Sounds you make appear here.'}
    </p>
  {:else}
    <ol class="list" aria-label="Sounds, newest first. Use the up and down arrow keys to move.">
      {#each library.visible as entry (entry.id)}
        <HistoryRow {entry} selected={entry.id === library.selectedId} />
      {/each}
    </ol>
  {/if}

  <div class="foot">
    <button class="key" onclick={() => lab.exportKept()} disabled={library.keptCount === 0}>
      <PixelIcon name="download" />
      Download kept as .zip
    </button>
    <p>WAV files plus <code>sfx.json</code> with names and settings.</p>
  </div>
</aside>

<style>
  .history {
    grid-area: history;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-left: 1px solid var(--line);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: calc(var(--u) * 2);
    padding: calc(var(--u) * 4);
    padding-bottom: calc(var(--u) * 2);
  }

  h2 {
    font-size: var(--step-1);
    font-weight: 600;
  }

  .filter {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: var(--radius-key);
    background: var(--panel);
  }

  .filter button {
    padding: 2px calc(var(--u) * 2);
    border: 0;
    border-radius: 3px;
    background: none;
    color: var(--muted);
    font-size: var(--step--1);
    cursor: pointer;
  }

  .filter button[aria-pressed='true'] {
    background: var(--line);
    color: var(--text);
  }

  .count {
    font-family: var(--font-data);
  }

  .list {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 0 calc(var(--u) * 2);
    list-style: none;
    overflow-y: auto;
  }

  .empty {
    flex: 1;
    padding: calc(var(--u) * 4);
    color: var(--muted);
  }

  .foot {
    display: flex;
    flex-direction: column;
    gap: var(--u);
    padding: calc(var(--u) * 4);
    border-top: 1px solid var(--line);
  }

  .foot p {
    color: var(--muted);
    font-size: var(--step--1);
  }

  code {
    font-family: var(--font-data);
  }

  @media (max-width: 960px) {
    .history {
      border-left: 0;
      border-top: 1px solid var(--line);
      max-height: 420px;
    }
  }
</style>
