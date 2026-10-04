// Web MIDI keyboard input for the Composer.

import { composer } from './composer.svelte'

class MidiInput {
  status = $state<'off' | 'connecting' | 'on' | 'unsupported' | 'denied'>('off')
  devices = $state<string[]>([])
  /** Write played notes into the pattern, not just hear them. */
  record = $state(true)
  private access: MIDIAccess | null = null

  get supported() {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
  }

  async connect() {
    if (!this.supported) {
      this.status = 'unsupported'
      return
    }
    this.status = 'connecting'
    try {
      this.access = await navigator.requestMIDIAccess()
      this.access.onstatechange = () => this.refresh()
      this.refresh()
      this.status = 'on'
    } catch {
      this.status = 'denied'
    }
  }

  private refresh() {
    const inputs = [...(this.access?.inputs.values() ?? [])]
    this.devices = inputs.map((i) => i.name ?? 'MIDI device')
    for (const input of inputs) input.onmidimessage = (e) => e.data && this.handle(e.data)
  }

  handle(data: Uint8Array) {
    const [status, note, velocity] = data
    const type = status & 0xf0
    if (type === 0x90 && velocity > 0) composer.midiNoteOn(note, this.record)
    else if (type === 0x80 || (type === 0x90 && velocity === 0)) composer.midiNoteOff(note)
  }
}

export const midiInput = new MidiInput()
