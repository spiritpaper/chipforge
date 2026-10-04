<script lang="ts">
  import { composer } from '../../composer/composer.svelte'

  let { open = $bindable(false) }: { open: boolean } = $props()

  let dialog: HTMLDialogElement
  let confirmDelete = $state<string | null>(null)

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

<dialog bind:this={dialog} onclose={() => ((open = false), (confirmDelete = null))} aria-labelledby="songs-title">
  <header>
    <h2 id="songs-title">Your songs</h2>
    <button class="key" onclick={() => (open = false)}>Close</button>
  </header>
  <p class="note">Songs save automatically in this browser.</p>

  <button class="key new" onclick={async () => { await composer.create(); open = false }}>New empty song</button>

  <ul>
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

  ul {
    margin: calc(var(--u) * 4) 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--u);
  }

  li {
    display: flex;
    align-items: center;
    gap: var(--u);
    border-radius: var(--radius-key);
  }

  li.current {
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
