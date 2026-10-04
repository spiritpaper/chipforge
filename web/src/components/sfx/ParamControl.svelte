<script lang="ts">
  import { lab } from '../../sfx/lab.svelte'
  import { PARAM_META, SLIDER_STEPS, WAVES, fromPosition, toPosition } from '../../sfx/params'
  import type { ParamSpec } from '../../sfx/synth'
  import PixelIcon from '../PixelIcon.svelte'

  let { spec, value }: { spec: ParamSpec; value: number } = $props()

  const meta = $derived(PARAM_META[spec.key])
  const id = $derived(`param-${spec.key}`)
  const position = $derived(toPosition(value, spec.min, spec.max, meta.scale))

  const valueAt = (e: Event) =>
    fromPosition((e.currentTarget as HTMLInputElement).valueAsNumber, spec.min, spec.max, meta.scale)
</script>

{#if meta.control === 'wave'}
  <div class="control" role="radiogroup" aria-label={meta.label}>
    <span class="label" title={meta.tech}>{meta.label}</span>
    <div class="waves">
      {#each WAVES as wave, i (wave.label)}
        <button
          class="wave"
          role="radio"
          aria-checked={value === i}
          style:--c={wave.color}
          onclick={() => lab.setParam(spec.key, i, true)}
        >
          <PixelIcon name={wave.icon} />
          {wave.label}
        </button>
      {/each}
    </div>
  </div>
{:else if meta.control === 'toggle'}
  <label class="control toggle" title={meta.tech}>
    <input type="checkbox" checked={value > 0} onchange={(e) => lab.setParam(spec.key, e.currentTarget.checked ? 1 : 0, true)} />
    <span>{meta.label}</span>
  </label>
{:else}
  <div class="control">
    <div class="row">
      <label class="label" for={id} title="{meta.tech}. Double-click the slider to reset.">{meta.label}</label>
      <output for={id}>{meta.format(value)}</output>
    </div>
    <input
      {id}
      type="range"
      min="0"
      max={SLIDER_STEPS}
      value={position}
      oninput={(e) => lab.setParam(spec.key, valueAt(e), false)}
      onchange={(e) => lab.setParam(spec.key, valueAt(e), true)}
      ondblclick={() => lab.resetParam(spec.key)}
    />
  </div>
{/if}

<style>
  .control {
    display: flex;
    flex-direction: column;
    gap: var(--u);
  }

  .row {
    display: flex;
    justify-content: space-between;
    gap: calc(var(--u) * 2);
  }

  .label {
    color: var(--text);
    cursor: help;
  }

  output {
    font-family: var(--font-data);
    font-size: var(--step--1);
    color: var(--muted);
  }

  input[type='range'] {
    width: 100%;
    margin: 0;
    accent-color: var(--wave);
  }

  .waves {
    display: flex;
    gap: var(--u);
  }

  .wave {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--u);
    padding: calc(var(--u) * 2) var(--u);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: none;
    color: var(--muted);
    font-size: var(--step--1);
    cursor: pointer;
  }

  .wave:hover {
    color: var(--text);
  }

  .wave[aria-checked='true'] {
    border-color: var(--c);
    color: var(--c);
  }

  .toggle {
    flex-direction: row;
    align-items: center;
    gap: calc(var(--u) * 2);
    cursor: pointer;
  }

  .toggle input {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--wave);
  }
</style>
