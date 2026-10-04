<script lang="ts">
  import { composer } from '../../composer/composer.svelte'
  import SongsDialog from './SongsDialog.svelte'

  const LENGTHS = [16, 32, 48, 64, 96, 128, 192, 256]
  let songsOpen = $state(false)
</script>

<div class="toolbar">
  <input
    class="title"
    aria-label="Song title"
    value={composer.song.title}
    onchange={(e) => composer.setTitle(e.currentTarget.value)}
    onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
  />
  <button class="key" onclick={() => (songsOpen = true)}>Songs</button>

  <div class="group" role="group" aria-label="History">
    <button class="key" onclick={() => composer.undo()} disabled={!composer.canUndo} title="Undo (Ctrl+Z)">Undo</button>
    <button class="key" onclick={() => composer.redo()} disabled={!composer.canRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>
  </div>

  <label class="field">
    Rows
    <select value={composer.song.patternLength} onchange={(e) => composer.setPatternLength(Number(e.currentTarget.value))}>
      {#each LENGTHS as n (n)}<option value={n}>{n}</option>{/each}
    </select>
  </label>

  <div class="field" role="group" aria-label="Octave for note entry">
    Octave
    <button class="key small" onclick={() => composer.setOctave(composer.octave - 1)} title="Octave down ([)" aria-label="Octave down">−</button>
    <output class="mono">{composer.octave}</output>
    <button class="key small" onclick={() => composer.setOctave(composer.octave + 1)} title="Octave up (])" aria-label="Octave up">+</button>
  </div>

  <label class="field" title="Rows the cursor moves after entering a note">
    Step
    <input
      class="mono num"
      type="number"
      min="0"
      max="16"
      value={composer.step}
      onchange={(e) => composer.setStep(e.currentTarget.valueAsNumber)}
    />
  </label>

  <label class="field check">
    <input type="checkbox" checked={composer.follow} onchange={(e) => composer.setFollow(e.currentTarget.checked)} />
    Follow playback
  </label>
</div>

<SongsDialog bind:open={songsOpen} />

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--u) * 3) calc(var(--u) * 5);
  }

  .title {
    min-width: 0;
    width: 18ch;
    margin-left: calc(var(--u) * -2);
    padding: var(--u) calc(var(--u) * 2);
    border: 1px solid transparent;
    border-radius: var(--radius-key);
    background: none;
    font-size: var(--step-3);
    font-weight: 600;
  }

  .title:hover {
    border-color: var(--line);
  }

  .title:focus {
    border-color: var(--muted);
    outline: none;
  }

  .group {
    display: flex;
    gap: var(--u);
  }

  .field {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 2);
    color: var(--muted);
  }

  .small {
    min-width: 32px;
    padding: 0;
  }

  .mono,
  output {
    font-family: var(--font-data);
    color: var(--text);
  }

  .num {
    width: 5ch;
    padding: var(--u);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: var(--ink);
  }

  select {
    padding: var(--u) calc(var(--u) * 2);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: var(--ink);
    font-family: var(--font-data);
    color: var(--text);
  }

  .check input {
    width: 16px;
    height: 16px;
    accent-color: var(--text);
  }
</style>
