<script lang="ts">
  import { converter } from '../../convert/converter.svelte'
  import { LOFI_PRESETS, type LofiParams } from '../../convert/lofi'

  interface Control {
    key: keyof LofiParams
    label: string
    help: string
    min: number
    max: number
    step: number
    format: (v: number) => string
  }

  const CONTROLS: Control[] = [
    { key: 'rate', label: 'Sample rate', help: 'Lower is crunchier and more aliased.', min: 4000, max: 32_000, step: 25, format: (v) => `${(v / 1000).toFixed(1)} kHz` },
    { key: 'bits', label: 'Bit depth', help: 'Fewer bits, coarser volume steps (the NES has 4).', min: 2, max: 8, step: 1, format: (v) => `${v} bits` },
    { key: 'square', label: 'Square fuzz', help: 'Pushes every sound toward a square wave.', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
    { key: 'tone', label: 'Brightness', help: 'Rolls off the harsh top end.', min: 1000, max: 16_000, step: 50, format: (v) => `${(v / 1000).toFixed(1)} kHz` },
    { key: 'mix', label: 'Mix', help: 'How much of the filtered sound you hear.', min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  ]
</script>

<section class="lofi" aria-labelledby="lofi-title">
  <h2 id="lofi-title" class="visually-hidden">Lo-fi filter settings</h2>
  <div class="presets" role="radiogroup" aria-label="Preset">
    {#each LOFI_PRESETS as p (p.id)}
      <button role="radio" aria-checked={converter.presetId === p.id} onclick={() => converter.setParams(p.params, p.id)}>
        <span class="name">{p.label}</span>
        <span class="desc">{p.description}</span>
      </button>
    {/each}
  </div>

  <div class="controls">
    {#each CONTROLS as c (c.key)}
      <div class="control">
        <div class="row">
          <label for="lofi-{c.key}" title={c.help}>{c.label}</label>
          <output for="lofi-{c.key}">{c.format(converter.params[c.key])}</output>
        </div>
        <input
          id="lofi-{c.key}"
          type="range"
          min={c.min}
          max={c.max}
          step={c.step}
          value={converter.params[c.key]}
          oninput={(e) => converter.setParams({ [c.key]: e.currentTarget.valueAsNumber })}
        />
        <p class="help">{c.help}</p>
      </div>
    {/each}
  </div>
</section>

<style>
  .lofi {
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 5);
  }

  .presets {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: calc(var(--u) * 2);
  }

  .presets button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--u);
    padding: calc(var(--u) * 3);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: var(--panel);
    text-align: left;
    cursor: pointer;
  }

  .presets button[aria-checked='true'] {
    border-color: var(--pulse1);
    box-shadow: inset 0 -2px 0 var(--pulse1);
  }

  .name {
    font-weight: 600;
  }

  .desc,
  .help {
    color: var(--muted);
    font-size: var(--step--1);
  }

  .controls {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: calc(var(--u) * 5);
  }

  .control {
    display: flex;
    flex-direction: column;
    gap: var(--u);
  }

  .row {
    display: flex;
    justify-content: space-between;
  }

  output {
    font-family: var(--font-data);
    font-size: var(--step--1);
    color: var(--muted);
  }

  input[type='range'] {
    width: 100%;
    margin: 0;
    accent-color: var(--pulse1);
  }
</style>
