<script lang="ts">
  import { account } from '../../account/account.svelte'
  import { PAYMENT_RESULTS, formatPrice, planFeatures } from '../../account/billing'

  let email = $state('')
  const params = new URLSearchParams(location.hash.split('?')[1] ?? '')
  const linkError = params.get('error') === 'link'
  const payment = PAYMENT_RESULTS[params.get('payment') ?? '']
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })

  const when = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  $effect(() => {
    // Arriving from a sign-in link: the cookie is new, so check again.
    if (params.get('signed-in') || params.get('payment')) void account.refresh()
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
    {#if account.limitMessage}<p class="notice" role="status">{account.limitMessage}</p>{/if}
    {#if account.error}<p class="error" role="alert">Sync problem: {account.error}</p>{/if}
    <div class="row">
      <button class="key" onclick={() => account.syncAll()} disabled={account.syncing}>Sync now</button>
      <button class="key" onclick={() => account.signOut()}>Sign out</button>
    </div>

    {#if account.billing?.enabled && account.plan}
      <section class="plans" aria-labelledby="plans-title">
        <h2 id="plans-title">Plan</h2>
        {#if payment}
          <p class={payment.ok ? 'sent' : payment.ok === null ? 'muted' : 'error'} role="status">{payment.text}</p>
        {/if}
        <p>
          You're on <strong>{account.plan.name}</strong>{#if account.plan.until}, paid until {day(account.plan.until)}{/if}.
          {#if account.plan.maxSongs !== null && account.usage}
            {account.usage.songs} of {account.plan.maxSongs} songs synced.
          {/if}
        </p>
        <div class="cards">
          {#each account.billing.plans.filter((p) => p.id !== 'free') as p (p.id)}
            <div class="card" class:current={p.id === account.plan.id}>
              <h3>{p.name}</h3>
              <ul>{#each planFeatures(p) as f, i (i)}<li>{f}</li>{/each}</ul>
              {#if account.billing.checkout}
                <div class="row">
                  {#each ['month', 'year'] as const as period (period)}
                    {#if p.prices[period]}
                      <button class="key" onclick={() => account.checkout(p.id, period)}>
                        {p.id === account.plan.id ? 'Add' : 'Pay for'} a {period}: {formatPrice(p.prices[period]!, account.billing.currency)}
                      </button>
                    {/if}
                  {/each}
                </div>
              {:else}
                <p class="muted">Payments aren't set up on this server yet.</p>
              {/if}
            </div>
          {/each}
        </div>
        <p class="muted">Plans are prepaid: a payment adds a month or a year, and nothing renews by itself.</p>
      </section>
    {/if}
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

  .plans {
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 3);
    width: 100%;
    margin-top: calc(var(--u) * 4);
    padding-top: calc(var(--u) * 5);
    border-top: 1px solid var(--line);
  }

  h2 {
    font-size: var(--step-2);
    font-weight: 600;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: calc(var(--u) * 3);
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 2);
    padding: calc(var(--u) * 4);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: var(--panel);
  }

  .card.current {
    border-color: var(--pulse2);
  }

  h3 {
    font-size: var(--step-1);
    font-weight: 600;
  }

  .card ul {
    margin: 0;
    padding-left: calc(var(--u) * 5);
    color: var(--muted);
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
