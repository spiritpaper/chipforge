<script lang="ts">
  import { composer } from '../../composer/composer.svelte'
  import { MidiError, parseMidi } from '../../midi/smf'
  import { midiToSong, type ImportReport } from '../../midi/convert'
  import { validateSong } from '../../song/validate'
  import { TEMPLATES } from '../../song/templates'

  let { open = $bindable(false) }: { open: boolean } = $props()

  let dialog: HTMLDialogElement
  let confirmDelete = $state<string | null>(null)
  let report = $state<ImportReport | null>(null)
  let importError = $state<string | null>(null)
  let fileInput: HTMLInputElement

  async function importFile(file: File) {
    importError = null
    if (/\.json$/i.test(file.name)) {
      let song = null
      try {
        song = validateSong(JSON.parse(await file.text()))
      } catch {
        // Reported below.
      }
      if (song) {
        await composer.create(song)
        report = { title: song.title, lines: ['Opened as a new song; the original file is unchanged.'] }
      } else importError = 'That file is not a ChipForge song, or it is damaged.'
      fileInput.value = ''
      return
    }
    try {
      const title = file.name.replace(/\.midi?$/i, '') || 'Imported song'
      const { song, report: r } = midiToSong(parseMidi(new Uint8Array(await file.arrayBuffer())), title)
      await composer.create(song)
      report = r
    } catch (err) {
      importError = err instanceof MidiError ? err.message : 'That file could not be read as MIDI.'
    } finally {
      fileInput.value = ''
    }
  }

  $effect(() => {
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  })

  const when = (t: number) =>
    new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

  async function pick(id: string) {
    await composer.switchTo(id)
    open = false
  }
</script>

<dialog bind:this={dialog} onclose={() => ((open = false), (confirmDelete = null), (report = null), (importError = null))} aria-labelledby="songs-title">
  <header>
    <h2 id="songs-title">Songs</h2>
    <button class="key" onclick={() => (open = false)}>Close</button>
  </header>
  <p class="note">Songs save automatically in this browser.</p>

  <h3>Start a new song</h3>
  <ul class="templates">
    {#each TEMPLATES as t (t.id)}
      <li>
        <button onclick={async () => { await composer.create(t.create()); open = false }}>
          <span class="title">{t.title}</span>
          <span class="when">{t.description}</span>
        </button>
      </li>
    {/each}
  </ul>
  <div class="new-row">
    <button class="key" onclick={() => fileInput.click()}>Open a MIDI or song file…</button>
    <input bind:this={fileInput} type="file" accept=".mid,.midi,audio/midi,.json,application/json" hidden onchange={(e) => e.currentTarget.files?.[0] && importFile(e.currentTarget.files[0])} />
  </div>

  {#if importError}
    <p class="error" role="alert">{importError}</p>
  {/if}
  {#if report}
    <div class="report" role="status">
      <p><strong>Imported “{report.title}”.</strong></p>
      <ul>{#each report.lines as line, i (i)}<li>{line}</li>{/each}</ul>
      <button class="key" onclick={() => (open = false)}>Start editing</button>
    </div>
  {/if}

  <h3>Your songs</h3>
  <ul class="projects">
    {#each composer.projects as p (p.id)}
      <li class:current={p.id === composer.projectId}>
        <button class="open" onclick={() => pick(p.id)} aria-current={p.id === composer.projectId ? 'true' : undefined}>
          <span class="title">{p.title}</span>
          <span class="when">Edited {when(p.updatedAt)}</span>
        </button>
        <button class="small" onclick={() => composer.duplicate(p.id)}>Duplicate</button>
        {#if confirmDelete === p.id}
          <button class="small danger" onclick={() => composer.remove(p.id)}>Delete for good</button>
          <button class="small" onclick={() => (confirmDelete = null)}>Keep</button>
        {:else}
          <button class="small" onclick={() => (confirmDelete = p.id)}>Delete</button>
        {/if}
      </li>
    {/each}
  </ul>
</dialog>

<style>
  dialog {
    width: min(560px, calc(100vw - 32px));
    max-height: min(640px, calc(100vh - 32px));
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
  }

  h2 {
    font-size: var(--step-2);
    font-weight: 600;
  }

  .note {
    margin: var(--u) 0 calc(var(--u) * 4);
    color: var(--muted);
  }

  h3 {
    margin: calc(var(--u) * 4) 0 calc(var(--u) * 2);
    font-size: var(--step-0);
    font-weight: 600;
  }

  .templates {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: calc(var(--u) * 2);
    margin: 0 0 calc(var(--u) * 3);
    padding: 0;
    list-style: none;
  }

  .templates button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--u);
    width: 100%;
    height: 100%;
    padding: calc(var(--u) * 3);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: var(--panel);
    text-align: left;
    cursor: pointer;
  }

  .templates button:hover {
    border-color: var(--muted);
  }

  .new-row {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--u) * 2);
  }

  .error {
    margin-top: calc(var(--u) * 3);
    color: var(--pulse1);
  }

  .report {
    margin-top: calc(var(--u) * 3);
    padding: calc(var(--u) * 3) calc(var(--u) * 4);
    border-left: 3px solid var(--tri);
    background: var(--panel);
  }

  .report ul {
    margin: var(--u) 0 calc(var(--u) * 3);
    padding-left: calc(var(--u) * 5);
    color: var(--muted);
    list-style: disc;
  }

  .projects {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--u);
  }

  .projects li {
    display: flex;
    align-items: center;
    gap: var(--u);
    border-radius: var(--radius-key);
  }

  .projects li.current {
    background: var(--panel);
  }

  .open {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: calc(var(--u) * 2) calc(var(--u) * 3);
    border: 0;
    background: none;
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }

  .open:hover .title {
    text-decoration: underline;
  }

  .title {
    font-weight: 600;
  }

  .when {
    font-size: var(--step--1);
    color: var(--muted);
  }

  .small {
    padding: var(--u) calc(var(--u) * 2);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: none;
    font-size: var(--step--1);
    color: var(--muted);
    cursor: pointer;
    white-space: nowrap;
  }

  .small:hover {
    color: var(--text);
  }

  .danger {
    border-color: var(--pulse1);
    color: var(--pulse1);
  }
</style>
