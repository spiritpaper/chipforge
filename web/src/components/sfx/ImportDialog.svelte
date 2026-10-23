<script lang="ts">
  // Brings sounds in from sfxr, jsfxr and rFXGen: paste a link, code or JSON, or pick
  // files. They become classic sounds and play exactly as they did there.
  import { lab } from '../../sfx/lab.svelte'

  let { open = $bindable(false) }: { open?: boolean } = $props()
  let dialog: HTMLDialogElement
  let text = $state('')
  let error = $state<string | null>(null)
  let fileInput: HTMLInputElement

  $effect(() => {
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  })

  function importText() {
    if (lab.importText(text)) {
      text = ''
      open = false
    } else {
      error = "That isn't a jsfxr link, code or JSON. Copy it again and paste the whole thing."
    }
  }

  async function importFiles(files: FileList | null) {
    if (!files?.length) return
    await lab.importFiles(files)
    open = false
  }
</script>

<dialog bind:this={dialog} onclose={() => ((open = false), (error = null))} aria-labelledby="import-title">
  <header>
    <h2 id="import-title">Import sounds</h2>
    <button class="key" onclick={() => (open = false)}>Close</button>
  </header>
  <p class="note">
    From <a href="https://sfxr.me" target="_blank" rel="noopener">jsfxr</a>, sfxr or rFXGen. They open as classic sounds and
    play exactly as they did there.
  </p>

  <label for="import-text">Paste a jsfxr link, share code or JSON</label>
  <textarea
    id="import-text"
    rows="3"
    bind:value={text}
    oninput={() => (error = null)}
    placeholder="https://sfxr.me/#34T6Pk…"
    spellcheck="false"
  ></textarea>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="row">
    <button class="key" onclick={importText} disabled={!text.trim()}>Import</button>
    <span class="muted">or</span>
    <button class="key" onclick={() => fileInput.click()}>Choose files…</button>
    <span class="muted">.sfs (sfxr), .rfx (rFXGen), .json (jsfxr)</span>
  </div>
  <input bind:this={fileInput} type="file" multiple accept=".sfs,.rfx,.json,.txt" hidden onchange={(e) => importFiles(e.currentTarget.files)} />
  <p class="note">You can also drop these files onto SFX Lab.</p>
</dialog>

<style>
  dialog {
    width: min(520px, calc(100vw - 32px));
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
    margin-bottom: calc(var(--u) * 3);
  }

  h2 {
    font-size: var(--step-2);
  }

  label {
    display: block;
    margin: calc(var(--u) * 4) 0 calc(var(--u) * 2);
    font-weight: 600;
  }

  textarea {
    width: 100%;
    padding: calc(var(--u) * 2);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: var(--panel);
    color: var(--text);
    font-family: var(--font-data);
    font-size: var(--step--1);
    resize: vertical;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--u) * 3);
    margin-top: calc(var(--u) * 3);
  }

  .note,
  .muted {
    color: var(--muted);
    font-size: var(--step--1);
  }

  .note {
    margin-top: calc(var(--u) * 3);
  }

  .error {
    margin-top: calc(var(--u) * 2);
    color: var(--pulse1);
  }
</style>
