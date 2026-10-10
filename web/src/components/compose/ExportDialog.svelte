<script lang="ts">
  import { composer } from '../../composer/composer.svelte'
  import { songToMidi } from '../../midi/convert'
  import { writeMidi } from '../../midi/smf'
  import { download } from '../../sfx/export'
  import { slugify } from '../../sfx/library-core'
  import { toast } from '../../lib/toast.svelte'
  import { loadChipModule } from '../../audio/wasm'
  import { encodeSong } from '../../song/encode'
  import { instantiateChip, renderVgm } from '../../audio/chip-wasm'
  import { songToFamiTracker } from '../../export/famitracker'
  import RenderWorker from '../../export/render-worker.ts?worker'
  import type { RenderRequest, RenderResponse } from '../../export/render-worker'
  import type { AudioFormat, Ending } from '../../export/audio'
  import { readPref, writePref } from '../../lib/prefs'
  import { account } from '../../account/account.svelte'

  let { open = $bindable(false) }: { open: boolean } = $props()
  let dialog: HTMLDialogElement

  $effect(() => {
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  })

  const base = $derived(slugify(composer.song.title))

  let format = $state<AudioFormat>(readPref('export.format') === 'ogg' ? 'ogg' : 'wav')
  let ending = $state<Ending>(readPref('export.ending') === 'fade' ? 'fade' : 'loop')
  let sampleRate = $state(Number(readPref('export.rate')) === 48_000 ? 48_000 : 44_100)
  let busy = $state(false)
  let result = $state<string | null>(null)

  const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  async function exportAudio() {
    writePref('export.format', format)
    writePref('export.ending', ending)
    writePref('export.rate', String(sampleRate))
    busy = true
    result = null
    const worker = new RenderWorker()
    try {
      const request: RenderRequest = {
        module: await loadChipModule(),
        song: encodeSong(composer.song),
        title: composer.song.title,
        sampleRate,
        format,
        ending,
      }
      const reply = await new Promise<RenderResponse>((resolve) => {
        worker.onmessage = (e: MessageEvent<RenderResponse>) => resolve(e.data)
        worker.onerror = () => resolve({ ok: false, error: 'The renderer stopped unexpectedly.' })
        worker.postMessage(request, [request.song.buffer])
      })
      if (!reply.ok) {
        result = `Export failed: ${reply.error}`
        return
      }
      const file = `${base}.${format}`
      download(reply.bytes, file, format === 'wav' ? 'audio/wav' : 'audio/ogg')
      const loopNote =
        ending === 'fade'
          ? 'with a faded ending'
          : reply.loopStartSeconds !== null
            ? `looping from ${time(reply.loopStartSeconds)}`
            : 'with no loop points: the song never loops back within 10 minutes'
      result = `Saved ${file}: ${time(reply.seconds)}, ${loopNote}.`
      toast.show(`Saved ${file}`)
    } finally {
      worker.terminate()
      busy = false
    }
  }

  function exportMidi() {
    download(writeMidi(songToMidi(composer.song)), `${base}.mid`, 'audio/midi')
    toast.show(`Saved ${base}.mid`)
  }

  const engineBytes = $derived(open ? encodeSong(composer.song).length : 0)

  function exportEngineFile() {
    download(encodeSong(composer.song), `${base}.chipsong`, 'application/octet-stream')
    toast.show(`Saved ${base}.chipsong`)
  }

  async function exportVgm() {
    const wasm = await instantiateChip(await loadChipModule())
    const bytes = renderVgm(wasm, encodeSong(composer.song), composer.song.title)
    if (!bytes) {
      toast.show('This song could not be converted to VGM.')
      return
    }
    download(bytes, `${base}.vgm`, 'application/octet-stream')
    toast.show(`Saved ${base}.vgm`)
  }

  function exportFamiTracker() {
    download(songToFamiTracker(composer.song), `${base}.famitracker.txt`, 'text/plain')
    toast.show(`Saved ${base}.famitracker.txt`)
  }

  let shareUrl = $state<string | null>(null)
  let sharing = $state(false)

  async function share() {
    if (!composer.projectId) return
    sharing = true
    try {
      shareUrl = await account.share(composer.projectId)
      await navigator.clipboard.writeText(shareUrl).catch(() => {})
      toast.show('Share link copied.')
    } catch (err) {
      toast.show(`Couldn't share: ${err instanceof Error ? err.message : err}`)
    } finally {
      sharing = false
    }
  }

  async function unshare() {
    if (!composer.projectId) return
    await account.unshare(composer.projectId)
    shareUrl = null
    toast.show('Share link turned off.')
  }

  function exportSongFile() {
    download(JSON.stringify(composer.song), `${base}.chipsong.json`, 'application/json')
    toast.show(`Saved ${base}.chipsong.json`)
  }
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="export-title">
  <header>
    <h2 id="export-title">Export “{composer.song.title}”</h2>
    <button class="key" onclick={() => (open = false)}>Close</button>
  </header>

  <section aria-labelledby="share-title">
    <h3 id="share-title">Share link</h3>
    {#if account.status === 'signed-in'}
      <p>Anyone with the link can play this song and copy it. Later edits show up at the same link.</p>
      {#if shareUrl}
        <input class="url" readonly value={shareUrl} aria-label="Share link" onfocus={(e) => e.currentTarget.select()} />
        <button class="key" onclick={unshare}>Turn off the link</button>
      {:else}
        <button class="key" onclick={share} disabled={sharing}>{sharing ? 'Making a link…' : 'Create share link'}</button>
      {/if}
    {:else if account.status === 'signed-out'}
      <p><a href="#/account" onclick={() => (open = false)}>Sign in</a> to share songs by link.</p>
    {:else}
      <p>Sharing needs a ChipForge server; this copy of the app runs without one.</p>
    {/if}
  </section>

  <section aria-labelledby="audio-title">
    <h3 id="audio-title">Audio</h3>
    <fieldset>
      <legend>Format</legend>
      <label><input type="radio" bind:group={format} value="wav" /> WAV <span class="note">lossless, largest</span></label>
      <label><input type="radio" bind:group={format} value="ogg" /> OGG Vorbis <span class="note">about a sixth the size</span></label>
    </fieldset>
    <fieldset>
      <legend>Ending</legend>
      <label>
        <input type="radio" bind:group={ending} value="loop" /> Loop for games
        <span class="note">Stops where the song loops back, with loop points that Godot, Unity, FMOD and RPG Maker read.</span>
      </label>
      <label>
        <input type="radio" bind:group={ending} value="fade" /> Fade out for listening
        <span class="note">Plays the looping part once more and fades out.</span>
      </label>
    </fieldset>
    <label class="inline">
      Sample rate
      <select bind:value={sampleRate}>
        <option value={44_100}>44.1 kHz</option>
        <option value={48_000}>48 kHz</option>
      </select>
    </label>
    <button class="key" onclick={exportAudio} disabled={busy}>{busy ? 'Rendering…' : `Download ${base}.${format}`}</button>
    {#if result}<p class="result" role="status">{result}</p>{/if}
  </section>

  <section>
    <h3>Game engine file</h3>
    <p>
      For the ChipForge plugins for Godot, Unity and C/C++. The song plays live from this file, so
      you can mute layers, change tempo or switch sections as the game changes. This song is
      {(engineBytes / 1024).toFixed(1)} KB.
    </p>
    <button class="key" onclick={exportEngineFile}>Download {base}.chipsong</button>
  </section>

  <section>
    <h3>VGM file</h3>
    <p>
      The song as writes to a real NES sound chip, for VGM players (VGMPlay, foobar2000) and
      chiptune archives. Loops where the song loops.
    </p>
    <button class="key" onclick={exportVgm}>Download {base}.vgm</button>
  </section>

  <section>
    <h3>FamiTracker text</h3>
    <p>
      Open in FamiTracker or Dn-FamiTracker with File → Import Text. Notes, instruments, volumes
      and most effects carry over; slides and pitch bends use different units there, so they
      may sound a little different.
    </p>
    <button class="key" onclick={exportFamiTracker}>Download {base}.famitracker.txt</button>
  </section>

  <section>
    <h3>MIDI file</h3>
    <p>Notes and tempo for other music software. Instrument sounds and effects are not part of MIDI; the noise channel becomes General MIDI drums.</p>
    <button class="key" onclick={exportMidi}>Download {base}.mid</button>
  </section>

  <section>
    <h3>Song file</h3>
    <p>The whole song for ChipForge: a backup, or a way to move it to another browser. Open it from Songs.</p>
    <button class="key" onclick={exportSongFile}>Download {base}.chipsong.json</button>
  </section>
</dialog>

<style>
  dialog {
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
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
    gap: calc(var(--u) * 4);
    margin-bottom: calc(var(--u) * 4);
  }

  h2 {
    font-size: var(--step-2);
    font-weight: 600;
  }

  section {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: calc(var(--u) * 2);
    padding: calc(var(--u) * 4) 0;
    border-top: 1px solid var(--line);
  }

  h3 {
    font-size: var(--step-1);
    font-weight: 600;
  }

  p {
    color: var(--muted);
    max-width: 60ch;
  }

  fieldset {
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 2);
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    margin-bottom: var(--u);
    color: var(--muted);
  }

  fieldset label {
    display: block;
    padding-left: calc(var(--u) * 6);
    text-indent: calc(var(--u) * -6);
  }

  input[type='radio'] {
    accent-color: var(--text);
  }

  .note {
    display: block;
    text-indent: 0;
    color: var(--muted);
    font-size: var(--step--1);
  }

  .inline {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 2);
    color: var(--muted);
  }

  select {
    padding: var(--u) calc(var(--u) * 2);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: var(--ink);
    font: inherit;
    color: var(--text);
  }

  .url {
    width: 100%;
    padding: var(--u) calc(var(--u) * 2);
    border: 1px solid var(--line);
    border-radius: var(--radius-key);
    background: var(--ink);
    font-family: var(--font-data);
    font-size: var(--step--1);
  }

  a {
    color: var(--text);
  }

  .result {
    color: var(--text);
  }
</style>
