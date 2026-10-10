<script lang="ts">
  import { tick, untrack } from 'svelte'
  import { engine } from '../../audio/engine.svelte'
  import { channelsFor } from '../../audio/channels'
  import { composer } from '../../composer/composer.svelte'
  import { segments, type Segment } from '../../lib/grid'
  import { addNote, moveNote, removeNote, resizeNote } from '../../song/roll'
  import { noteName, type Cell } from '../../song/model'

  const KEYS_W = 52
  const NOISE = 3
  /** Pitched channels show C1–C7; the noise channel its 16 sounds. */
  const PITCH_HIGH = 96
  const PITCH_LOW = 24
  const EDGE_PX = 6

  let scroller: HTMLDivElement
  let viewWidth = $state(0)
  let tool = $state<'draw' | 'erase'>('draw')
  let defaultLength = 2

  const channel = $derived(composer.cursor.channel)
  const isNoise = $derived(channel === NOISE)
  const rowH = $derived(isNoise ? 20 : 12)
  const high = $derived(isNoise ? 15 : PITCH_HIGH)
  const low = $derived(isNoise ? 0 : PITCH_LOW)
  const pitches = $derived(Array.from({ length: high - low + 1 }, (_, i) => high - i))
  const length = $derived(composer.song.patternLength)
  const cellW = $derived(Math.max(12, Math.floor((viewWidth - KEYS_W) / length)))
  const pattern = $derived(composer.song.patterns[composer.patternIndex])
  const cells = $derived(pattern.channels[channel])
  const notes = $derived(segments(cells))
  const ghosts = $derived(
    isNoise ? [] : [0, 1, 2].filter((ch) => ch !== channel).flatMap((ch) => segments(pattern.channels[ch]).map((s) => ({ ...s, ch }))),
  )
  const playRow = $derived(engine.position?.order === composer.orderIndex ? engine.position.row : -1)
  const beat = $derived(composer.song.rowsPerBeat)

  /** The row in the roll a note is drawn on. */
  const lane = (note: number) => (isNoise ? note % 16 : note)
  const y = (note: number) => (high - lane(note)) * rowH
  const isBlack = (p: number) => [1, 3, 6, 8, 10].includes(p % 12)
  const label = (note: number) => (isNoise ? `${(note % 16).toString(16).toUpperCase()}-#` : noteName(note))

  // Centre the view on this channel's notes when switching channels, but not on every
  // edit: only the channel is tracked.
  $effect(() => {
    void channel
    untrack(() => {
      const mid = notes.length ? notes.reduce((s, n) => s + lane(n.note), 0) / notes.length : isNoise ? 8 : 60
      tick().then(() => {
        if (scroller) scroller.scrollTop = (high - mid) * rowH - scroller.clientHeight / 2
      })
    })
  })

  // ---- pointer editing ---------------------------------------------------

  type Drag =
    | { kind: 'draw'; start: number; note: number }
    | { kind: 'move'; seg: Segment; offset: number; note: number }
    | { kind: 'resize'; seg: Segment }

  let drag: { mode: Drag; snapshot: Cell[]; key: string } | null = null
  let dragCount = 0
  let previewTimer: ReturnType<typeof setTimeout> | undefined

  function point(e: PointerEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const row = Math.min(length - 1, Math.max(0, Math.floor(x / cellW)))
    const pitch = Math.min(high, Math.max(low, high - Math.floor((e.clientY - rect.top) / rowH)))
    return { x, row, pitch }
  }

  function preview(note: number) {
    clearTimeout(previewTimer)
    composer.preview(note, channel)
    previewTimer = setTimeout(() => composer.previewOff(channel), 260)
  }

  function onpointerdown(e: PointerEvent) {
    const { x, row, pitch } = point(e)
    const hit = notes.find((s) => row >= s.start && row < s.start + s.length && lane(s.note) === pitch)
    if (tool === 'erase' || e.button === 2 || e.altKey) {
      if (hit) composer.editChannel(channel, removeNote(cells, hit.start))
      return
    }
    if (e.button !== 0) return
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const key = `drag:roll:${++dragCount}`
    if (hit) {
      const nearEnd = x > (hit.start + hit.length) * cellW - EDGE_PX
      drag = {
        mode: nearEnd ? { kind: 'resize', seg: hit } : { kind: 'move', seg: hit, offset: row - hit.start, note: hit.note },
        snapshot: cells,
        key,
      }
      preview(hit.note)
      return
    }
    drag = { mode: { kind: 'draw', start: row, note: pitch }, snapshot: cells, key }
    composer.editChannel(channel, addNote(cells, row, defaultLength, pitch, composer.instrument), key)
    preview(pitch)
  }

  function onpointermove(e: PointerEvent) {
    if (!drag) return
    const { row, pitch } = point(e)
    const { mode, snapshot, key } = drag
    if (mode.kind === 'draw') {
      const len = Math.max(1, row - mode.start + 1)
      composer.editChannel(channel, addNote(snapshot, mode.start, len, mode.note, composer.instrument), key)
    } else if (mode.kind === 'resize') {
      composer.editChannel(channel, resizeNote(snapshot, mode.seg.start, Math.max(1, row - mode.seg.start + 1)), key)
    } else {
      if (pitch !== mode.note) {
        mode.note = pitch
        preview(pitch)
      }
      composer.editChannel(channel, moveNote(snapshot, mode.seg.start, row - mode.offset, pitch), key)
    }
  }

  function onpointerup() {
    if (drag?.mode.kind === 'draw') {
      const seg = segments(cells).find((s) => s.start === (drag!.mode as { start: number }).start)
      if (seg) defaultLength = seg.length
    }
    drag = null
  }

  // ---- keyboard editing of a focused note --------------------------------

  async function onNoteKey(e: KeyboardEvent, seg: Segment) {
    let next: Cell[] | null = null
    let focusStart = seg.start
    const top = isNoise ? 15 : 127
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        next = removeNote(cells, seg.start)
        break
      case 'ArrowUp':
      case 'ArrowDown': {
        const delta = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey && !isNoise ? 12 : 1)
        const note = Math.min(top, Math.max(0, seg.note + delta))
        next = moveNote(cells, seg.start, seg.start, isNoise ? note % 16 : note)
        preview(note)
        break
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        const delta = e.key === 'ArrowRight' ? 1 : -1
        if (e.shiftKey) next = resizeNote(cells, seg.start, Math.max(1, seg.length + delta))
        else {
          focusStart = Math.min(length - 1, Math.max(0, seg.start + delta))
          next = moveNote(cells, seg.start, focusStart, seg.note)
        }
        break
      }
      default:
        return
    }
    e.preventDefault()
    e.stopPropagation()
    composer.editChannel(channel, next)
    await tick()
    scroller.querySelector<SVGElement>(`[data-start="${focusStart}"]`)?.focus()
  }
</script>

<div class="roll">
  <div class="tools">
    <div class="channels" role="radiogroup" aria-label="Channel to edit">
      {#each channelsFor(composer.song.chip) as info, ch (info.name)}
        <button
          role="radio"
          aria-checked={ch === channel}
          style:--c={info.color}
          onclick={() => composer.setCursor({ channel: ch, column: 0 })}
        >
          {info.name}
        </button>
      {/each}
    </div>
    <div class="tool" role="radiogroup" aria-label="Tool">
      <button role="radio" aria-checked={tool === 'draw'} onclick={() => (tool = 'draw')}>Draw</button>
      <button role="radio" aria-checked={tool === 'erase'} onclick={() => (tool = 'erase')}>Erase</button>
    </div>
    <p class="hint">
      Drag to draw a note, drag a note to move it, drag its end to resize, right-click to erase. Focused notes
      move with the arrow keys; Shift+←/→ resizes, Delete removes.
    </p>
  </div>

  <div class="scroller" bind:this={scroller} bind:clientWidth={viewWidth}>
    <div class="canvas" style:height="{pitches.length * rowH}px">
      <svg class="keys" width={KEYS_W} height={pitches.length * rowH} aria-hidden="true">
        {#each pitches as p, i (p)}
          <rect class:black={!isNoise && isBlack(p)} y={i * rowH} width={KEYS_W} height={rowH} />
          {#if isNoise || p % 12 === 0}
            <text x={KEYS_W - 6} y={i * rowH + rowH / 2}>{isNoise ? `${p.toString(16).toUpperCase()}-#` : noteName(p)}</text>
          {/if}
        {/each}
      </svg>

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <svg
        class="grid"
        class:erase={tool === 'erase'}
        width={length * cellW}
        height={pitches.length * rowH}
        style:--c={channelsFor(composer.song.chip)[channel].color}
        {onpointerdown}
        {onpointermove}
        {onpointerup}
        oncontextmenu={(e) => e.preventDefault()}
      >
        {#each pitches as p, i (p)}
          <rect class="lane" class:black={!isNoise && isBlack(p)} class:octave={!isNoise && p % 12 === 0} y={i * rowH} width={length * cellW} height={rowH} />
        {/each}
        {#each { length: Math.ceil(length / beat) } as _, b (b)}
          <rect class={b % 4 === 0 ? 'bar' : 'beat'} x={b * beat * cellW} y="0" width="1" height={pitches.length * rowH} />
        {/each}
        {#each ghosts as g (`${g.ch}:${g.start}`)}
          {#if g.note <= high && g.note >= low}
            <rect class="ghost" style:--g={channelsFor(composer.song.chip)[g.ch].color} x={g.start * cellW} y={y(g.note) + 2} width={g.length * cellW - 1} height={rowH - 4} />
          {/if}
        {/each}
        {#if playRow >= 0}
          <rect class="playhead" x={playRow * cellW} y="0" width={cellW} height={pitches.length * rowH} />
        {/if}
        {#each notes as seg (seg.start)}
          {#if lane(seg.note) <= high && lane(seg.note) >= low}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <g
              class="note"
              class:playing={playRow >= seg.start && playRow < seg.start + seg.length}
              tabindex="0"
              role="button"
              data-start={seg.start}
              aria-label="{label(seg.note)}, row {seg.start}, {seg.length} {seg.length === 1 ? 'row' : 'rows'}"
              onkeydown={(e) => onNoteKey(e, seg)}
            >
              <rect x={seg.start * cellW} y={y(seg.note)} width={seg.length * cellW - 1} height={rowH - 1} rx="2" />
              {#if seg.length * cellW > 34 && rowH >= 12}
                <text x={seg.start * cellW + 4} y={y(seg.note) + rowH / 2}>{label(seg.note)}</text>
              {/if}
            </g>
          {/if}
        {/each}
      </svg>
    </div>
  </div>
</div>

<style>
  .roll {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--u) * 2) calc(var(--u) * 4);
    padding: calc(var(--u) * 2) calc(var(--u) * 4);
    border-bottom: 1px solid var(--line);
  }

  .channels,
  .tool {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: var(--radius-key);
    background: var(--panel);
  }

  .tools button {
    padding: var(--u) calc(var(--u) * 3);
    border: 0;
    border-radius: 3px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }

  .channels button[aria-checked='true'] {
    background: var(--line);
    color: var(--c);
    box-shadow: inset 0 -2px 0 var(--c);
  }

  .tool button[aria-checked='true'] {
    background: var(--line);
    color: var(--text);
  }

  .hint {
    flex: 1 1 320px;
    color: var(--muted);
    font-size: var(--step--1);
  }

  .scroller {
    flex: 1;
    overflow: auto;
    min-height: 240px;
  }

  .canvas {
    display: flex;
    width: max-content;
  }

  .keys {
    position: sticky;
    left: 0;
    z-index: 1;
    flex: none;
    background: var(--panel);
    border-right: 1px solid var(--line);
  }

  .keys rect {
    fill: var(--panel);
  }

  .keys rect.black {
    fill: var(--ink);
  }

  .keys text {
    fill: var(--muted);
    font-family: var(--font-data);
    font-size: 10px;
    text-anchor: end;
    dominant-baseline: middle;
  }

  .grid {
    flex: none;
    touch-action: none;
    cursor: crosshair;
  }

  .grid.erase {
    cursor: not-allowed;
  }

  .lane {
    fill: var(--ink);
  }

  .lane.black {
    fill: #18162f;
  }

  .lane.octave {
    stroke: var(--line);
    stroke-width: 0.5;
  }

  .beat {
    fill: var(--line);
    opacity: 0.45;
  }

  .bar {
    fill: var(--muted);
    opacity: 0.45;
  }

  .ghost {
    fill: var(--g);
    opacity: 0.18;
  }

  .playhead {
    fill: var(--text);
    opacity: 0.08;
  }

  .note rect {
    fill: var(--c);
    opacity: 0.8;
    cursor: grab;
  }

  .note.playing rect {
    opacity: 1;
  }

  .note:focus {
    outline: none;
  }

  .note:focus-visible rect {
    stroke: var(--text);
    stroke-width: 2;
  }

  .note text {
    fill: var(--ink);
    font-family: var(--font-data);
    font-size: 10px;
    dominant-baseline: middle;
    pointer-events: none;
  }
</style>
