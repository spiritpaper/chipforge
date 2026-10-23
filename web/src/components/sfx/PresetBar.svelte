<script lang="ts">
  import { presetsFor } from '../../sfx/params'
  import { lab } from '../../sfx/lab.svelte'
  import PixelIcon from '../PixelIcon.svelte'
  import ImportDialog from './ImportDialog.svelte'

  const presets = $derived(Object.entries(presetsFor(lab.engine)))
  let importing = $state(false)
</script>

<section class="presets" aria-labelledby="presets-title">
  <div class="head">
    <h2 id="presets-title">Make a new sound</h2>
    <div class="engine" role="radiogroup" aria-label="Synth">
      <button
        role="radio"
        aria-checked={lab.engine === 'chip'}
        onclick={() => lab.setEngine('chip')}
        title="Sounds a NES could make: pulse, triangle and noise channels"
      >
        Chip (NES)
      </button>
      <button
        role="radio"
        aria-checked={lab.engine === 'classic'}
        onclick={() => lab.setEngine('classic')}
        title="The classic sfxr synth, as in jsfxr: square, saw, sine and noise, with a resonant filter and flanger"
      >
        Classic (sfxr)
      </button>
    </div>
    <button class="key small" onclick={() => (importing = true)} title="Bring in sounds from jsfxr, sfxr or rFXGen">
      Import…
    </button>
  </div>
  <div class="keys">
    {#each presets as [id, meta] (id)}
      <button
        class="key preset"
        class:random={id === 'random'}
        onclick={() => lab.generate(id)}
        disabled={lab.status !== 'ready'}
        title="New {meta.label.toLowerCase()} sound ({meta.key}). Each press rolls a new variation."
      >
        {#if id === 'random'}<PixelIcon name="dice" />{/if}
        <span>{meta.label}</span>
        <kbd>{meta.key}</kbd>
      </button>
    {/each}
  </div>
</section>

<ImportDialog bind:open={importing} />

<style>
  .presets {
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 2);
  }

  h2 {
    font-size: var(--step-0);
    font-weight: 500;
    color: var(--muted);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--u) * 3);
  }

  .engine {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: var(--radius-key);
    background: var(--panel);
  }

  .engine button {
    padding: var(--u) calc(var(--u) * 3);
    border: 0;
    border-radius: 3px;
    background: none;
    color: var(--muted);
    font-size: var(--step--1);
    cursor: pointer;
  }

  .engine button[aria-checked='true'] {
    background: var(--line);
    color: var(--text);
  }

  .keys {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--u) * 2);
  }

  .preset {
    min-height: 40px;
    padding: 0 calc(var(--u) * 3);
  }

  .random {
    margin-left: calc(var(--u) * 2);
  }

  @media (max-width: 720px) {
    .random {
      margin-left: 0;
    }

    kbd {
      display: none;
    }
  }
</style>
