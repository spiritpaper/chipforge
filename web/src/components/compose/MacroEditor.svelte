<script lang="ts">
  import { MACRO_RANGE, MAX_MACRO_STEPS, resizeMacro, setMacroValues, toggleMarker, type MacroKind } from '../../song/instrument-edit'
  import type { Macro } from '../../song/model'

  let {
    kind,
    macro,
    onchange,
    ondone,
  }: {
    kind: MacroKind
    macro: Macro
    /** A new macro; edits sharing a key undo together. */
    onchange: (m: Macro, coalesceKey?: string) => void
    /** Called when a gesture ends, to let the user hear the result. */
    ondone: () => void
  } = $props()

  const HEIGHT = 120
  const MARKER_H = 18

  let width = $state(0)
  let selected = $state(0)
  let drawing: { key: string; last: number; lastValue: number } | null = null
  let gestures = 0

  const [lo, hi] = $derived(MACRO_RANGE[kind])
  const steps = $derived(macro.values.length)
  const stepW = $derived(Math.max(8, Math.floor(width / Math.max(steps, 16))))
  const yOf = (v: number) => ((hi - v) / (hi - lo)) * (HEIGHT - 4) + 2
  const zeroY = $derived(yOf(Math.min(hi, Math.max(lo, 0))))

  function at(e: PointerEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
    const step = Math.min(steps - 1, Math.max(0, Math.floor((e.clientX - rect.left) / stepW)))
    const value = hi - ((e.clientY - rect.top - 2) / (HEIGHT - 4)) * (hi - lo)
    return { step, value }
  }

  /**
   * Paints the step under the pointer. A fast drag can skip steps, so those are filled
   * by interpolating from the previous point (which itself is left alone).
   */
  function paint(e: PointerEvent, first = false) {
    const d = drawing!
    const { step, value } = at(e)
    const span = Math.abs(step - d.last)
    let next: Macro
    if (first || span === 0) {
      next = setMacroValues(macro, step, [value], kind)
    } else {
      const dir = Math.sign(step - d.last)
      next = macro
      for (let k = 1; k <= span; k++) {
        const v = d.lastValue + ((value - d.lastValue) * k) / span
        next = setMacroValues(next, d.last + dir * k, [v], kind)
      }
    }
    onchange(next, d.key)
    d.last = step
    d.lastValue = value
    selected = step
  }

  function onpointerdown(e: PointerEvent) {
    if (steps === 0) return
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const { step, value } = at(e)
    drawing = { key: `drag:macro:${++gestures}`, last: step, lastValue: value }
    paint(e, true)
  }

  function onpointermove(e: PointerEvent) {
    if (drawing) paint(e)
  }

  function onpointerup() {
    if (drawing) ondone()
    drawing = null
  }

  function onkeydown(e: KeyboardEvent) {
    if (steps === 0) return
    const value = macro.values[selected] ?? 0
    const delta = e.shiftKey ? 4 : 1
    switch (e.key) {
      case 'ArrowLeft':
        selected = Math.max(0, selected - 1)
        break
      case 'ArrowRight':
        selected = Math.min(steps - 1, selected + 1)
        break
      case 'ArrowUp':
        onchange(setMacroValues(macro, selected, [value + delta], kind), `macro-key:${selected}`)
        break
      case 'ArrowDown':
        onchange(setMacroValues(macro, selected, [value - delta], kind), `macro-key:${selected}`)
        break
      default:
        return
    }
    e.preventDefault()
    e.stopPropagation()
  }

  const resize = (n: number) => {
    onchange(resizeMacro(macro, n, kind))
    selected = Math.min(selected, Math.max(0, n - 1))
  }
</script>

<div class="macro" bind:clientWidth={width}>
  {#if steps === 0}
    <p class="empty">Off. Add steps to shape this over time.</p>
  {:else}
    <!-- Keyboard users pick a step with ←/→ and change it with ↑/↓. "application" is the
         right role for this widget; Svelte's linter doesn't count it as interactive. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <svg
      class="bars"
      width={steps * stepW}
      height={HEIGHT}
      tabindex="0"
      role="application"
      aria-label="{kind} macro, {steps} steps. Step {selected + 1} is {macro.values[selected]}. Arrow keys change it."
      {onpointerdown}
      {onpointermove}
      {onpointerup}
      {onkeydown}
    >
      <rect class="zero" x="0" y={zeroY} width={steps * stepW} height="1" />
      {#each macro.values as v, i (i)}
        {@const y = yOf(v)}
        <rect
          class="bar"
          class:looped={macro.loop !== null && i >= macro.loop && (macro.release === null || i <= macro.release || macro.loop > macro.release)}
          class:sel={i === selected}
          x={i * stepW + 1}
          y={Math.min(y, zeroY)}
          width={stepW - 2}
          height={Math.max(2, Math.abs(zeroY - y))}
        />
      {/each}
    </svg>
    <svg class="markers" width={steps * stepW} height={MARKER_H * 2} role="group" aria-label="Loop and release points">
      {#each macro.values as _, i (i)}
        {#each ['loop', 'release'] as const as which, r (which)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <rect
            role="button"
            tabindex="-1"
            aria-label="Set {which} point at step {i + 1}"
            class="slot"
            class:on={macro[which] === i}
            class:release={which === 'release'}
            x={i * stepW + 1}
            y={r * MARKER_H + 2}
            width={stepW - 2}
            height={MARKER_H - 4}
            onclick={() => onchange(toggleMarker(macro, which, i))}
          />
        {/each}
      {/each}
    </svg>
  {/if}

  <div class="controls">
    <div class="len" role="group" aria-label="Steps">
      <button class="key small" onclick={() => resize(steps - 1)} disabled={steps === 0} aria-label="One step fewer">−</button>
      <span class="mono">{steps}</span>
      <button class="key small" onclick={() => resize(steps + 1)} disabled={steps >= MAX_MACRO_STEPS} aria-label="One step more">+</button>
      <span class="muted">steps</span>
    </div>
    <label class="marker">
      Loop from
      <select value={macro.loop ?? ''} onchange={(e) => onchange({ ...macro, loop: e.currentTarget.value === '' ? null : Number(e.currentTarget.value) })}>
        <option value="">No loop</option>
        {#each macro.values as _, i (i)}<option value={i}>step {i + 1}</option>{/each}
      </select>
    </label>
    <label class="marker">
      Release at
      <select value={macro.release ?? ''} onchange={(e) => onchange({ ...macro, release: e.currentTarget.value === '' ? null : Number(e.currentTarget.value) })}>
        <option value="">No release</option>
        {#each macro.values as _, i (i)}<option value={i}>step {i + 1}</option>{/each}
      </select>
    </label>
  </div>
</div>

<style>
  .macro {
    display: flex;
    flex-direction: column;
    gap: var(--u);
    overflow-x: auto;
  }

  .empty {
    padding: calc(var(--u) * 4) 0;
    color: var(--muted);
  }

  .bars {
    display: block;
    background: var(--ink);
    border-radius: 2px;
    cursor: crosshair;
    touch-action: none;
  }

  .zero {
    fill: var(--line);
  }

  .bar {
    fill: var(--c, var(--text));
    opacity: 0.6;
  }

  .bar.looped {
    opacity: 0.9;
  }

  .bars:focus-visible .bar.sel {
    stroke: var(--text);
    stroke-width: 1.5;
    opacity: 1;
  }

  .slot {
    fill: var(--panel);
    cursor: pointer;
  }

  .slot:hover {
    fill: var(--line);
  }

  .slot.on {
    fill: var(--tri);
  }

  .slot.release.on {
    fill: var(--pulse2);
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--u) * 2) calc(var(--u) * 4);
    align-items: center;
    font-size: var(--step--1);
    color: var(--muted);
  }

  .len {
    display: flex;
    align-items: center;
    gap: var(--u);
  }

  .small {
    min-width: 28px;
    min-height: 28px;
    padding: 0;
  }

  .mono {
    min-width: 2ch;
    text-align: center;
    font-family: var(--font-data);
    color: var(--text);
  }

  .marker {
    display: flex;
    align-items: center;
    gap: var(--u);
  }

  select {
    padding: 2px var(--u);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: var(--ink);
    font: inherit;
    color: var(--text);
  }
</style>
