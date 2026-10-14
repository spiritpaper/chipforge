<script lang="ts">
  import PixelIcon, { type GlyphName } from './PixelIcon.svelte'
  import type { Mode } from '../lib/hash'
  import { isDesktop, openSupportPage } from '../lib/desktop'
  import { SUPPORT_URL } from '../lib/support'

  let { current }: { current: Mode } = $props()

  interface RailItem {
    label: string
    icon: GlyphName
    /** Route for available modes; null for ones that haven't shipped. */
    mode: Mode | null
    comingIn?: string
  }

  const items: RailItem[] = [
    { label: 'SFX Lab', icon: 'spark', mode: 'sfx' },
    { label: 'Compose', icon: 'note', mode: 'compose' },
    { label: 'Convert', icon: 'convert', mode: 'convert' },
    { label: 'Library', icon: 'stack', mode: null, comingIn: 'a later update' },
    // The desktop app works offline, with no server to sign in to.
    ...(isDesktop ? [] : [{ label: 'Account', icon: 'person', mode: 'account' } satisfies RailItem]),
  ]

  // In the desktop app a new-window link does nothing, so the system browser opens it.
  function openSupport(event: MouseEvent) {
    if (!isDesktop) return
    event.preventDefault()
    void openSupportPage()
  }
</script>

<nav class="rail" aria-label="Modes">
  <p class="wordmark" aria-label="ChipForge">Chip<br />Forge</p>
  <ul>
    {#each items as item (item.label)}
      <li>
        {#if item.mode}
          <a class="mode" href="#/{item.mode}" aria-current={item.mode === current ? 'page' : undefined}>
            <PixelIcon name={item.icon} size={24} />
            <span>{item.label}</span>
          </a>
        {:else}
          <button class="mode" aria-disabled="true" title="{item.label} arrives in {item.comingIn}">
            <PixelIcon name={item.icon} size={24} />
            <span>{item.label}</span>
            <span class="soon">Soon</span>
          </button>
        {/if}
      </li>
    {/each}
  </ul>
  {#if SUPPORT_URL}
    <a class="mode support" href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" onclick={openSupport}>
      <PixelIcon name="heart" size={24} />
      <span>Support</span>
    </a>
  {/if}
</nav>

<style>
  .rail {
    grid-area: rail;
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 6);
    padding: calc(var(--u) * 4) calc(var(--u) * 2);
    background: var(--panel);
    border-right: 1px solid var(--line);
  }

  .wordmark {
    font-family: var(--font-mark);
    font-size: var(--step-1);
    line-height: 1;
    text-align: center;
    color: var(--text);
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: var(--u);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .mode {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--u);
    width: 100%;
    padding: calc(var(--u) * 2) var(--u);
    border: 0;
    border-radius: var(--radius-key);
    background: none;
    color: var(--muted);
    font-size: var(--step--1);
    text-align: center;
    text-decoration: none;
    cursor: pointer;
  }

  .mode:hover {
    color: var(--text);
  }

  .mode[aria-current='page'] {
    background: var(--line);
    color: var(--text);
  }

  .mode[aria-disabled='true'] {
    cursor: default;
    opacity: 0.55;
  }

  .mode[aria-disabled='true']:hover {
    color: var(--muted);
  }

  .support {
    margin-top: auto;
  }

  .soon {
    font-size: 10px;
    color: var(--muted);
  }

  @media (max-width: 720px) {
    .rail {
      flex-direction: row;
      padding: var(--u);
      border-right: 0;
      border-top: 1px solid var(--line);
    }

    .wordmark,
    .soon {
      display: none;
    }

    ul {
      flex-direction: row;
      flex: 1;
    }

    li {
      flex: 1;
    }

    .mode {
      min-height: 44px;
    }

    .support {
      width: auto;
      margin-top: 0;
    }
  }
</style>
