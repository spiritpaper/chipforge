<script lang="ts">
  import { engine } from '../audio/engine.svelte'
  import PixelIcon from './PixelIcon.svelte'
  import type { Mode } from '../lib/hash'
  import { lab } from '../sfx/lab.svelte'
  import { composer } from '../composer/composer.svelte'
  import { converter } from '../convert/converter.svelte'

  let { mode }: { mode: Mode } = $props()

  const statusText = $derived(
    engine.status === 'loading'
      ? 'Starting the chip…'
      : engine.status === 'error'
        ? `Audio could not start: ${engine.error}. Reload the page to try again.`
        : '',
  )
</script>

<header class="transport">
  {#if mode === 'sfx'}
    <button
      class="key play"
      onclick={() => lab.play()}
      disabled={engine.status === 'loading' || lab.status !== 'ready'}
      title="Play the current sound (Space)"
    >
      <PixelIcon name="play" />
      <span>Play</span>
      <kbd>Space</kbd>
    </button>
  {:else if mode === 'convert'}
    <button
      class="key play"
      onclick={() => converter.togglePlay()}
      aria-pressed={converter.playing || converter.chipPlaying}
      disabled={!converter.audio}
      title="Play or pause (Space)"
    >
      <PixelIcon name={converter.playing || converter.chipPlaying ? 'stop' : 'play'} />
      <span>{converter.playing || converter.chipPlaying ? 'Pause' : 'Play'}</span>
      <kbd>Space</kbd>
    </button>
  {:else if mode === 'compose'}
    <button
      class="key play"
      onclick={() => composer.togglePlay()}
      aria-pressed={engine.playing}
      disabled={engine.status === 'loading'}
      title="Play from the start of this pattern, or stop (Space). Enter plays from the cursor."
    >
      <PixelIcon name={engine.playing ? 'stop' : 'play'} />
      <span>{engine.playing ? 'Stop' : 'Play'}</span>
      <kbd>Space</kbd>
    </button>
    <label class="field check" title="Repeat the pattern you're editing instead of playing the whole song">
      <input type="checkbox" checked={engine.loopPattern} onchange={(e) => engine.setLoopPattern(e.currentTarget.checked)} />
      Loop pattern
    </label>
    <div class="field">
      <label for="bpm">Tempo</label>
      <input
        id="bpm"
        type="number"
        min="30"
        max="300"
        value={composer.song.bpm}
        onchange={(e) => composer.setBpm(e.currentTarget.valueAsNumber)}
      />
      <span class="unit">BPM</span>
    </div>
    <div class="field" title="Ticks per row: lower is faster. Effects and instruments step once per tick.">
      <label for="speed">Speed</label>
      <input
        id="speed"
        type="number"
        min="1"
        max="31"
        value={composer.song.speed}
        onchange={(e) => composer.setSpeed(e.currentTarget.valueAsNumber)}
      />
    </div>
  {/if}


  <div class="field">
    <label for="volume"><PixelIcon name="volume" /><span class="visually-hidden">Volume</span></label>
    <input
      id="volume"
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={engine.volume}
      oninput={(e) => engine.setVolume(e.currentTarget.valueAsNumber)}
    />
  </div>

  <p class="chip" title="The sound chip being emulated">NES (2A03)</p>

  <p class="status" role="status">{statusText}</p>
</header>

<style>
  .transport {
    grid-area: transport;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--u) * 6);
    padding: calc(var(--u) * 3) calc(var(--u) * 6);
    border-bottom: 1px solid var(--line);
  }

  .play {
    min-width: 132px;
    min-height: 40px;
    font-size: var(--step-1);
  }

  .play[aria-pressed='true'] {
    background: var(--text);
    color: var(--ink);
  }

  .play[aria-pressed='true'] kbd {
    color: var(--line);
  }

  .field {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 2);
    color: var(--muted);
  }

  .field label {
    display: flex;
  }

  input[type='number'] {
    width: 4ch;
    padding: var(--u) 0;
    border: 0;
    background: none;
    font-family: var(--font-data);
    font-size: var(--step-2);
    text-align: center;
    color: var(--text);
    appearance: textfield;
  }

  .check input {
    width: 16px;
    height: 16px;
    accent-color: var(--text);
  }

  input[type='number']::-webkit-inner-spin-button {
    appearance: none;
  }

  .unit {
    font-size: var(--step--1);
  }

  input[type='range'] {
    width: 112px;
    accent-color: var(--text);
  }

  .chip {
    padding: var(--u) calc(var(--u) * 2);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    font-size: var(--step--1);
    color: var(--muted);
  }

  .status {
    flex-basis: 100%;
    color: var(--muted);
    font-size: var(--step--1);
  }

  .status:empty {
    display: none;
  }

  @media (max-width: 720px) {
    .transport {
      gap: calc(var(--u) * 3);
      padding: calc(var(--u) * 3) calc(var(--u) * 4);
    }

    .chip,
    kbd {
      display: none;
    }
  }
</style>
