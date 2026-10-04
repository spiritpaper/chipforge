<script lang="ts">
  import { engine } from './audio/engine.svelte'
  import { CHANNELS } from './audio/channels'
  import { isTypingTarget, sfxShortcut, songShortcut } from './lib/keys'
  import { route } from './lib/route.svelte'
  import { lab } from './sfx/lab.svelte'
  import ModeRail from './components/ModeRail.svelte'
  import Transport from './components/Transport.svelte'
  import SongView from './components/SongView.svelte'
  import ChannelStrip from './components/ChannelStrip.svelte'
  import SfxLab from './components/sfx/SfxLab.svelte'
  import Toast from './components/Toast.svelte'

  $effect(() => {
    engine.preload()
    void lab.init(route.takeShareCode())
  })

  // The demo song belongs to Sound check; leaving it stops the music.
  $effect(() => {
    if (route.mode !== 'demo') engine.stopSong()
  })

  function onHashChange() {
    const code = route.takeShareCode()
    if (!code) return
    if (lab.status === 'ready') lab.openShared(code)
    else void lab.init(code)
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target, e.code)) return
    if (route.mode === 'demo') {
      const shortcut = songShortcut(e.code, e.shiftKey)
      if (!shortcut) return
      // Stop Space from also "clicking" whichever button has focus.
      e.preventDefault()
      if (shortcut.action === 'togglePlay') engine.togglePlay()
      else if (shortcut.action === 'mute') engine.toggleMute(shortcut.channel)
      else engine.toggleSolo(shortcut.channel)
      return
    }

    const shortcut = sfxShortcut(e.code, e.shiftKey)
    if (!shortcut || lab.status !== 'ready') return
    e.preventDefault()
    switch (shortcut.action) {
      case 'play':
        return void lab.play()
      case 'preset':
        return lab.generate(shortcut.preset)
      case 'mutate':
        return lab.mutate()
      case 'keep':
        return lab.toggleKeep()
      case 'export':
        return lab.exportWav()
      case 'copyLink':
        return void lab.copyLink()
      case 'fineTune':
        return lab.toggleFineTune()
      case 'move':
        return lab.move(shortcut.delta)
    }
  }
</script>

<svelte:window onkeydown={onKeydown} onhashchange={onHashChange} />

<div class="shell">
  <ModeRail current={route.mode} />
  <Transport mode={route.mode} />
  {#if route.mode === 'demo'}
    <SongView />
    <section class="strips" aria-label="Chip channels">
      {#each CHANNELS as info, channel (info.name)}
        <ChannelStrip {channel} {info} />
      {/each}
    </section>
  {:else}
    <SfxLab />
  {/if}
</div>

<Toast message={lab.toast} />

<style>
  .shell {
    display: grid;
    grid-template:
      'rail transport' auto
      'rail work' 1fr
      'rail strips' auto
      / var(--rail-w) 1fr;
    height: 100%;
  }

  .strips {
    grid-area: strips;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    background: var(--line);
    border-top: 1px solid var(--line);
  }

  @media (max-width: 720px) {
    .shell {
      grid-template:
        'transport' auto
        'work' 1fr
        'strips' auto
        'rail' auto
        / 1fr;
    }

    .strips {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
