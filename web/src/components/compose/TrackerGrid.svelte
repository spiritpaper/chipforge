<script lang="ts">
  import { engine } from '../../audio/engine.svelte'
  import { channelsFor } from '../../audio/channels'
  import { composer } from '../../composer/composer.svelte'
  import { COLUMNS, PIANO_KEYS, trackerAction } from '../../composer/keys'
  import { noteLabel, type Cell } from '../../song/model'

  const ROW_H = 22
  const FONT_SIZE = 14
  /** Character offsets of each cursor column within a channel: "C-4 01 F A04". */
  const COL_X = [0, 4, 5, 7, 9, 10, 11]
  const COL_W = [3, 1, 1, 1, 1, 1, 1]
  const CELL_CHARS = 12
  const CHANNEL_PAD = 2
  const GUTTER_CHARS = 4

  let canvas: HTMLCanvasElement
  let surface: HTMLDivElement
  let width = $state(0)
  let height = $state(0)
  let charWidth = $state(8.4)

  const gutter = $derived(GUTTER_CHARS * charWidth)
  /** Channels share the available width, but never get narrower than a cell. */
  const channelWidth = $derived(Math.max((CELL_CHARS + CHANNEL_PAD) * charWidth, (width - gutter) / 4))
  const pattern = $derived(composer.song.patterns[composer.patternIndex])
  const playRow = $derived(engine.position?.order === composer.orderIndex ? engine.position.row : -1)
  const followingPlayback = $derived(composer.follow && engine.playing && playRow >= 0)
  /** The row drawn in the middle of the grid. */
  const focusRow = $derived(followingPlayback ? playRow : composer.cursor.row)

  const hex = (v: number, digits: number) => v.toString(16).toUpperCase().padStart(digits, '0')

  /** Noise "notes" select one of 16 noise sounds, written 0-# to F-# as in FamiTracker. */
  function noteText(note: number | null, channel: number) {
    return channel === 3 && note !== null && note >= 0 ? `${hex(note % 16, 1)}-#` : noteLabel(note)
  }

  function cellText(c: Cell, channel: number) {
    return {
      note: noteText(c.note, channel),
      inst: c.instrument === null ? '..' : hex(c.instrument, 2),
      vol: c.volume === null ? '.' : hex(c.volume, 1),
      fx: c.effect === null ? '...' : `${c.effect}${hex(c.param, 2)}`,
    }
  }

  function tokens() {
    const css = getComputedStyle(canvas)
    const v = (name: string) => css.getPropertyValue(name).trim()
    return {
      ink: v('--ink'),
      panel: v('--panel'),
      line: v('--line'),
      text: v('--text'),
      muted: v('--muted'),
      channels: channelsFor(composer.song.chip).map((c) => v(c.color.slice(4, -1))),
    }
  }

  function draw() {
    const ctx = canvas.getContext('2d')
    if (!ctx || !width || !height) return
    const dpr = devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const t = tokens()
    ctx.font = `${FONT_SIZE}px "JetBrains Mono", monospace`
    ctx.textBaseline = 'middle'
    charWidth = ctx.measureText('0').width

    ctx.fillStyle = t.ink
    ctx.fillRect(0, 0, width, height)

    const song = composer.song
    const top = height / 2 - ROW_H / 2 - focusRow * ROW_H
    const first = Math.max(0, Math.floor(-top / ROW_H))
    const last = Math.min(song.patternLength - 1, Math.ceil((height - top) / ROW_H))
    const beat = song.rowsPerBeat
    const sel = composer.selection

    for (let row = first; row <= last; row++) {
      const y = top + row * ROW_H
      // Shade beats, and bars (four beats) a little more.
      if (row % beat === 0) {
        const bar = row % (beat * 4) === 0
        ctx.fillStyle = bar ? t.line : t.panel
        ctx.globalAlpha = bar ? 0.55 : 1
        ctx.fillRect(0, y, width, ROW_H)
        ctx.globalAlpha = 1
      }
      if (row === playRow) {
        ctx.fillStyle = t.text
        ctx.globalAlpha = 0.14
        ctx.fillRect(0, y, width, ROW_H)
        ctx.globalAlpha = 1
      }
      if (row === composer.cursor.row) {
        ctx.strokeStyle = t.muted
        ctx.globalAlpha = 0.6
        ctx.strokeRect(0.5, y + 0.5, width - 1, ROW_H - 1)
        ctx.globalAlpha = 1
      }

      const cy = y + ROW_H / 2
      ctx.fillStyle = row % beat === 0 ? t.text : t.muted
      ctx.fillText(String(row).padStart(2, '0'), charWidth * 0.5, cy)

      for (let ch = 0; ch < 4; ch++) {
        const x = gutter + ch * channelWidth + charWidth
        const cell = pattern.channels[ch][row]
        const text = cellText(cell, ch)
        const audible = engine.audible(ch)
        ctx.globalAlpha = audible ? 1 : 0.4
        ctx.fillStyle = cell.note === null ? t.line : t.channels[ch]
        ctx.fillText(text.note, x, cy)
        ctx.fillStyle = cell.instrument === null ? t.line : t.muted
        ctx.fillText(text.inst, x + 4 * charWidth, cy)
        ctx.fillStyle = cell.volume === null ? t.line : t.text
        ctx.fillText(text.vol, x + 7 * charWidth, cy)
        ctx.fillStyle = cell.effect === null ? t.line : t.text
        ctx.fillText(text.fx, x + 9 * charWidth, cy)
        ctx.globalAlpha = 1
      }
    }

    for (let ch = 1; ch < 4; ch++) {
      const x = Math.round(gutter + ch * channelWidth) + 0.5
      ctx.strokeStyle = t.line
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }

    if (sel) {
      const x = gutter + sel.fromChannel * channelWidth
      const y = top + sel.fromRow * ROW_H
      ctx.fillStyle = t.text
      ctx.globalAlpha = 0.12
      ctx.fillRect(x, y, (sel.toChannel - sel.fromChannel + 1) * channelWidth, (sel.toRow - sel.fromRow + 1) * ROW_H)
      ctx.globalAlpha = 1
    }

    const { row, channel, column } = composer.cursor
    const cx = gutter + channel * channelWidth + charWidth + COL_X[column] * charWidth
    const cyTop = top + row * ROW_H
    ctx.strokeStyle = t.text
    ctx.lineWidth = 1.5
    ctx.strokeRect(cx - 1.5, cyTop + 2, COL_W[column] * charWidth + 3, ROW_H - 4)
    ctx.lineWidth = 1
  }

  $effect(() => {
    // Redraw whenever anything drawn changes.
    void [composer.song, composer.cursor.row, composer.cursor.channel, composer.cursor.column, composer.selection]
    void [composer.orderIndex, playRow, focusRow, width, height, engine.muted.join(), engine.soloed]
    draw()
  })

  // ---- input ---------------------------------------------------------------

  function cellAt(e: PointerEvent | WheelEvent) {
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const top = height / 2 - ROW_H / 2 - focusRow * ROW_H
    const row = Math.floor((y - top) / ROW_H)
    const channel = Math.floor((x - gutter) / channelWidth)
    const charX = (x - gutter - channel * channelWidth - charWidth) / charWidth
    let column = 0
    COL_X.forEach((cx, i) => {
      if (charX >= cx - 0.5) column = i
    })
    return { row, channel: Math.max(0, channel), column }
  }

  function onpointerdown(e: PointerEvent) {
    surface.focus()
    surface.setPointerCapture(e.pointerId)
    composer.setCursor(cellAt(e), e.shiftKey)
  }

  function onpointermove(e: PointerEvent) {
    if (e.buttons === 1 && surface.hasPointerCapture(e.pointerId)) composer.setCursor(cellAt(e), true)
  }

  function onwheel(e: WheelEvent) {
    if (followingPlayback) return
    e.preventDefault()
    composer.setCursor({ row: composer.cursor.row + Math.sign(e.deltaY) * (e.shiftKey ? 16 : 2) })
  }

  function onkeydown(e: KeyboardEvent) {
    // Holding a piano key must not fill the column with copies of the note.
    if (e.repeat && e.code in PIANO_KEYS && composer.columnName === 'note') {
      e.preventDefault()
      return
    }
    const action = trackerAction(e, composer.columnName, composer.octave)
    if (action && composer.perform(action)) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  function onkeyup(e: KeyboardEvent) {
    if (e.code in PIANO_KEYS) composer.previewOff()
  }

  const announcement = $derived.by(() => {
    const { row, channel, column } = composer.cursor
    const c = cellText(pattern.channels[channel][row], channel)
    return `Row ${row}, ${channelsFor(composer.song.chip)[channel].name}, ${COLUMNS[column] === 'note' ? 'note' : 'column ' + (column + 1)}: ${c.note} ${c.inst} ${c.vol} ${c.fx}`
  })
</script>

<div
  class="tracker"
  style:--chw="{channelWidth}px"
  style:--gutter="{gutter}px"
  style:--min-width="{gutter + 4 * (CELL_CHARS + CHANNEL_PAD) * charWidth}px"
>
  <div class="heads" aria-hidden="true">
    {#each channelsFor(composer.song.chip) as info, ch (info.name)}
      <div class="head" class:silent={!engine.audible(ch)} style:--c={info.color}>
        <span class="name">{info.name}</span>
        <span class="role">{info.role}</span>
      </div>
    {/each}
  </div>
  <!-- A canvas widget that handles its own keys: "application" is the right role, but
       Svelte's linter only knows native and composite widget roles. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="body"
    bind:this={surface}
    bind:clientWidth={width}
    bind:clientHeight={height}
    tabindex="0"
    role="application"
    aria-roledescription="tracker"
    aria-label="Pattern editor. Letter keys play notes, arrows move, Tab changes channel."
    {onpointerdown}
    {onpointermove}
    {onwheel}
    {onkeydown}
    {onkeyup}
  >
    <canvas bind:this={canvas} aria-hidden="true"></canvas>
  </div>
  <p class="visually-hidden" aria-live="polite">{announcement}</p>
</div>

<style>
  .tracker {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow-x: auto;
  }

  .heads {
    display: flex;
    padding-left: var(--gutter);
    min-width: var(--min-width);
    border-bottom: 1px solid var(--line);
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: calc(var(--u) * 2);
    width: var(--chw);
    padding: calc(var(--u) * 2) calc(var(--u) * 2);
    border-top: 3px solid var(--c);
  }

  .head.silent {
    border-top-color: var(--line);
  }

  .name {
    font-weight: 600;
    white-space: nowrap;
  }

  .role {
    color: var(--muted);
    font-size: var(--step--1);
    white-space: nowrap;
  }

  .body {
    position: relative;
    flex: 1;
    min-height: 240px;
    min-width: var(--min-width);
  }

  .body {
    cursor: text;
    touch-action: none;
  }

  .body:focus-visible {
    outline-offset: -2px;
  }

  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
</style>
