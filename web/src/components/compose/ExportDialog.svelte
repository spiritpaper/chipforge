<script lang="ts">
  import { composer } from '../../composer/composer.svelte'
  import { songToMidi } from '../../midi/convert'
  import { writeMidi } from '../../midi/smf'
  import { download } from '../../sfx/export'
  import { slugify } from '../../sfx/library-core'
  import { toast } from '../../lib/toast.svelte'

  let { open = $bindable(false) }: { open: boolean } = $props()
  let dialog: HTMLDialogElement

  $effect(() => {
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  })

  const base = $derived(slugify(composer.song.title))

  function exportMidi() {
    download(writeMidi(songToMidi(composer.song)), `${base}.mid`, 'audio/midi')
    toast.show(`Saved ${base}.mid`)
  }
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="export-title">
  <header>
    <h2 id="export-title">Export “{composer.song.title}”</h2>
    <button class="key" onclick={() => (open = false)}>Close</button>
  </header>

  <section>
    <h3>MIDI file</h3>
    <p>Notes and tempo for other music software. Instrument sounds and effects are not part of MIDI; the noise channel becomes General MIDI drums.</p>
    <button class="key" onclick={exportMidi}>Download {base}.mid</button>
  </section>
</dialog>

<style>
  dialog {
    width: min(560px, calc(100vw - 32px));
    padding: calc(var(--u) * 6);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: var(--ink);
    color: var(--text);
  }

  dialog::backdrop {
    background: rgb(8 7 20 / 0.7);
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: calc(var(--u) * 4);
    margin-bottom: calc(var(--u) * 4);
  }

  h2 {
    font-size: var(--step-2);
    font-weight: 600;
  }

  section {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: calc(var(--u) * 2);
    padding: calc(var(--u) * 4) 0;
    border-top: 1px solid var(--line);
  }

  h3 {
    font-size: var(--step-1);
    font-weight: 600;
  }

  p {
    color: var(--muted);
    max-width: 60ch;
  }
</style>
