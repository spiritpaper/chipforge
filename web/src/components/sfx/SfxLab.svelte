<script lang="ts">
  import { EXPORT_RATES, lab } from '../../sfx/lab.svelte'
  import { PRESET_META, WAVES, presetLabel, silenceReason, waveColor } from '../../sfx/params'
  import PixelIcon from '../PixelIcon.svelte'
  import FineTune from './FineTune.svelte'
  import HistoryList from './HistoryList.svelte'
  import PresetBar from './PresetBar.svelte'
  import SoundView from './SoundView.svelte'

  const current = $derived(lab.current)
  const seconds = $derived(lab.samples.length / lab.renderedRate)
  const silent = $derived(current ? silenceReason(current.params, lab.samples, lab.renderedRate) : null)
</script>

<div class="lab" style:--wave={current ? waveColor(current.params) : 'var(--text)'}>
  <div class="main">
    <PresetBar />

    {#if lab.status === 'loading'}
      <p class="state">Loading the synth…</p>
    {:else if lab.status === 'error'}
      <p class="state">The sound engine could not load. Reload the page to try again.</p>
    {:else if current}
      <section class="sound" aria-label="Current sound">
        <div class="title-row">
          <input
            class="name"
            aria-label="Sound name"
            value={current.name}
            onchange={(e) => lab.rename(e.currentTarget.value)}
            onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <p class="facts">
            {WAVES[current.params.wave]?.label} wave, {seconds.toFixed(2)} seconds{#if PRESET_META[current.preset]}, from
              the {presetLabel(current.preset).toLowerCase()} preset{:else if current.preset === 'shared'}, opened
              from a link{/if}
          </p>
        </div>

        <div class="actions">
          <button class="key" onclick={() => lab.mutate()} title="A close variation of this sound (M)">
            <PixelIcon name="mutate" /> Mutate <kbd>M</kbd>
          </button>
          <button
            class="key keep"
            aria-pressed={current.starred}
            onclick={() => lab.toggleKeep()}
            title="Kept sounds are never removed from history (S)"
          >
            <PixelIcon name="star" />
            {current.starred ? 'Kept' : 'Keep'}
            <kbd>S</kbd>
          </button>
          <span class="export">
            <button class="key" onclick={() => lab.exportWav()} title="Download this sound as a WAV file (E)">
              <PixelIcon name="download" /> Download WAV <kbd>E</kbd>
            </button>
            <select
              aria-label="WAV sample rate"
              value={lab.exportRate}
              onchange={(e) => lab.setExportRate(Number(e.currentTarget.value))}
            >
              {#each EXPORT_RATES as rate (rate)}
                <option value={rate}>{rate / 1000} kHz</option>
              {/each}
            </select>
          </span>
          <button class="key" onclick={() => lab.copyLink()} title="Copy a link that recreates this exact sound (L)">
            <PixelIcon name="link" /> Copy link <kbd>L</kbd>
          </button>
        </div>

        {#if silent}
          <p class="silent" role="status">{silent}</p>
        {/if}
        <SoundView samples={lab.samples} sampleRate={lab.renderedRate} onplay={() => lab.play()} />
      </section>

      <FineTune />
    {/if}
  </div>

  <HistoryList />
</div>

<style>
  .lab {
    grid-area: work;
    display: grid;
    grid-template: 'main history' 1fr / 1fr 300px;
    min-height: 0;
    min-width: 0;
  }

  .main {
    grid-area: main;
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 8);
    padding: calc(var(--u) * 6);
    overflow-y: auto;
    min-width: 0;
  }

  .state {
    color: var(--muted);
  }

  .sound {
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 4);
  }

  .name {
    width: 100%;
    max-width: 24ch;
    margin-left: calc(var(--u) * -2);
    padding: var(--u) calc(var(--u) * 2);
    border: 1px solid transparent;
    border-radius: var(--radius-key);
    background: none;
    font-size: var(--step-4);
    font-weight: 600;
    line-height: 1.1;
  }

  .name:hover {
    border-color: var(--line);
  }

  .name:focus {
    border-color: var(--muted);
    outline: none;
  }

  .facts {
    color: var(--muted);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--u) * 2);
  }

  .silent {
    padding: calc(var(--u) * 2) calc(var(--u) * 3);
    border-left: 3px solid var(--pulse2);
    background: var(--panel);
  }

  .keep[aria-pressed='true'] {
    color: var(--pulse2);
  }

  .export {
    display: inline-flex;
    gap: var(--u);
  }

  select {
    padding: 0 calc(var(--u) * 2);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: var(--ink);
    font: inherit;
    font-size: var(--step--1);
    color: var(--muted);
  }

  @media (max-width: 960px) {
    .lab {
      grid-template: 'main' auto 'history' auto / 1fr;
      overflow-y: auto;
    }

    .main {
      overflow: visible;
    }
  }

  @media (max-width: 720px) {
    .main {
      padding: calc(var(--u) * 4);
      gap: calc(var(--u) * 6);
    }

    kbd {
      display: none;
    }
  }
</style>
