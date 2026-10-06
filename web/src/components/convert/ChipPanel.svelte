<script lang="ts">
  import { converter } from '../../convert/converter.svelte'
  import type { Detail } from '../../convert/arrange'
  import PixelIcon from '../PixelIcon.svelte'

  const STAGES = { loading: 'Loading the note finder…', notes: 'Listening for notes…', rhythm: 'Finding the beat and drums…' }
  const DETAILS: { id: Detail; label: string; help: string }[] = [
    { id: 'simple', label: 'Simple', help: 'Only the clearest notes' },
    { id: 'balanced', label: 'Balanced', help: 'Most notes' },
    { id: 'detailed', label: 'Detailed', help: 'Quiet notes too; can get busy' },
  ]
</script>

<section class="chip" aria-labelledby="chip-title">
  <h2 id="chip-title" class="visually-hidden">Chip version</h2>

  {#if !converter.heard}
    <div class="intro">
      <p>
        ChipForge listens for the notes, the beat and the drums, then plays them on the NES chip: melody on Pulse 1,
        chords on Pulse 2, bass on Triangle, drums on Noise. It works best on songs with one clear melody, and you
        can fix anything it gets wrong in Compose.
      </p>
      {#if converter.listening}
        {@const l = converter.listening}
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(l.fraction * 100)} aria-label={STAGES[l.stage]}>
          <span style:width="{(l.stage === 'rhythm' ? 1 : l.fraction) * 100}%"></span>
        </div>
        <p class="status" role="status">
          {STAGES[l.stage]}{l.stage === 'notes' ? ` ${Math.round(l.fraction * 100)}%` : ''}
          {#if l.backend}<span class="muted">({l.backend === 'webgl' ? 'using your graphics card' : 'graphics card unavailable, using the processor'})</span>{/if}
        </p>
      {:else}
        <button class="key big" onclick={() => converter.listen()}>Make the chip version</button>
        <p class="muted">Runs on this device, on your graphics card when the browser allows. Nothing is uploaded.</p>
      {/if}
      {#if converter.listenError}<p class="error" role="alert">Listening failed: {converter.listenError}</p>{/if}
    </div>
  {:else if converter.result}
    <div class="settings">
      <div class="field">
        <label for="chip-bpm">Tempo</label>
        <div class="row">
          <input
            id="chip-bpm"
            type="number"
            min="40"
            max="280"
            step="0.1"
            value={converter.options.bpm}
            onchange={(e) => e.currentTarget.valueAsNumber > 0 && converter.setOptions({ bpm: e.currentTarget.valueAsNumber })}
          />
          <span class="muted">BPM</span>
          <button class="small" onclick={() => converter.setOptions({ bpm: converter.options.bpm / 2 })} title="If notes feel twice as busy as they should">Half</button>
          <button class="small" onclick={() => converter.setOptions({ bpm: converter.options.bpm * 2 })} title="If everything feels sluggish">Double</button>
        </div>
        <p class="help">Found {Math.round(converter.heard.rhythm.bpm)} BPM. If notes land between rows, try half or double.</p>
      </div>

      <div class="field" role="radiogroup" aria-label="Detail">
        <span class="label">Detail</span>
        <div class="seg">
          {#each DETAILS as d (d.id)}
            <button role="radio" aria-checked={converter.options.detail === d.id} title={d.help} onclick={() => converter.setOptions({ detail: d.id })}>{d.label}</button>
          {/each}
        </div>
        <p class="help">{DETAILS.find((d) => d.id === converter.options.detail)?.help}.</p>
      </div>

      <div class="field checks">
        <label><input type="checkbox" checked={converter.options.chords} onchange={(e) => converter.setOptions({ chords: e.currentTarget.checked })} /> Chords as arpeggios</label>
        <label><input type="checkbox" checked={converter.options.drums} onchange={(e) => converter.setOptions({ drums: e.currentTarget.checked })} /> Drums</label>
      </div>
    </div>

    <ul class="report">
      {#each converter.result.lines as line, i (i)}<li>{line}</li>{/each}
    </ul>

    <div class="actions">
      <button class="key primary" onclick={() => converter.openInComposer()}>
        <PixelIcon name="note" /> Open in Compose
      </button>
      <div class="formats" role="radiogroup" aria-label="Format">
        <label><input type="radio" bind:group={converter.exportFormat} value="wav" /> WAV</label>
        <label><input type="radio" bind:group={converter.exportFormat} value="ogg" /> OGG</label>
      </div>
      <button class="key" onclick={() => converter.exportChip()} disabled={converter.exporting}>
        <PixelIcon name="download" />
        {converter.exporting ? 'Rendering…' : 'Download chip version'}
      </button>
    </div>
  {/if}
</section>

<style>
  .chip {
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 5);
  }

  .intro {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: calc(var(--u) * 3);
  }

  .intro p {
    max-width: 68ch;
  }

  .big {
    min-height: 44px;
    padding: 0 calc(var(--u) * 5);
    font-size: var(--step-1);
  }

  .progress {
    width: min(480px, 100%);
    height: 8px;
    border-radius: 4px;
    background: var(--panel);
    overflow: hidden;
  }

  .progress span {
    display: block;
    height: 100%;
    background: var(--pulse1);
    transition: width 0.2s;
  }

  @media (prefers-reduced-motion: reduce) {
    .progress span {
      transition: none;
    }
  }

  .muted,
  .help {
    color: var(--muted);
    font-size: var(--step--1);
  }

  .error {
    color: var(--pulse1);
  }

  .settings {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: calc(var(--u) * 5);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--u);
  }

  .row {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 2);
  }

  input[type='number'] {
    width: 10ch;
    padding: var(--u) calc(var(--u) * 2);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: var(--ink);
    font-family: var(--font-data);
  }

  .small {
    padding: 2px calc(var(--u) * 2);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: none;
    color: var(--muted);
    font-size: var(--step--1);
    cursor: pointer;
  }

  .small:hover {
    color: var(--text);
  }

  .seg {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: var(--radius-key);
    background: var(--panel);
    width: max-content;
  }

  .seg button {
    padding: var(--u) calc(var(--u) * 3);
    border: 0;
    border-radius: 3px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }

  .seg button[aria-checked='true'] {
    background: var(--line);
    color: var(--text);
  }

  .checks {
    justify-content: center;
  }

  .checks label,
  .formats label {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 2);
  }

  input[type='checkbox'],
  input[type='radio'] {
    accent-color: var(--text);
  }

  .report {
    margin: 0;
    padding: calc(var(--u) * 3) calc(var(--u) * 4) calc(var(--u) * 3) calc(var(--u) * 8);
    border-left: 3px solid var(--tri);
    background: var(--panel);
    color: var(--muted);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--u) * 4);
    padding-top: calc(var(--u) * 5);
    border-top: 1px solid var(--line);
  }

  .primary {
    background: var(--text);
    color: var(--ink);
  }

  .primary:hover {
    background: #fff;
  }

  .formats {
    display: flex;
    gap: calc(var(--u) * 3);
  }
</style>
