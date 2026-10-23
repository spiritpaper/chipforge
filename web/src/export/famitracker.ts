// FamiTracker text export (File → Import Text in FamiTracker 0.4.x and Dn-FamiTracker).
// ChipForge's model follows FamiTracker, so notes, instruments, volumes, effect letters
// and macros map directly. Differences, also stated in the Export dialog:
// - triangle notes are written an octave up: FamiTracker's triangle sounds an octave
//   below its written note, ChipForge's sounds as written;
// - slides (1xx, 2xx, 3xx) and bend macros use pitch-period units in FamiTracker, so
//   they won't match exactly.

import { CHANNEL_COUNT, NOTE_OFF, NOTE_RELEASE, type Cell, type Macro, type Song } from '../song/model'
import { famiTempo } from '../song/import/famitracker'

const NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-']
const TRIANGLE = 2
const NOISE = 3
/** FamiTracker macro types. */
const MACRO_TYPE = { volume: 0, arpeggio: 1, pitch: 2, duty: 4 } as const

const hex = (v: number, digits: number) => v.toString(16).toUpperCase().padStart(digits, '0')
const quote = (s: string) => `"${s.replace(/"/g, "'")}"`

function note(cell: Cell, channel: number): string {
  const n = cell.note
  if (n === null) return '...'
  if (n === NOTE_OFF) return '---'
  if (n === NOTE_RELEASE) return '==='
  if (channel === NOISE) return `${hex(n % 16, 1)}-#`
  const written = Math.min(127, channel === TRIANGLE ? n + 12 : n)
  // FamiTracker's octaves match MIDI's (A-4 = 440 Hz), from octave 0 to 7.
  const octave = Math.min(7, Math.max(0, Math.floor(written / 12) - 1))
  return `${NAMES[written % 12]}${octave}`
}

function row(cell: Cell, channel: number, speed: number): string {
  const inst = cell.instrument === null ? '..' : hex(cell.instrument, 2)
  const vol = cell.volume === null ? '.' : hex(cell.volume, 1)
  // Fxx of 20 and up sets the tempo, in FamiTracker's units.
  const param = cell.effect === 'F' && cell.param >= 0x20 ? Math.min(0xff, Math.max(0x20, famiTempo(cell.param, speed))) : cell.param
  const fx = cell.effect === null ? '...' : `${cell.effect}${hex(param, 2)}`
  return `${note(cell, channel)} ${inst} ${vol} ${fx}`
}

export function songToFamiTracker(song: Song): string {
  const out: string[] = ['# FamiTracker text export 0.4.2', '# Made with ChipForge', '']
  out.push('# Song information', `TITLE           ${quote(song.title.slice(0, 31))}`, 'AUTHOR          ""', 'COPYRIGHT       ""', '')
  out.push('# Global settings', 'MACHINE         0', 'FRAMERATE       0', 'EXPANSION       0', 'VIBRATO         1', 'SPLIT           32', '')

  // Each instrument's macros become numbered FamiTracker macros, per type.
  const next = { volume: 0, arpeggio: 0, pitch: 0, duty: 0 }
  const macroLines: string[] = []
  const instLines: string[] = []
  song.instruments.slice(0, 64).forEach((inst, i) => {
    const ids = (Object.keys(MACRO_TYPE) as (keyof typeof MACRO_TYPE)[]).map((kind) => {
      const m: Macro = inst[kind]
      if (!m.values.length) return -1
      const id = next[kind]++
      macroLines.push(`MACRO ${String(MACRO_TYPE[kind]).padStart(5)} ${String(id).padStart(3)} ${String(m.loop ?? -1).padStart(3)} ${String(m.release ?? -1).padStart(3)}   0 : ${m.values.join(' ')}`)
      return id
    })
    const [vol, arp, pitch, duty] = ids
    instLines.push(`INST2A03 ${String(i).padStart(3)} ${[vol, arp, pitch, -1, duty].map((v) => String(v).padStart(5)).join(' ')} ${quote(inst.name.slice(0, 31))}`)
  })
  out.push('# Macros', ...macroLines, '', '# DPCM samples', '', '# Instruments', ...instLines, '')

  // FamiTracker's rows last speed × (2.5 / tempo) seconds, ChipForge's 15 / BPM, so
  // its tempo is BPM × speed / 6 (the same number only at speed 6).
  const tempo = Math.min(255, Math.max(32, famiTempo(song.bpm, song.speed)))
  out.push('# Tracks', '', `TRACK ${String(song.patternLength).padStart(3)} ${String(song.speed).padStart(3)} ${String(tempo).padStart(3)} ${quote(song.title.slice(0, 31))}`)
  out.push(`COLUMNS : ${Array(CHANNEL_COUNT + 1).fill(1).join(' ')}`, '')
  song.order.forEach((p, i) => out.push(`ORDER ${hex(i, 2)} : ${[p, p, p, p, 0].map((x) => hex(x, 2)).join(' ')}`))
  out.push('')
  const emptyDpcm = '... .. . ...'
  song.patterns.forEach((pattern, p) => {
    out.push(`PATTERN ${hex(p, 2)}`)
    for (let r = 0; r < song.patternLength; r++) {
      const cells = pattern.channels.map((cells, ch) => row(cells[r], ch, song.speed))
      out.push(`ROW ${hex(r, 2)} : ${[...cells, emptyDpcm].join(' : ')}`)
    }
    out.push('')
  })
  out.push('# End of export', '')
  return out.join('\n')
}
