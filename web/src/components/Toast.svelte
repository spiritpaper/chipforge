<script lang="ts">
  let { message }: { message: { id: number; text: string } | null } = $props()

  let visible = $state<{ id: number; text: string } | null>(null)

  $effect(() => {
    if (!message) return
    visible = message
    const timer = setTimeout(() => (visible = null), 3200)
    return () => clearTimeout(timer)
  })
</script>

<div class="toast-region" role="status" aria-live="polite">
  {#if visible}
    {#key visible.id}
      <p class="toast">{visible.text}</p>
    {/key}
  {/if}
</div>

<style>
  .toast-region {
    position: fixed;
    left: 50%;
    bottom: calc(var(--u) * 6);
    transform: translateX(-50%);
    z-index: 10;
    pointer-events: none;
    width: max-content;
    max-width: calc(100vw - 32px);
  }

  .toast {
    padding: calc(var(--u) * 2) calc(var(--u) * 4);
    border-radius: var(--radius-key);
    background: var(--text);
    color: var(--ink);
    box-shadow: 0 2px 0 var(--keycap-shadow);
  }

  @media (max-width: 720px) {
    .toast-region {
      bottom: 88px;
    }
  }
</style>
