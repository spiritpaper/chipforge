<script lang="ts">
  import { PRESET_META } from '../../sfx/params'
  import { lab } from '../../sfx/lab.svelte'
  import PixelIcon from '../PixelIcon.svelte'

  const presets = Object.entries(PRESET_META)
</script>

<section class="presets" aria-labelledby="presets-title">
  <h2 id="presets-title">Make a new sound</h2>
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
