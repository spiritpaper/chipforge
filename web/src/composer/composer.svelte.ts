// Composer state: the open song, undo history, cursor and selection, and every
// editing command the tracker, piano roll and panels call.

import { engine } from '../audio/engine.svelte'
import { readPref, writePref } from '../lib/prefs'
import {
  allChannels,
  clearRegion,
  copyRegion,
  deleteRow,
  insertRow,
  normalizeRegion,
  pasteClip,
  replaceChannel,
  resizePatterns,
  setNibble,
  transposeRegion,
  updateCell,
  type Clip,
  type Region,
} from '../song/edit'
import { CHANNEL_COUNT, LIMITS, NOTE_OFF, NOTE_RELEASE, emptySong, type Cell, type ChipKind, type Song } from '../song/model'
import { firstLight } from '../song/templates'
import { COLUMNS, COLUMN_COUNT, type Column, type TrackerAction } from './keys'
import { addInstrument, deleteInstrument, updateInstrument, type MacroKind } from '../song/instrument-edit'
import type { Instrument, Macro } from '../song/model'
import { deleteProject, listProjects, loadProject, saveProject, type ProjectMeta } from './projects'

export interface Cursor {
  row: number
  channel: number
  column: number
}

const HISTORY_LIMIT = 300
/** Edits with the same key this close together undo as one step (e.g. a drag). */
const COALESCE_MS = 800

class Composer {
  status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle')
  projectId = $state<string | null>(null)
  projects = $state<ProjectMeta[]>([])
  song = $state.raw<Song>(emptySong())
  canUndo = $state(false)
  canRedo = $state(false)

  /** Which order entry (and so which pattern) is being edited. */
  orderIndex = $state(0)
  cursor = $state<Cursor>({ row: 0, channel: 0, column: 0 })
  selection = $state.raw<Region | null>(null)
  /** Selection anchor, where a shift-selection started. */
  private anchor: { row: number; channel: number } | null = null
  octave = $state(Number(readPref('compose.octave')) || 4)
  step = $state(1)
  instrument = $state(0)
  follow = $state(readPref('compose.follow') !== 'off')
  view = $state<'tracker' | 'roll'>(readPref('compose.view') === 'roll' ? 'roll' : 'tracker')

  private past: Song[] = []
  private future: Song[] = []
  private lastEdit: { key: string; time: number } | null = null
  private clip: Clip | null = null
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private booting: Promise<void> | null = null

  get patternIndex(): number {
    return this.song.order[this.orderIndex] ?? 0
  }

  get columnName(): Column {
    return COLUMNS[this.cursor.column]
  }

  init(): Promise<void> {
    this.booting ??= this.boot()
    return this.booting
  }

  private async boot() {
    this.status = 'loading'
    try {
      this.projects = await listProjects()
      const lastId = readPref('compose.project')
      const id = this.projects.find((p) => p.id === lastId)?.id ?? this.projects[0]?.id
      const song = id ? await loadProject(id) : null
      if (id && song) this.open(id, song)
      else await this.createStarter()
      this.status = 'ready'
    } catch {
      // IndexedDB can be blocked; keep working in memory.
      this.open(crypto.randomUUID(), firstLight())
      this.status = 'ready'
    }
  }

  private open(id: string, song: Song) {
    this.projectId = id
    this.song = song
    this.past = []
    this.future = []
    this.syncHistoryFlags()
    this.orderIndex = 0
    this.cursor = { row: 0, channel: 0, column: 0 }
    this.selection = null
    this.instrument = 0
    writePref('compose.project', id)
    engine.setSong(song)
  }

  /**
   * The demo song a fresh browser opens with. It's saved without counting as the
   * user's work, so sync leaves it alone until it's edited.
   */
  private async createStarter() {
    const id = crypto.randomUUID()
    const song = firstLight()
    this.open(id, song)
    writePref('compose.starter', id)
    this.projects = await saveProject(id, song, { fromSync: true }).catch(() => this.projects)
  }

  async create(song: Song = emptySong()) {
    const id = crypto.randomUUID()
    this.open(id, song)
    this.projects = await saveProject(id, song).catch(() => this.projects)
  }

  async switchTo(id: string) {
    if (id === this.projectId) return
    await this.flushSave()
    const song = await loadProject(id)
    if (song) this.open(id, song)
  }

  /** Sync changed a stored song: refresh the list, and reload it if it's open. */
  async reloadFromStorage(id: string) {
    this.projects = await listProjects()
    if (id !== this.projectId) return
    // Drop any pending autosave: the stored copy is now the right one, and saving the
    // open song would undo the change (or resurrect a song deleted elsewhere).
    clearTimeout(this.saveTimer)
    const song = await loadProject(id)
    if (song) return this.open(id, song)
    for (const p of this.projects) {
      const next = await loadProject(p.id)
      if (next) return this.open(p.id, next)
    }
    await this.create()
  }

  async refreshProjects() {
    this.projects = await listProjects()
  }

  async duplicate(id: string) {
    const song = id === this.projectId ? this.song : await loadProject(id)
    if (song) await this.create({ ...song, title: `${song.title} copy` })
  }

  async remove(id: string) {
    this.projects = await deleteProject(id)
    if (id === this.projectId) {
      const next = this.projects[0]
      const song = next && (await loadProject(next.id))
      if (next && song) this.open(next.id, song)
      else await this.create()
    }
  }

  // ---- history -------------------------------------------------------------

  /**
   * Replaces the song with an edited version, recording undo history. Edits sharing a
   * key undo together: keys starting with "drag:" for the whole gesture, others when
   * they come in quick succession (typing a tempo, nudging a value).
   */
  commit(next: Song, coalesceKey?: string) {
    if (next === this.song) return
    const now = Date.now()
    const sameKey = coalesceKey !== undefined && this.lastEdit?.key === coalesceKey
    const coalesce = sameKey && (coalesceKey.startsWith('drag:') || now - this.lastEdit!.time < COALESCE_MS)
    if (!coalesce) {
      this.past.push(this.song)
      if (this.past.length > HISTORY_LIMIT) this.past.shift()
    }
    this.lastEdit = coalesceKey ? { key: coalesceKey, time: now } : null
    this.future = []
    this.apply(next)
  }

  undo() {
    const prev = this.past.pop()
    if (!prev) return
    this.future.push(this.song)
    this.lastEdit = null
    this.apply(prev)
  }

  redo() {
    const next = this.future.pop()
    if (!next) return
    this.past.push(this.song)
    this.lastEdit = null
    this.apply(next)
  }

  private apply(song: Song) {
    this.song = song
    this.orderIndex = Math.min(this.orderIndex, song.order.length - 1)
    this.cursor.row = Math.min(this.cursor.row, song.patternLength - 1)
    this.instrument = Math.min(this.instrument, Math.max(0, song.instruments.length - 1))
    this.syncHistoryFlags()
    engine.setSong(song)
    this.scheduleSave()
  }

  private syncHistoryFlags() {
    this.canUndo = this.past.length > 0
    this.canRedo = this.future.length > 0
  }

  private scheduleSave() {
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.flushSave(), 500)
  }

  private async flushSave() {
    clearTimeout(this.saveTimer)
    if (!this.projectId) return
    try {
      this.projects = await saveProject(this.projectId, this.song)
    } catch {
      // Storage full or blocked: the song stays open; nothing else to do here.
    }
  }

  // ---- song settings -------------------------------------------------------

  setTitle(title: string) {
    const t = title.trim()
    if (t && t !== this.song.title) this.commit({ ...this.song, title: t })
  }

  setBpm(bpm: number) {
    if (!Number.isFinite(bpm)) return
    this.commit({ ...this.song, bpm: Math.round(Math.min(LIMITS.bpm[1], Math.max(LIMITS.bpm[0], bpm))) }, 'bpm')
  }

  /** Moves the song to another chip; notes and instruments carry over. */
  setChip(chip: ChipKind) {
    if ((this.song.chip ?? 'nes') === chip) return
    const { chip: _, ...rest } = this.song
    this.commit(chip === 'gb' ? { ...rest, chip } : rest)
  }

  setSpeed(speed: number) {
    if (!Number.isFinite(speed)) return
    this.commit({ ...this.song, speed: Math.round(Math.min(LIMITS.speed[1], Math.max(LIMITS.speed[0], speed))) }, 'speed')
  }

  setPatternLength(length: number) {
    this.commit(resizePatterns(this.song, length))
  }

  setView(view: 'tracker' | 'roll') {
    this.view = view
    writePref('compose.view', view)
  }

  /** Rewrites one channel of the current pattern (piano roll edits). */
  editChannel(channel: number, cells: Cell[], coalesceKey?: string) {
    this.commit(replaceChannel(this.song, this.patternIndex, channel, cells), coalesceKey)
  }

  /**
   * Applies an arrangement edit and keeps the selection on a sensible entry:
   * `select` is the order index to edit afterwards.
   */
  arrange(next: Song, select = this.orderIndex) {
    this.commit(next)
    this.goToOrder(select)
  }

  setOctave(octave: number) {
    this.octave = Math.min(8, Math.max(0, octave))
    writePref('compose.octave', String(this.octave))
  }

  setStep(step: number) {
    this.step = Math.min(16, Math.max(0, Math.round(step) || 0))
  }

  setFollow(on: boolean) {
    this.follow = on
    writePref('compose.follow', on ? 'on' : 'off')
  }

  selectInstrument(index: number) {
    this.instrument = Math.min(this.song.instruments.length - 1, Math.max(0, index))
  }

  goToOrder(index: number) {
    this.orderIndex = Math.min(this.song.order.length - 1, Math.max(0, index))
    this.selection = null
  }

  // ---- playback ------------------------------------------------------------

  togglePlay() {
    if (engine.playing) engine.stop()
    else void engine.play(this.orderIndex, 0)
  }

  playFromCursor() {
    void engine.play(this.orderIndex, this.cursor.row)
  }

  /** Sounds a note on the cursor's channel with the current instrument. */
  preview(note: number, channel = this.cursor.channel, instrument = this.instrument) {
    void engine.preview(channel, note, instrument)
  }

  private tryTimer: ReturnType<typeof setTimeout> | undefined

  /** Plays a short test note with an instrument, then releases it. */
  tryInstrument(index = this.instrument) {
    const channel = this.cursor.channel
    clearTimeout(this.tryTimer)
    this.preview(channel === 3 ? 8 : 60, channel, index)
    this.tryTimer = setTimeout(() => this.previewOff(channel), 500)
  }

  // ---- instruments -------------------------------------------------------

  addInstrument(instrument: Instrument) {
    const next = addInstrument(this.song, instrument)
    if (next === this.song) return false
    this.commit(next)
    this.instrument = next.instruments.length - 1
    return true
  }

  duplicateInstrument(index = this.instrument) {
    const inst = this.song.instruments[index]
    return this.addInstrument({ ...inst, name: `${inst.name} copy` })
  }

  deleteInstrument(index = this.instrument) {
    this.commit(deleteInstrument(this.song, index))
  }

  renameInstrument(index: number, name: string) {
    const n = name.trim()
    if (n) this.commit(updateInstrument(this.song, index, { name: n }))
  }

  editMacro(index: number, kind: MacroKind, macro: Macro, coalesceKey?: string) {
    this.commit(updateInstrument(this.song, index, { [kind]: macro }), coalesceKey)
  }

  previewOff(channel = this.cursor.channel) {
    engine.previewOff(channel)
  }

  private heldNote: number | null = null

  /**
   * A key pressed on a MIDI keyboard: plays it, and with `record` writes it like a
   * typed note. While this pattern plays, notes land on the playing row instead.
   */
  midiNoteOn(note: number, record: boolean) {
    this.heldNote = note
    const pos = engine.position
    if (record && engine.playing && pos && pos.order === this.orderIndex) {
      this.edit({ note, instrument: this.instrument }, this.cursor.channel, pos.row)
      this.preview(note)
    } else if (record && this.view === 'tracker' && this.columnName === 'note') {
      this.enterNote(note)
    } else {
      this.preview(note)
    }
  }

  midiNoteOff(note: number) {
    if (this.heldNote === note) {
      this.previewOff()
      this.heldNote = null
    }
  }

  // ---- cursor & selection --------------------------------------------------

  setCursor(cursor: Partial<Cursor>, select = false) {
    const prev = { row: this.cursor.row, channel: this.cursor.channel }
    const row = Math.min(this.song.patternLength - 1, Math.max(0, cursor.row ?? this.cursor.row))
    const channel = Math.min(CHANNEL_COUNT - 1, Math.max(0, cursor.channel ?? this.cursor.channel))
    const column = Math.min(COLUMN_COUNT - 1, Math.max(0, cursor.column ?? this.cursor.column))
    this.cursor = { row, channel, column }
    if (select) {
      this.anchor ??= prev
      this.selection = normalizeRegion({ fromChannel: this.anchor.channel, toChannel: channel, fromRow: this.anchor.row, toRow: row })
    } else {
      this.anchor = null
      this.selection = null
    }
  }

  /** Moves through columns, crossing into neighbouring channels at the edges. */
  private moveColumns(delta: number, select: boolean) {
    let { channel, column } = this.cursor
    column += delta
    while (column < 0 && channel > 0) {
      channel--
      column += COLUMN_COUNT
    }
    while (column >= COLUMN_COUNT && channel < CHANNEL_COUNT - 1) {
      channel++
      column -= COLUMN_COUNT
    }
    this.setCursor({ channel, column: Math.min(COLUMN_COUNT - 1, Math.max(0, column)) }, select)
  }

  /**
   * Moves the selected block (or copies it, with `copy`) by whole channels and rows,
   * starting from `from`, the song when the drag began; a drag sharing `key` undoes
   * as one step. The shift is kept inside the pattern.
   */
  moveSelection(from: Song, region: Region, channels: number, rows: number, copy: boolean, key: string) {
    const r = normalizeRegion(region)
    const dc = Math.min(CHANNEL_COUNT - 1 - r.toChannel, Math.max(-r.fromChannel, channels))
    const dr = Math.min(from.patternLength - 1 - r.toRow, Math.max(-r.fromRow, rows))
    const p = this.patternIndex
    const clip = copyRegion(from, p, r)
    const base = copy ? from : clearRegion(from, p, r)
    this.commit(dc || dr || copy ? pasteClip(base, p, r.fromChannel + dc, r.fromRow + dr, clip) : from, key)
    this.selection = {
      fromChannel: r.fromChannel + dc,
      toChannel: r.toChannel + dc,
      fromRow: r.fromRow + dr,
      toRow: r.toRow + dr,
    }
    // The cursor stays put: the grid centres on it, and moving it would scroll the
    // block away from the pointer mid-drag.
    this.anchor = null
  }

  /** The selection, or just the cursor's cell. */
  private target(): Region {
    const { row, channel } = this.cursor
    return this.selection ?? { fromChannel: channel, toChannel: channel, fromRow: row, toRow: row }
  }

  private advance() {
    if (this.step > 0) this.setCursor({ row: Math.min(this.song.patternLength - 1, this.cursor.row + this.step) })
  }

  // ---- editing -------------------------------------------------------------

  private edit(patch: Parameters<typeof updateCell>[4], channel = this.cursor.channel, row = this.cursor.row) {
    this.commit(updateCell(this.song, this.patternIndex, channel, row, patch))
  }

  enterNote(note: number) {
    this.edit({ note, instrument: this.instrument })
    this.preview(note)
    this.advance()
  }

  /** Runs one tracker key action. Returns false if it wasn't applicable. */
  perform(action: TrackerAction): boolean {
    const p = this.patternIndex
    const { row, channel } = this.cursor
    switch (action.type) {
      case 'note':
        this.enterNote(action.note)
        return true
      case 'noteOff':
      case 'release':
        this.edit({ note: action.type === 'noteOff' ? NOTE_OFF : NOTE_RELEASE, instrument: null })
        this.advance()
        return true
      case 'hex':
        return this.enterHex(action.value)
      case 'effect':
        this.edit({ effect: action.letter })
        this.setCursor({ column: 5 })
        return true
      case 'move':
        if (action.columns) this.moveColumns(action.columns, action.select)
        else this.setCursor({ row: row + action.rows }, action.select)
        return true
      case 'channel': {
        // Past the first or last channel, Tab moves focus out of the grid as usual.
        const next = channel + action.delta
        if (next < 0 || next >= CHANNEL_COUNT) return false
        this.setCursor({ channel: next, column: 0 })
        return true
      }
      case 'jump':
        this.setCursor({ row: action.to === 'start' ? 0 : this.song.patternLength - 1 }, action.select)
        return true
      case 'clear':
        if (this.selection) this.commit(clearRegion(this.song, p, this.selection))
        else this.clearField()
        return true
      case 'deleteRow':
        this.commit(deleteRow(this.song, p, channel, row))
        return true
      case 'insertRow':
        this.commit(insertRow(this.song, p, channel, row))
        return true
      case 'transpose':
        this.commit(transposeRegion(this.song, p, this.target(), action.semitones))
        return true
      case 'copy':
        this.clip = copyRegion(this.song, p, this.target())
        return true
      case 'cut':
        this.clip = copyRegion(this.song, p, this.target())
        this.commit(clearRegion(this.song, p, this.target()))
        return true
      case 'paste':
        if (!this.clip) return false
        this.commit(pasteClip(this.song, p, channel, row, this.clip))
        return true
      case 'selectAll': {
        // First press: this channel; second press: the whole pattern.
        const channelOnly = { fromChannel: channel, toChannel: channel, fromRow: 0, toRow: this.song.patternLength - 1 }
        const s = this.selection
        const isChannel = s && s.fromChannel === channel && s.toChannel === channel && s.fromRow === 0 && s.toRow === channelOnly.toRow
        this.selection = isChannel ? allChannels(this.song) : channelOnly
        return true
      }
      case 'octave':
        this.setOctave(this.octave + action.delta)
        return true
      case 'instrument':
        this.selectInstrument(this.instrument + action.delta)
        return true
      case 'order':
        this.goToOrder(this.orderIndex + action.delta)
        return true
      case 'playRow':
        this.playFromCursor()
        return true
      case 'escape':
        if (!this.selection) return false
        this.setCursor({})
        return true
    }
  }

  private clearField() {
    switch (this.columnName) {
      case 'note':
        this.edit({ note: null, instrument: null, volume: null })
        break
      case 'instHi':
      case 'instLo':
        this.edit({ instrument: null })
        break
      case 'volume':
        this.edit({ volume: null })
        break
      default:
        this.edit({ effect: null, param: 0 })
    }
    this.advance()
  }

  private enterHex(value: number): boolean {
    const p = this.patternIndex
    const { row, channel, column } = this.cursor
    const cell = this.song.patterns[p].channels[channel][row]
    switch (this.columnName) {
      case 'instHi':
      case 'instLo': {
        const digit = this.columnName === 'instHi' ? 0 : 1
        const instrument = Math.min(LIMITS.instruments - 1, setNibble(cell.instrument ?? 0, digit, value))
        this.edit({ instrument })
        if (digit === 0) this.setCursor({ column: column + 1 })
        else {
          this.setCursor({ column: column - 1 })
          this.advance()
        }
        return true
      }
      case 'volume':
        this.edit({ volume: value })
        this.advance()
        return true
      case 'paramHi':
      case 'paramLo': {
        if (!cell.effect) return false
        const digit = this.columnName === 'paramHi' ? 0 : 1
        this.edit({ param: setNibble(cell.param, digit, value) })
        if (digit === 0) this.setCursor({ column: column + 1 })
        else {
          this.setCursor({ column: 4 })
          this.advance()
        }
        return true
      }
      default:
        return false
    }
  }
}

export const composer = new Composer()
