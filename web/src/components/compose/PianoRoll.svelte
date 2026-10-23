<script lang="ts">
  import { tick, untrack } from 'svelte'
  import { engine } from '../../audio/engine.svelte'
  import { channelsFor } from '../../audio/channels'
  import { composer } from '../../composer/composer.svelte'
  import { segments, type Segment } from '../../lib/grid'
  import { addNote, clampShift, copyNotes, moveNotes, pasteNotes, removeNotes, resizeNotes, type NoteClip } from '../../song/roll'
  import { noteName, type Cell } from '../../song/model'
  import { ROOT_NAMES, SCALES, detectKey, inScale, isScaleName, keyLabel, snapToScale } from '../../song/scales'
  import { readPref, writePref } from '../../lib/prefs'
  import { toast } from '../../lib/toast.svelte'

  const KEYS_W = 52
  const NOISE = 3
  /** Pitched channels show C1–C7; the noise channel its 16 sounds. */
  const PITCH_HIGH = 96
  const PITCH_LOW = 24
  const EDGE_PX = 6

  let scroller: HTMLDivElement
  let viewWidth = $state(0)
  let tool = $state<'draw' | 'select' | 'erase'>('draw')
  let helpOpen = $state(false)
  let defaultLength = 2

  // ---- key and scale -----------------------------------------------------

  const key = $derived(composer.song.key ?? null)
  let snap = $state(readPref('compose.snap') === 'on')
  /** Pitched notes in the key, when one is set and snapping is on. */
  const tune = (pitch: number) => (snap && key && !isNoise ? snapToScale(pitch, key) : pitch)

  function setSnap(on: boolean) {
    snap = on
    writePref('compose.snap', on ? 'on' : 'off')
  }

  function findKey() {
    const found = detectKey(composer.song)
    if (!found) return toast.show('Write a few more notes first: there is not enough to tell the key.')
    composer.setKey(found)
    toast.show(`This song sounds like ${keyLabel(found)}.`)
  }

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

  // ---- selection ---------------------------------------------------------

  /** Starts of the selected notes on this channel. */
  let selected = $state.raw<Set<number>>(new Set())
  /** Notes copied with Ctrl+C, shared between channels. */
  let clip: NoteClip | null = null

  // A selection belongs to one channel of one pattern. (A derived key, so edits to
  // the song, which the pattern index is read through, don't clear it.)
  const place = $derived(`${channel}:${composer.patternIndex}`)
  $effect(() => {
    void place
    selected = new Set()
  })

  const selectedStarts = () => notes.filter((n) => selected.has(n.start)).map((n) => n.start)

  /** Noise notes play note % 16; editing works on that value so shifts stay in range. */
  const editable = (c: readonly Cell[]) =>
    isNoise ? c.map((cell) => (cell.note !== null && cell.note > 15 ? { ...cell, note: cell.note % 16 } : cell)) : c.slice()

  // ---- pointer editing ---------------------------------------------------

  type Drag =
    | { kind: 'draw'; start: number; note: number }
    | { kind: 'move'; starts: number[]; row: number; pitch: number; lead: number; shift: number; clicked: number; moved: boolean }
    | { kind: 'resize'; starts: number[]; end: number }
    | { kind: 'box'; x0: number; y0: number; x1: number; y1: number; base: Set<number> }

  let drag = $state.raw<{ mode: Drag; snapshot: Cell[]; key: string } | null>(null)
  let dragCount = 0
  let previewTimer: ReturnType<typeof setTimeout> | undefined

  function point(e: PointerEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const yPx = e.clientY - rect.top
    const row = Math.min(length - 1, Math.max(0, Math.floor(x / cellW)))
    const pitch = Math.min(high, Math.max(low, high - Math.floor(yPx / rowH)))
    return { x, y: yPx, row, pitch }
  }

  function preview(note: number) {
    clearTimeout(previewTimer)
    composer.preview(note, channel)
    previewTimer = setTimeout(() => composer.previewOff(channel), 260)
  }

  function inBox(seg: Segment, box: { x0: number; y0: number; x1: number; y1: number }) {
    const [left, right] = [Math.min(box.x0, box.x1), Math.max(box.x0, box.x1)]
    const [top, bottom] = [Math.min(box.y0, box.y1), Math.max(box.y0, box.y1)]
    const ny = y(seg.note)
    return seg.start * cellW < right && (seg.start + seg.length) * cellW > left && ny < bottom && ny + rowH > top
  }

  function onpointerdown(e: PointerEvent) {
    const { x, y: yPx, row, pitch } = point(e)
    const hit = notes.find((s) => row >= s.start && row < s.start + s.length && lane(s.note) === pitch)
    if (tool === 'erase' || e.button === 2 || e.altKey) {
      if (hit) {
        const starts = selected.has(hit.start) ? selectedStarts() : [hit.start]
        composer.editChannel(channel, removeNotes(cells, starts))
        selected = new Set([...selected].filter((s) => !starts.includes(s)))
      }
      return
    }
    if (e.button !== 0) return
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    if (!hit) scroller.focus({ preventScroll: true })
    composer.setCursor({ row })
    const dragKey = `drag:roll:${++dragCount}`
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    const snapshot = editable(cells)

    if (hit && additive) {
      const next = new Set(selected)
      if (next.has(hit.start)) next.delete(hit.start)
      else next.add(hit.start)
      selected = next
      return
    }
    if (hit) {
      const group = selected.has(hit.start) ? selectedStarts() : [hit.start]
      if (!selected.has(hit.start)) selected = new Set([hit.start])
      if (x > (hit.start + hit.length) * cellW - EDGE_PX) {
        drag = { mode: { kind: 'resize', starts: group, end: hit.start + hit.length - 1 }, snapshot, key: dragKey }
      } else {
        const lead = lane(hit.note)
        drag = { mode: { kind: 'move', starts: group, row, pitch, lead, shift: 0, clicked: hit.start, moved: false }, snapshot, key: dragKey }
      }
      preview(hit.note)
      return
    }
    if (tool === 'select' || additive) {
      drag = { mode: { kind: 'box', x0: x, y0: yPx, x1: x, y1: yPx, base: additive ? new Set(selected) : new Set() }, snapshot, key: dragKey }
      if (!additive) selected = new Set()
      return
    }
    selected = new Set()
    const note = tune(pitch)
    drag = { mode: { kind: 'draw', start: row, note }, snapshot, key: dragKey }
    composer.editChannel(channel, addNote(cells, row, defaultLength, note, composer.instrument), dragKey)
    preview(note)
  }

  function onpointermove(e: PointerEvent) {
    if (!drag) return
    const { x, y: yPx, row, pitch } = point(e)
    const { mode, snapshot, key } = drag
    if (mode.kind === 'draw') {
      const len = Math.max(1, row - mode.start + 1)
      composer.editChannel(channel, addNote(snapshot, mode.start, len, mode.note, composer.instrument), key)
    } else if (mode.kind === 'resize') {
      composer.editChannel(channel, resizeNotes(snapshot, mode.starts, row - mode.end), key)
    } else if (mode.kind === 'move') {
      const shift = clampShift(snapshot, mode.starts, row - mode.row, tune(mode.lead + pitch - mode.pitch) - mode.lead, low, high)
      if (!shift.rows && !shift.semitones && !mode.moved) return
      mode.moved = true
      if (shift.semitones !== mode.shift) {
        mode.shift = shift.semitones
        preview(mode.lead + shift.semitones)
      }
      const moved = moveNotes(snapshot, mode.starts, shift.rows, shift.semitones)
      composer.editChannel(channel, moved.cells, key)
      selected = new Set(moved.starts)
    } else {
      drag = { ...drag, mode: { ...mode, x1: x, y1: yPx } }
      selected = new Set([...mode.base, ...notes.filter((n) => inBox(n, { ...mode, x1: x, y1: yPx })).map((n) => n.start)])
    }
  }

  /** Moved notes are drawn anew, which drops their focus; keep the keys working. */
  async function keepFocus() {
    await tick()
    if (scroller && !scroller.contains(document.activeElement)) scroller.focus({ preventScroll: true })
  }

  function onpointerup() {
    void keepFocus()
    const mode = drag?.mode
    if (mode?.kind === 'draw') {
      const seg = segments(cells).find((s) => s.start === mode.start)
      if (seg) defaultLength = seg.length
    }
    // A click (no drag) on a note in a group selects just that note.
    if (mode?.kind === 'move' && !mode.moved) selected = new Set([mode.clicked])
    drag = null
  }

  // ---- keyboard ----------------------------------------------------------

  async function focusNote(start: number) {
    await tick()
    scroller.querySelector<SVGElement>(`[data-start="${start}"]`)?.focus()
  }

  /** Arrow keys, Delete and the clipboard on the selection (or the focused note). */
  function onkeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey
    const focused = (e.target as Element).closest?.('[data-start]')?.getAttribute('data-start')
    const starts = selected.size ? selectedStarts() : focused != null ? [Number(focused)] : []
    const top = isNoise ? 15 : 127
    const edit = (next: Cell[], select?: number[]) => {
      composer.editChannel(channel, next)
      if (select) selected = new Set(select)
    }

    if (mod && e.code === 'KeyA') {
      selected = new Set(notes.map((n) => n.start))
    } else if (mod && (e.code === 'KeyC' || e.code === 'KeyX')) {
      clip = copyNotes(editable(cells), starts)
      if (!clip) return
      if (e.code === 'KeyX') edit(removeNotes(cells, starts), [])
    } else if (mod && e.code === 'KeyV') {
      if (!clip) return
      const pasted = pasteNotes(editable(cells), clip, composer.cursor.row, top)
      edit(pasted.cells, pasted.starts)
    } else if (mod && e.code === 'KeyD') {
      const copied = copyNotes(editable(cells), starts)
      if (!copied) return
      const at = Math.min(...starts) + copied.span
      if (at >= length) return
      const pasted = pasteNotes(editable(cells), copied, at, top)
      edit(pasted.cells, pasted.starts)
    } else if (e.key === 'Escape' && selected.size) {
      selected = new Set()
    } else if (!starts.length || mod) {
      return
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      edit(removeNotes(cells, starts), [])
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const sign = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1
      const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown'
      if (!vertical && e.shiftKey) {
        edit(resizeNotes(cells, starts, sign))
      } else {
        const snapshot = editable(cells)
        let semitones = sign * (e.shiftKey && !isNoise ? 12 : 1)
        // Snapping a single note: step to the next note of the key.
        const only = starts.length === 1 ? segments(snapshot).find((n) => n.start === starts[0]) : undefined
        if (vertical && !e.shiftKey && snap && key && !isNoise && only) {
          let next = only.note + sign
          while (!inScale(next, key) && Math.abs(next - only.note) < 12) next += sign
          semitones = next - only.note
        }
        const want = vertical ? { rows: 0, semitones } : { rows: sign, semitones: 0 }
        const shift = clampShift(snapshot, starts, want.rows, want.semitones, 0, top)
        if (!shift.rows && !shift.semitones) {
          e.preventDefault()
          return
        }
        const moved = moveNotes(snapshot, starts, shift.rows, shift.semitones)
        edit(moved.cells, selected.size ? moved.starts : undefined)
        if (vertical) {
          const lead = segments(moved.cells).find((s) => s.start === moved.starts[0])
          if (lead) preview(lead.note)
        }
        if (!selected.size) void focusNote(moved.starts[0])
      }
    } else {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    if (selected.size) void keepFocus()
  }

  const box = $derived(drag?.mode.kind === 'box' ? drag.mode : null)
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
      <button role="radio" aria-checked={tool === 'select'} onclick={() => (tool = 'select')}>Select</button>
      <button role="radio" aria-checked={tool === 'erase'} onclick={() => (tool = 'erase')}>Erase</button>
    </div>
    {#if !isNoise}
      <div class="keybox" role="group" aria-label="Key">
        <label>
          Key
          <select
            aria-label="Key"
            value={key?.root ?? ''}
            onchange={(e) => {
              const v = e.currentTarget.value
              composer.setKey(v === '' ? null : { root: Number(v), scale: key?.scale ?? 'major' })
            }}
          >
            <option value="">None</option>
            {#each ROOT_NAMES as name, i (name)}<option value={i}>{name}</option>{/each}
          </select>
        </label>
        {#if key}
          <select
            aria-label="Scale"
            value={key.scale}
            onchange={(e) => isScaleName(e.currentTarget.value) && composer.setKey({ ...key, scale: e.currentTarget.value })}
          >
            {#each Object.entries(SCALES) as [id, s] (id)}<option value={id}>{s.label}</option>{/each}
          </select>
          <label title="New and moved notes land on notes of the key">
            <input type="checkbox" checked={snap} onchange={(e) => setSnap(e.currentTarget.checked)} /> Snap to key
          </label>
        {/if}
        <button class="small" onclick={findKey} title="Work out the key from the notes you've written">Find key</button>
      </div>
    {/if}
    {#if selected.size}<strong class="count">{selected.size} selected</strong>{/if}
    <button class="help-toggle" aria-expanded={helpOpen} aria-controls="roll-help" onclick={() => (helpOpen = !helpOpen)} title="How to use the piano roll">?</button>
    {#if helpOpen}
      <p class="hint" id="roll-help">
        Drag to draw, drag a note to move it, drag its end to resize, right-click to erase. Select several by
        dragging a box (Select tool, or Shift-drag) or Shift-clicking; they move together. Arrows move,
        Shift+←/→ resizes, Delete removes, Ctrl+C/X/V/D copy, cut, paste at the clicked row and duplicate.
      </p>
    {/if}
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="scroller" bind:this={scroller} bind:clientWidth={viewWidth} tabindex="0" role="application" aria-label="Piano roll" {onkeydown}>
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
        class:select={tool === 'select'}
        width={length * cellW}
        height={pitches.length * rowH}
        style:--c={channelsFor(composer.song.chip)[channel].color}
        {onpointerdown}
        {onpointermove}
        {onpointerup}
        oncontextmenu={(e) => e.preventDefault()}
      >
        {#each pitches as p, i (p)}
          <rect
            class="lane"
            class:black={!isNoise && isBlack(p)}
            class:octave={!isNoise && p % 12 === 0}
            class:out={!isNoise && key && !inScale(p, key)}
            class:root={!isNoise && key && (p - key.root) % 12 === 0}
            y={i * rowH}
            width={length * cellW}
            height={rowH}
          />
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
              class:selected={selected.has(seg.start)}
              tabindex="0"
              role="button"
              data-start={seg.start}
              aria-label="{label(seg.note)}, row {seg.start}, {seg.length} {seg.length === 1 ? 'row' : 'rows'}"
              aria-pressed={selected.has(seg.start)}
            >
              <rect x={seg.start * cellW} y={y(seg.note)} width={seg.length * cellW - 1} height={rowH - 1} rx="2" />
              {#if seg.length * cellW > 34 && rowH >= 12}
                <text x={seg.start * cellW + 4} y={y(seg.note) + rowH / 2}>{label(seg.note)}</text>
              {/if}
            </g>
          {/if}
        {/each}
        {#if box}
          <rect
            class="marquee"
            x={Math.min(box.x0, box.x1)}
            y={Math.min(box.y0, box.y1)}
            width={Math.abs(box.x1 - box.x0)}
            height={Math.abs(box.y1 - box.y0)}
          />
        {/if}
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

  .count {
    font-size: var(--step--1);
  }

  .tools .help-toggle {
    width: 28px;
    height: 28px;
    margin-left: auto;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 50%;
    font-weight: 600;
  }

  .tools .help-toggle[aria-expanded='true'] {
    background: var(--line);
    color: var(--text);
  }

  .hint {
    flex: 1 1 100%;
    color: var(--muted);
    font-size: var(--step--1);
  }

  .scroller {
    flex: 1;
    outline-offset: -2px;
    overflow: auto;
    min-height: 160px;
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

  /* With a key: notes outside it are dimmed, the key's home note is marked. */
  .lane.out {
    fill: #0f0d22;
  }

  .lane.root {
    fill: #231f45;
  }

  .keybox {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 2);
    color: var(--muted);
    font-size: var(--step--1);
  }

  .keybox select {
    padding: 2px var(--u);
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--ink);
    color: var(--text);
    font: inherit;
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

  .note.selected rect {
    opacity: 1;
    stroke: var(--text);
    stroke-width: 1.5;
  }

  .grid.select {
    cursor: default;
  }

  .marquee {
    fill: var(--text);
    fill-opacity: 0.08;
    stroke: var(--text);
    stroke-dasharray: 3 2;
    pointer-events: none;
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
