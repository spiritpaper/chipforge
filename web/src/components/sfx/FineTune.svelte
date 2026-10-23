<script lang="ts">
  import { engineOf, lab } from '../../sfx/lab.svelte'
  import { GROUPS, metaFor } from '../../sfx/params'
  import PixelIcon from '../PixelIcon.svelte'
  import ParamControl from './ParamControl.svelte'

  const params = $derived(lab.current?.params ?? {})
  const engine = $derived(lab.current ? engineOf(lab.current) : 'chip')
  const groups = $derived(
    GROUPS.map((g) => ({
      ...g,
      specs: (lab.synth?.specs ?? []).filter((s) => {
        const meta = metaFor(engine)[s.key]
        return meta?.group === g.id && (!meta.when || meta.when(params))
      }),
    })).filter((g) => g.specs.length > 0),
  )
</script>

<section class="fine-tune">
  <button
    class="key toggle"
    aria-expanded={lab.fineTuneOpen}
    aria-controls="fine-tune-panel"
    onclick={() => lab.toggleFineTune()}
  >
    <PixelIcon name="sliders" />
    {lab.fineTuneOpen ? 'Hide fine-tune' : 'Fine-tune'}
    <kbd>F</kbd>
  </button>

  {#if lab.fineTuneOpen}
    <div id="fine-tune-panel" class="groups">
      {#each groups as group (group.id)}
        <fieldset>
          <legend>{group.label}</legend>
          {#each group.specs as spec (spec.key)}
            <ParamControl {spec} {engine} value={params[spec.key] ?? spec.default} />
          {/each}
        </fieldset>
      {/each}
    </div>
    <p class="hint">Changes play when you let go. Your first change saves a copy, so the original stays in history.</p>
  {/if}
</section>

<style>
  .fine-tune {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: calc(var(--u) * 4);
  }

  .groups {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: calc(var(--u) * 4);
    width: 100%;
  }

  fieldset {
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 4);
    margin: 0;
    padding: calc(var(--u) * 4);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    min-width: 0;
  }

  legend {
    padding: 0 var(--u);
    font-weight: 600;
  }

  @media (max-width: 720px) {
    kbd {
      display: none;
    }
  }

  .hint {
    color: var(--muted);
    font-size: var(--step--1);
  }
</style>
