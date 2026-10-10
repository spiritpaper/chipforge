<script lang="ts">
  import { api } from '../../account/api'
  import { engine } from '../../audio/engine.svelte'
  import { composer } from '../../composer/composer.svelte'
  import { validateSong } from '../../song/validate'
  import { songSeconds, type Song } from '../../song/model'
  import PixelIcon from '../PixelIcon.svelte'

  let { slug }: { slug: string } = $props()
  let song = $state.raw<Song | null>(null)
  let error = $state<string | null>(null)

  $effect(() => {
    song = null
    error = null
    api<{ song: unknown }>(`/shared/${slug}`)
      .then((r) => {
        song = validateSong(r.song)
        if (!song) error = 'This shared song is damaged.'
      })
      .catch((e) => (error = e instanceof Error ? e.message : String(e)))
  })

  function toggle() {
    if (!song) return
    if (engine.playing) engine.stop()
    else {
      engine.setSong(song)
      void engine.play()
    }
  }

  async function copyToMine() {
    if (!song) return
    engine.stop()
    await composer.init()
    await composer.create(structuredClone(song))
    location.hash = '#/compose'
  }

  const length = (s: Song) => {
    const t = songSeconds(s)
    return `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`
  }
</script>

<section class="shared" aria-labelledby="shared-title">
  {#if error}
    <h1 id="shared-title">Can't open this song</h1>
    <p class="muted">{error}</p>
  {:else if !song}
    <p class="muted">Loading the shared song…</p>
  {:else}
    <p class="muted">Shared with you</p>
    <h1 id="shared-title">{song.title}</h1>
    <p class="muted">{song.bpm} BPM, {length(song)} per loop, {song.instruments.length} instruments</p>
    <div class="row">
      <button class="key big" onclick={toggle}>
        <PixelIcon name={engine.playing ? 'stop' : 'play'} />
        {engine.playing ? 'Stop' : 'Play'}
      </button>
      <button class="key big" onclick={copyToMine}>
        <PixelIcon name="note" /> Copy to my songs
      </button>
    </div>
    <p class="muted">Your copy is yours to change; the original stays as it is.</p>
  {/if}
</section>

<style>
  .shared {
    grid-area: work;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: calc(var(--u) * 3);
    padding: calc(var(--u) * 10) calc(var(--u) * 6);
  }

  h1 {
    font-size: var(--step-4);
    font-weight: 600;
    line-height: 1.1;
  }

  .muted {
    color: var(--muted);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--u) * 2);
    margin-top: calc(var(--u) * 2);
  }

  .big {
    min-height: 44px;
    padding: 0 calc(var(--u) * 5);
  }
</style>
