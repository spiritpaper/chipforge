<script lang="ts">
  import { composer } from '../../composer/composer.svelte'
  import { blankInstrument, instrumentUses, type MacroKind } from '../../song/instrument-edit'
  import { PRESET_INSTRUMENTS } from '../../song/instruments'
  import { GB_WAVES } from '../../song/model'
  import MacroEditor from './MacroEditor.svelte'

  const MACROS: { kind: MacroKind; label: string; help: string }[] = [
    {
      kind: 'volume',
      label: 'Volume',
      help: 'How loud each tick is (0–15). With a release point the sound holds there until a release (===) note, then plays the rest.',
    },
    {
      kind: 'duty',
      label: 'Tone',
      help: 'Pulse width per tick: 0 is thin (12.5%), 1 is 25%, 2 is hollow (50%), 3 is 75%. On the noise channel, 1 makes it metallic.',
    },
    {
      kind: 'pitch',
      label: 'Bend',
      help: 'Pitch change per tick, in sixteenths of a semitone. Changes add up, so a row of 4s slides upward.',
    },
    {
      kind: 'arpeggio',
      label: 'Chord',
      help: 'Semitones added on each tick. 0, 4, 7 with a loop from step 1 plays a major chord on one channel.',
    },
  ]

  let tab = $state<MacroKind>('volume')
  let confirmDelete = $state(false)
  let addMenu: HTMLSelectElement

  const hex = (i: number) => i.toString(16).toUpperCase().padStart(2, '0')
  const index = $derived(composer.instrument)
  const inst = $derived(composer.song.instruments[index])
  const current = $derived(MACROS.find((m) => m.kind === tab)!)
  const chip = $derived(composer.song.chip ?? 'nes')
  const help = $derived(
    tab === 'duty' && chip === 'gb'
      ? `Pulse width per tick: 0 is thin (12.5%), 1 is 25%, 2 is hollow (50%), 3 is 75%. On the wave channel it picks the waveform: ${GB_WAVES.map((w, i) => `${i} ${w.toLowerCase()}`).join(', ')}. On noise, 1 makes it metallic.`
      : current.help,
  )
  const uses = $derived(confirmDelete ? instrumentUses(composer.song, index) : 0)
  const full = $derived(composer.song.instruments.length >= 64)

  function add(value: string) {
    const preset = value === 'blank' ? blankInstrument() : PRESET_INSTRUMENTS[value as keyof typeof PRESET_INSTRUMENTS]
    if (preset) composer.addInstrument(preset)
    addMenu.value = ''
  }

  // A pending delete confirmation belongs to one instrument: drop it whenever the
  // selection, or the instrument in this slot (after a delete or undo), changes.
  $effect(() => {
    void [index, inst]
    confirmDelete = false
  })
</script>

<aside class="instruments" aria-labelledby="instruments-title">
  <div class="head">
    <h2 id="instruments-title">Instruments</h2>
    <select bind:this={addMenu} aria-label="Add an instrument" disabled={full} onchange={(e) => add(e.currentTarget.value)}>
      <option value="">{full ? 'Limit of 64 reached' : 'Add…'}</option>
      <option value="blank">Blank</option>
      {#each Object.entries(PRESET_INSTRUMENTS) as [key, preset] (key)}
        <option value={key}>{preset.name}</option>
      {/each}
    </select>
  </div>

  <ul class="list">
    {#each composer.song.instruments as item, i (i)}
      <li>
        <button aria-current={i === index ? 'true' : undefined} onclick={() => composer.selectInstrument(i)} ondblclick={() => composer.tryInstrument(i)}>
          <span class="num">{hex(i)}</span>
          <span class="name">{item.name}</span>
        </button>
      </li>
    {/each}
  </ul>
  <p class="hint">New notes use the selected instrument. In the pattern, <kbd>,</kbd> and <kbd>.</kbd> switch it.</p>

  {#if inst}
    <section class="editor" aria-label="Edit {inst.name}">
      <div class="row">
        <input
          class="rename"
          aria-label="Instrument name"
          value={inst.name}
          onchange={(e) => composer.renameInstrument(index, e.currentTarget.value)}
          onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <button class="key" onclick={() => composer.tryInstrument()} title="Play a test note on the cursor's channel">Try</button>
      </div>
      <div class="row actions">
        <button class="link" onclick={() => composer.duplicateInstrument()} disabled={full}>Duplicate</button>
        {#if composer.song.instruments.length > 1}
          {#if confirmDelete}
            <span class="warn">
              {uses ? `${uses} notes use it and will lose their instrument.` : 'Not used in this song.'}
              <button class="link danger" onclick={() => ((confirmDelete = false), composer.deleteInstrument())}>Delete</button>
              <button class="link" onclick={() => (confirmDelete = false)}>Keep</button>
            </span>
          {:else}
            <button class="link" onclick={() => (confirmDelete = true)}>Delete…</button>
          {/if}
        {/if}
      </div>

      <div class="tabs" role="tablist" aria-label="Shape">
        {#each MACROS as m (m.kind)}
          <button
            role="tab"
            id="tab-{m.kind}"
            aria-selected={tab === m.kind}
            aria-controls="macro-panel"
            onclick={() => (tab = m.kind)}
          >
            {m.label}{#if inst[m.kind].values.length}<span class="dot" aria-label=", in use"></span>{/if}
          </button>
        {/each}
      </div>
      <div id="macro-panel" role="tabpanel" aria-labelledby="tab-{tab}">
        <MacroEditor
          kind={tab}
          {chip}
          macro={inst[tab]}
          onchange={(m, key) => composer.editMacro(index, tab, m, key)}
          ondone={() => composer.tryInstrument()}
        />
        <p class="help">{help}</p>
      </div>
    </section>
  {/if}
</aside>

<style>
  .instruments {
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 2);
    min-height: 0;
    padding: calc(var(--u) * 4);
    border-left: 1px solid var(--line);
    overflow-y: auto;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: calc(var(--u) * 2);
  }

  h2 {
    font-size: var(--step-1);
    font-weight: 600;
  }

  select {
    padding: var(--u) calc(var(--u) * 2);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: var(--ink);
    font: inherit;
    font-size: var(--step--1);
    color: var(--text);
  }

  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 208px;
    overflow-y: auto;
  }

  .list button {
    display: flex;
    gap: calc(var(--u) * 3);
    width: 100%;
    padding: var(--u) calc(var(--u) * 2);
    border: 0;
    border-radius: var(--radius-key);
    background: none;
    text-align: left;
    cursor: pointer;
  }

  .list button:hover {
    background: var(--panel);
  }

  .list button[aria-current='true'] {
    background: var(--line);
  }

  .num {
    font-family: var(--font-data);
    color: var(--muted);
  }

  .hint,
  .help {
    color: var(--muted);
    font-size: var(--step--1);
  }

  .editor {
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 2);
    padding-top: calc(var(--u) * 3);
    border-top: 1px solid var(--line);
  }

  .row {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 2);
  }

  .rename {
    flex: 1;
    min-width: 0;
    padding: var(--u) calc(var(--u) * 2);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: var(--ink);
    font-weight: 600;
  }

  .actions {
    flex-wrap: wrap;
    font-size: var(--step--1);
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    text-decoration: underline;
    cursor: pointer;
    font-size: var(--step--1);
  }

  .link:hover {
    color: var(--text);
  }

  .link:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .danger {
    color: var(--pulse1);
  }

  .warn {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--u) * 2);
    color: var(--text);
  }

  .tabs {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: var(--radius-key);
    background: var(--panel);
  }

  .tabs button {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 4px;
    padding: var(--u);
    border: 0;
    border-radius: 3px;
    background: none;
    color: var(--muted);
    font-size: var(--step--1);
    cursor: pointer;
  }

  .tabs button[aria-selected='true'] {
    background: var(--line);
    color: var(--text);
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
  }
</style>
