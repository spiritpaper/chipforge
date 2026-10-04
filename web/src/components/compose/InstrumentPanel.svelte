<script lang="ts">
  import { composer } from '../../composer/composer.svelte'

  const hex = (i: number) => i.toString(16).toUpperCase().padStart(2, '0')
</script>

<aside class="instruments" aria-labelledby="instruments-title">
  <h2 id="instruments-title">Instruments</h2>
  <p class="hint">New notes use the selected instrument. In the pattern, <kbd>,</kbd> and <kbd>.</kbd> switch it.</p>
  <ul>
    {#each composer.song.instruments as inst, i (i)}
      <li>
        <button
          aria-current={i === composer.instrument ? 'true' : undefined}
          onclick={() => composer.selectInstrument(i)}
        >
          <span class="num">{hex(i)}</span>
          <span class="name">{inst.name}</span>
        </button>
      </li>
    {/each}
  </ul>
</aside>

<style>
  .instruments {
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 2);
    min-height: 0;
    padding: calc(var(--u) * 4);
    border-left: 1px solid var(--line);
  }

  h2 {
    font-size: var(--step-1);
    font-weight: 600;
  }

  .hint {
    color: var(--muted);
    font-size: var(--step--1);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
  }

  button {
    display: flex;
    gap: calc(var(--u) * 3);
    width: 100%;
    padding: calc(var(--u) * 1.5) calc(var(--u) * 2);
    border: 0;
    border-radius: var(--radius-key);
    background: none;
    text-align: left;
    cursor: pointer;
  }

  button:hover {
    background: var(--panel);
  }

  button[aria-current='true'] {
    background: var(--line);
  }

  .num {
    font-family: var(--font-data);
    color: var(--muted);
  }
</style>
