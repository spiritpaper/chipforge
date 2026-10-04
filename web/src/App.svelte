<script lang="ts">
  import { untrack } from 'svelte'
  import { engine } from './audio/engine.svelte'
  import { CHANNELS } from './audio/channels'
  import { isTypingTarget, sfxShortcut, songShortcut } from './lib/keys'
  import { route } from './lib/route.svelte'
  import { lab } from './sfx/lab.svelte'
  import { demo } from './lib/demo.svelte'
  import { composer } from './composer/composer.svelte'
  import ComposeView from './components/compose/ComposeView.svelte'
  import ModeRail from './components/ModeRail.svelte'
  import Transport from './components/Transport.svelte'
  import SongView from './components/SongView.svelte'
  import ChannelStrip from './components/ChannelStrip.svelte'
  import SfxLab from './components/sfx/SfxLab.svelte'
  import Toast from './components/Toast.svelte'
  import { toast } from './lib/toast.svelte'

  $effect(() => {
    void lab.init(route.takeShareCode())
  })

  // Each song screen hands the engine its own song; leaving stops the music. Only the
  // route may re-run this: stop() reads `playing`, which would otherwise stop every play.
  $effect(() => {
    const mode = route.mode
    untrack(() => {
      engine.stop()
      if (mode === 'demo') engine.setSong(demo.song)
      if (mode === 'compose') void composer.init().then(() => engine.setSong(composer.song))
    })
  })

  // Sound check's tempo control edits its song; the Composer pushes its own edits.
  $effect(() => {
    if (route.mode === 'demo') engine.setSong(demo.song)
  })

  function onHashChange() {
    const code = route.takeShareCode()
    if (!code) return
    if (lab.status === 'ready') lab.openShared(code)
    else void lab.init(code)
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.defaultPrevented) return
    if (route.mode === 'compose') {
      const mod = e.ctrlKey || e.metaKey
      // Text fields keep their own undo.
      const typing = isTypingTarget(e.target, e.code)
      if (mod && !typing && e.code === 'KeyZ') {
        e.preventDefault()
        return e.shiftKey ? composer.redo() : composer.undo()
      }
      if (mod && !typing && e.code === 'KeyY') {
        e.preventDefault()
        return composer.redo()
      }
      if (mod || e.altKey || typing) return
      if (e.code === 'Backquote') {
        e.preventDefault()
        return composer.setView(composer.view === 'tracker' ? 'roll' : 'tracker')
      }
      if (e.code === 'Space') {
        e.preventDefault()
        composer.togglePlay()
      }
      return
    }
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

<div class="shell" data-mode={route.mode}>
  <ModeRail current={route.mode} />
  <Transport mode={route.mode} />
  {#if route.mode === 'demo' || route.mode === 'compose'}
    {#if route.mode === 'demo'}<SongView />{:else}<ComposeView />{/if}
    <section class="strips" aria-label="Chip channels">
      {#each CHANNELS as info, channel (info.name)}
        <ChannelStrip {channel} {info} />
      {/each}
    </section>
  {:else}
    <SfxLab />
  {/if}
</div>

<Toast message={toast.current} />

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

    /* On phones the pattern needs the room more than the scopes do. */
    .shell[data-mode='compose'] .strips {
      display: none;
    }
  }
</style>
