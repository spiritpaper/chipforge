<script lang="ts">
  import { converter, PART_ORDER } from '../../convert/converter.svelte'
  import type { Detail } from '../../convert/arrange'
  import { WEIGHTS } from '../../convert/separate/session'
  import PixelIcon from '../PixelIcon.svelte'

  const STAGES = { loading: 'Loading the note finder…', notes: 'Listening for notes…', rhythm: 'Finding the beat and drums…' }
  const SPLIT_STAGES = {
    decoding: 'Reading the song…',
    download: 'Downloading the Demucs model…',
    loading: 'Loading the Demucs model…',
    separating: 'Splitting into parts…',
  }
  const MB = Math.round(WEIGHTS.bytes / 1e6)
  const using = { webgpu: 'using your graphics card', wasm: 'graphics card unavailable, using the processor (slower)' }

  $effect(() => {
    if (converter.split) void converter.checkSplitReady()
  })
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
      <label class="split">
        <input type="checkbox" checked={converter.split} disabled={!!(converter.listening || converter.separating)} onchange={(e) => converter.setSplit(e.currentTarget.checked)} />
        <span>
          <strong>Split into parts first</strong>: separates vocals, drums, bass and the other instruments with
          <a href="https://github.com/adefossez/demucs" target="_blank" rel="noopener">Demucs</a>, so each gets its own
          channel. Better for full songs; takes longer.
          {#if converter.split && !converter.splitReady}
            <span class="muted">The first time, it downloads the model ({MB} MB) from Hugging Face; after that it works offline.</span>
          {/if}
        </span>
      </label>
      {#if converter.separating}
        {@const sp = converter.separating}
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(sp.fraction * 100)} aria-label={SPLIT_STAGES[sp.stage]}>
          <span style:width="{sp.fraction * 100}%"></span>
        </div>
        <p class="status" role="status">
          {SPLIT_STAGES[sp.stage]}{sp.stage === 'download' || sp.stage === 'separating' ? ` ${Math.round(sp.fraction * 100)}%` : ''}
          {#if sp.backend}<span class="muted">({using[sp.backend]})</span>{/if}
        </p>
      {:else if converter.listening}
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
        {#if !converter.heard.parts}
          <!-- With parts, the Drums part below switches drums on and off. -->
          <label><input type="checkbox" checked={converter.options.drums} onchange={(e) => converter.setOptions({ drums: e.currentTarget.checked })} /> Drums</label>
        {/if}
      </div>
    </div>

    {#if converter.heard.parts && converter.parts}
      <div class="parts">
        <h3>Parts</h3>
        <p class="help">Listen to each part on its own, leave parts out of the chip version, or download one.</p>
        <ul>
          {#each PART_ORDER as part (part.id)}
            {@const on = converter.options.parts?.[part.id] ?? true}
            <li class:off={!on}>
              <button class="small" onclick={() => converter.togglePart(part.id)} aria-pressed={converter.partPlaying === part.id} aria-label="{converter.partPlaying === part.id ? 'Stop' : 'Listen to'} {part.label}">
                <PixelIcon name={converter.partPlaying === part.id ? 'stop' : 'play'} />
              </button>
              <label><input type="checkbox" checked={on} onchange={(e) => converter.usePart(part.id, e.currentTarget.checked)} /> {part.label}</label>
              <span class="muted">{part.channel}</span>
              <button class="small" onclick={() => converter.exportPart(part.id)} disabled={converter.exporting} aria-label="Download {part.label}" title="Download this part ({converter.exportFormat.toUpperCase()})">
                <PixelIcon name="download" />
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if converter.split !== !!converter.heard.parts}
      <p class="redo">
        {converter.split ? 'Split into parts is on, but this version was made from the whole mix.' : 'This version was made from the split parts.'}
        <button class="small" onclick={() => converter.redo()}>Make it again</button>
      </p>
    {/if}

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
  .split {
    display: flex;
    gap: calc(var(--u) * 2);
    align-items: flex-start;
    max-width: 68ch;
  }

  .split input {
    margin-top: 4px;
  }

  .parts h3 {
    font-size: var(--step-0);
    font-weight: 600;
  }

  .parts ul {
    display: grid;
    gap: calc(var(--u) * 1);
    margin-top: calc(var(--u) * 2);
  }

  .parts li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--u) * 3);
  }

  .parts li.off label {
    color: var(--muted);
  }

  .parts label {
    min-width: 16ch;
  }

  .redo {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--u) * 3);
    color: var(--muted);
  }

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
