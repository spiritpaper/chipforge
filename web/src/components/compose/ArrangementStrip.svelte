<script lang="ts">
  import { engine } from '../../audio/engine.svelte'
  import { CHANNELS } from '../../audio/channels'
  import { composer } from '../../composer/composer.svelte'
  import {
    addPatternAfter,
    duplicatePatternAt,
    moveEntry,
    patternUses,
    removeEntry,
    repeatAt,
    setEntryPattern,
    setLoopPoint,
  } from '../../song/arrange'
  import { LIMITS } from '../../song/model'
  import { BEATS, type BeatName } from '../../song/beats'
  import { readPref, writePref } from '../../lib/prefs'

  const hex = (i: number) => i.toString(16).toUpperCase().padStart(2, '0')
  const song = $derived(composer.song)
  const at = $derived(composer.orderIndex)
  const uses = $derived(patternUses(song))
  const full = $derived(song.order.length >= LIMITS.order)

  /** Note starts per channel, as x positions 0..1, for the little block previews. */
  const previews = $derived(
    song.patterns.map((p) =>
      p.channels.map((cells) => cells.flatMap((c, row) => (c.note !== null && c.note >= 0 ? [row / song.patternLength] : []))),
    ),
  )
  const playingAt = $derived(engine.playing && engine.position ? engine.position.order : -1)
  const progress = $derived(engine.position ? engine.position.row / song.patternLength : 0)

  let dragFrom: number | null = null
  let beat = $state<BeatName>((readPref('compose.beat') as BeatName) in BEATS ? (readPref('compose.beat') as BeatName) : 'rock')
  $effect(() => writePref('compose.beat', beat))

  function ondrop(e: DragEvent, to: number) {
    e.preventDefault()
    if (dragFrom !== null) composer.arrange(moveEntry(song, dragFrom, to), to)
    dragFrom = null
  }
</script>

<section class="arrangement" aria-labelledby="arrangement-title">
  <div class="head">
    <h2 id="arrangement-title">Song order</h2>
    <p class="hint">Each block plays one pattern. Drag blocks to reorder; the song returns to the loop mark when it ends.</p>
  </div>

  <ol class="blocks">
    {#each song.order as pattern, i (i)}
      <li
        class:current={i === at}
        class:playing={i === playingAt}
        draggable="true"
        ondragstart={() => (dragFrom = i)}
        ondragover={(e) => e.preventDefault()}
        ondrop={(e) => ondrop(e, i)}
      >
        {#if i === song.loopPoint}<span class="loop" title="The song loops back to here">Loop</span>{/if}
        <button
          onclick={() => composer.goToOrder(i)}
          aria-current={i === at ? 'true' : undefined}
          aria-label="Part {i + 1}: pattern {hex(pattern)}{uses[pattern] > 1 ? `, used ${uses[pattern]} times` : ''}{i === song.loopPoint ? ', loop start' : ''}"
        >
          <span class="num">{hex(pattern)}</span>
          <svg class="preview" viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden="true">
            {#each previews[pattern] as starts, ch (ch)}
              {#each starts as x, k (k)}
                <rect x={x * 100} y={ch * 4} width="2" height="3" style:fill={CHANNELS[ch].color} />
              {/each}
            {/each}
          </svg>
          {#if uses[pattern] > 1}<span class="shared" title="This pattern plays in {uses[pattern]} places; editing it changes all of them">×{uses[pattern]}</span>{/if}
          {#if i === playingAt}<span class="progress" style:width="{progress * 100}%"></span>{/if}
        </button>
      </li>
    {/each}
  </ol>

  <div class="actions" role="group" aria-label="Change part {at + 1}">
    <button class="key" onclick={() => composer.arrange(addPatternAfter(song, at), at + 1)} disabled={full} title="Add an empty pattern after this one">New pattern</button>
    <button class="key" onclick={() => composer.arrange(duplicatePatternAt(song, at), at + 1)} disabled={full} title="Copy this pattern into a new one you can change separately">Duplicate</button>
    <button class="key" onclick={() => composer.arrange(repeatAt(song, at), at + 1)} disabled={full} title="Play this same pattern again; edits change both">Repeat</button>
    <span class="sep"></span>
    <button class="key" onclick={() => composer.arrange(moveEntry(song, at, at - 1), at - 1)} disabled={at === 0} aria-label="Move earlier" title="Move earlier">←</button>
    <button class="key" onclick={() => composer.arrange(moveEntry(song, at, at + 1), at + 1)} disabled={at >= song.order.length - 1} aria-label="Move later" title="Move later">→</button>
    <label class="field" title="Which pattern this part plays">
      Plays
      <select
        value={song.order[at]}
        onchange={(e) => composer.arrange(setEntryPattern(song, at, Number(e.currentTarget.value)))}
      >
        {#each song.patterns as _, p (p)}
          <option value={p}>Pattern {hex(p)}{uses[p] === 0 ? ' (unused)' : ''}</option>
        {/each}
        {#if song.patterns.length < LIMITS.patterns}
          <option value={song.patterns.length}>New empty pattern</option>
        {/if}
      </select>
    </label>
    <button class="key" onclick={() => composer.arrange(setLoopPoint(song, at))} disabled={song.loopPoint === at}>Loop from here</button>
    <button class="key" onclick={() => composer.arrange(removeEntry(song, at), Math.min(at, song.order.length - 2))} disabled={song.order.length <= 1}>Remove</button>
    <span class="sep"></span>
    <label class="field" title="Fill the drums (noise channel) with a ready-made beat">
      Beat
      <select bind:value={beat}>
        {#each Object.entries(BEATS) as [id, b] (id)}<option value={id}>{b.label}</option>{/each}
      </select>
    </label>
    <button class="key" onclick={() => composer.addBeat(beat, false)} title="Replace this part's drums with the beat">This part</button>
    <button class="key" onclick={() => composer.addBeat(beat, true)} title="Replace the drums in every part with the beat">Every part</button>
  </div>
</section>

<style>
  .arrangement {
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 2);
  }

  .head {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: calc(var(--u) * 3);
  }

  h2 {
    font-size: var(--step-0);
    font-weight: 600;
  }

  .hint {
    color: var(--muted);
    font-size: var(--step--1);
  }

  .blocks {
    display: flex;
    gap: calc(var(--u) * 2);
    margin: 0;
    padding: calc(var(--u) * 4) 0 var(--u);
    list-style: none;
    overflow-x: auto;
  }

  li {
    position: relative;
    flex: none;
  }

  li button {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: calc(var(--u) * 2);
    width: 112px;
    height: 36px;
    padding: 0 calc(var(--u) * 2);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: var(--panel);
    overflow: hidden;
    cursor: grab;
  }

  li.current button {
    border-color: var(--text);
    background: var(--line);
  }

  .num {
    font-family: var(--font-data);
  }

  .preview {
    width: 100%;
    height: 16px;
  }

  .shared {
    position: absolute;
    top: 1px;
    right: 4px;
    font-size: 10px;
    color: var(--muted);
  }

  .progress {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    background: var(--text);
  }

  .loop {
    position: absolute;
    top: calc(var(--u) * -4);
    left: 0;
    padding: 0 var(--u);
    border-radius: 2px;
    background: var(--tri);
    color: var(--ink);
    font-size: 10px;
    line-height: 14px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--u) * 2);
  }

  .actions .key {
    min-height: 28px;
    padding: 0 calc(var(--u) * 2);
    font-size: var(--step--1);
  }

  .sep {
    width: 1px;
    height: 20px;
    background: var(--line);
  }

  .field {
    display: flex;
    align-items: center;
    gap: var(--u);
    color: var(--muted);
    font-size: var(--step--1);
  }

  .field select {
    padding: 2px var(--u);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: var(--ink);
    font: inherit;
    color: var(--text);
  }
</style>
