<script lang="ts">
  import { converter } from '../../convert/converter.svelte'
  import PixelIcon from '../PixelIcon.svelte'
  import LofiPanel from './LofiPanel.svelte'
  import Overview from './Overview.svelte'
  import ChipPanel from './ChipPanel.svelte'

  let fileInput: HTMLInputElement
  let dragging = $state(false)

  function pick(files: FileList | null | undefined) {
    const file = files?.[0]
    if (file) void converter.load(file)
  }

  function ondrop(e: DragEvent) {
    e.preventDefault()
    dragging = false
    pick(e.dataTransfer?.files)
  }
</script>

<div class="convert" role="region" aria-label="Convert" ondragover={(e) => { e.preventDefault(); dragging = true }} ondragleave={() => (dragging = false)} {ondrop}>
  <input bind:this={fileInput} type="file" accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a" hidden onchange={(e) => pick(e.currentTarget.files)} />

  {#if !converter.audio}
    <div class="drop" class:dragging>
      <h1>Turn a song into 8-bit</h1>
      <p>Drop an audio file here, or choose one. MP3, WAV, OGG, FLAC and M4A all work.</p>
      <button class="key big" onclick={() => fileInput.click()} disabled={converter.status === 'decoding'}>
        {converter.status === 'decoding' ? 'Opening…' : 'Choose a file'}
      </button>
      <p class="private">Your file stays on this device: nothing is uploaded.</p>
      {#if converter.error}<p class="error" role="alert">{converter.error}</p>{/if}
    </div>
  {:else}
    <header class="head">
      <div>
        <h1>{converter.audio.name}</h1>
        <p class="sub">Everything happens on this device. Nothing is uploaded.</p>
      </div>
      <button class="key" onclick={() => fileInput.click()}>Choose another file</button>
    </header>
    {#if converter.error}<p class="error" role="alert">{converter.error}</p>{/if}

    <div class="modes" role="tablist" aria-label="Kind of conversion">
      <button role="tab" aria-selected={converter.mode === 'lofi'} onclick={() => converter.setMode('lofi')}>
        <span class="mode-name">Lo-fi filter</span>
        <span class="mode-desc">Instant crunch. Keeps the original recording.</span>
      </button>
      <button role="tab" aria-selected={converter.mode === 'chip'} onclick={() => converter.setMode('chip')}>
        <span class="mode-name">Chip version</span>
        <span class="mode-desc">Notes replayed on the NES chip. Editable in Compose.</span>
      </button>
    </div>

    <div class="player">
      <div class="ab" role="radiogroup" aria-label="Listen to" title="Compare (B)">
        <button role="radio" aria-checked={!converter.original} disabled={converter.mode === 'chip' && !converter.result} onclick={() => converter.compare(false)}>{converter.mode === 'chip' ? 'Chip version' : '8-bit'}</button>
        <button role="radio" aria-checked={converter.original} onclick={() => converter.compare(true)}>Original</button>
      </div>
      <span class="hint">Space plays, B compares, ←/→ on the waveform jumps 5 seconds</span>
    </div>
    <Overview />

    {#if converter.mode === 'chip'}
      <ChipPanel />
    {:else}
    <LofiPanel />

    <section class="export" aria-labelledby="convert-export">
      <h2 id="convert-export">Save the 8-bit version</h2>
      <div class="formats" role="radiogroup" aria-label="Format">
        <label><input type="radio" bind:group={converter.exportFormat} value="wav" /> WAV</label>
        <label><input type="radio" bind:group={converter.exportFormat} value="ogg" /> OGG Vorbis</label>
      </div>
      <button class="key" onclick={() => converter.exportFile()} disabled={converter.exporting}>
        <PixelIcon name="download" />
        {converter.exporting ? 'Rendering…' : 'Download'}
      </button>
    </section>
    {/if}
  {/if}
</div>

<style>
  .convert {
    grid-area: work;
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 6);
    padding: calc(var(--u) * 8) calc(var(--u) * 6);
    overflow-y: auto;
    min-width: 0;
  }

  .drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: calc(var(--u) * 4);
    min-height: 360px;
    padding: calc(var(--u) * 8);
    border: 2px dashed var(--line);
    border-radius: var(--radius-key);
    text-align: center;
  }

  .drop.dragging {
    border-color: var(--pulse1);
    background: var(--panel);
  }

  h1 {
    font-size: var(--step-4);
    font-weight: 600;
    line-height: 1.1;
  }

  .drop p,
  .sub {
    color: var(--muted);
    max-width: 52ch;
  }

  .big {
    min-height: 48px;
    padding: 0 calc(var(--u) * 6);
    font-size: var(--step-1);
  }

  .private {
    font-size: var(--step--1);
  }

  .error {
    color: var(--pulse1);
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: calc(var(--u) * 4);
  }

  .modes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: calc(var(--u) * 2);
  }

  .modes button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--u);
    padding: calc(var(--u) * 3) calc(var(--u) * 4);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: none;
    text-align: left;
    cursor: pointer;
  }

  .modes button[aria-selected='true'] {
    border-color: var(--text);
    background: var(--panel);
  }

  .mode-name {
    font-weight: 600;
  }

  .mode-desc {
    color: var(--muted);
    font-size: var(--step--1);
  }

  .player {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--u) * 4);
    margin-bottom: calc(var(--u) * -3);
  }

  .ab {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: var(--radius-key);
    background: var(--panel);
  }

  .ab button {
    padding: var(--u) calc(var(--u) * 3);
    border: 0;
    border-radius: 3px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }

  .ab button[aria-checked='true'] {
    background: var(--line);
    color: var(--text);
  }

  .hint {
    color: var(--muted);
    font-size: var(--step--1);
  }

  .export {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--u) * 4);
    padding-top: calc(var(--u) * 5);
    border-top: 1px solid var(--line);
  }

  h2 {
    font-size: var(--step-1);
    font-weight: 600;
  }

  .formats {
    display: flex;
    gap: calc(var(--u) * 4);
  }

  .formats input {
    accent-color: var(--text);
  }

  @media (max-width: 720px) {
    .convert {
      padding: calc(var(--u) * 6) calc(var(--u) * 4);
    }
  }
</style>
