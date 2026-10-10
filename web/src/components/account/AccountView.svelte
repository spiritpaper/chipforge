<script lang="ts">
  import { account } from '../../account/account.svelte'

  let email = $state('')
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '')
  const linkError = params.get('error') === 'link'

  const when = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  $effect(() => {
    // Arriving from a sign-in link: the cookie is new, so check again.
    if (params.get('signed-in')) void account.refresh()
  })
</script>

<section class="account" aria-labelledby="account-title">
  <h1 id="account-title">Account</h1>

  {#if account.status === 'checking'}
    <p class="muted">Checking…</p>
  {:else if account.status === 'unavailable'}
    <p>Sync isn't available here.</p>
    <p class="muted">
      Everything you make is saved in this browser and works offline. To sync songs and
      sounds between devices and share links, use a ChipForge server: the hosted service, or
      your own with <code>docker compose up</code> (see <code>deploy/</code> in the source).
    </p>
  {:else if account.status === 'signed-out'}
    <p>Sign in to sync your songs and sounds between devices and to share songs by link.</p>
    {#if linkError}
      <p class="error" role="alert">That sign-in link has expired or was already used. Ask for a new one.</p>
    {/if}
    {#if account.linkSentTo}
      <p class="sent" role="status">
        Check <strong>{account.linkSentTo}</strong> for a sign-in link. It works once, for 15 minutes.
      </p>
      <button class="link" onclick={() => (account.linkSentTo = null)}>Use a different address</button>
    {:else}
      <form
        onsubmit={(e) => {
          e.preventDefault()
          void account.requestLink(email)
        }}
      >
        <label for="email">Email</label>
        <div class="row">
          <input id="email" type="email" required autocomplete="email" bind:value={email} placeholder="you@example.com" />
          <button class="key" type="submit">Email me a sign-in link</button>
        </div>
        <p class="muted">No password needed. We only use your address to sign you in.</p>
      </form>
    {/if}
    {#if account.error}<p class="error" role="alert">{account.error}</p>{/if}
  {:else}
    <p>Signed in as <strong>{account.email}</strong>.</p>
    <p class="muted" role="status">
      {#if account.syncing}Syncing…{:else if account.lastSynced}Songs and sounds synced at {when(account.lastSynced)}.
        Changes sync as you work.{/if}
    </p>
    {#if account.conflicts.length}
      <div class="notice" role="status">
        <p>Some songs changed on two devices at once, so both versions were kept:</p>
        <ul>{#each account.conflicts as title, i (i)}<li>{title}</li>{/each}</ul>
      </div>
    {/if}
    {#if account.error}<p class="error" role="alert">Sync problem: {account.error}</p>{/if}
    <div class="row">
      <button class="key" onclick={() => account.syncAll()} disabled={account.syncing}>Sync now</button>
      <button class="key" onclick={() => account.signOut()}>Sign out</button>
    </div>
  {/if}
</section>

<style>
  .account {
    grid-area: work;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: calc(var(--u) * 4);
    max-width: 640px;
    padding: calc(var(--u) * 8) calc(var(--u) * 6);
    overflow-y: auto;
  }

  h1 {
    font-size: var(--step-4);
    font-weight: 600;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 2);
    width: 100%;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--u) * 2);
  }

  input {
    flex: 1 1 240px;
    padding: calc(var(--u) * 2) calc(var(--u) * 3);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: var(--ink);
  }

  .muted {
    color: var(--muted);
  }

  .error {
    color: var(--pulse1);
  }

  .sent,
  .notice {
    padding: calc(var(--u) * 3) calc(var(--u) * 4);
    border-left: 3px solid var(--tri);
    background: var(--panel);
  }

  .notice ul {
    margin: var(--u) 0 0;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    text-decoration: underline;
    cursor: pointer;
  }

  code {
    font-family: var(--font-data);
  }
</style>
