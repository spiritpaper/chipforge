// Opening song files of every kind ChipForge reads, by their contents: ChipForge song
// files, MIDI, FamiTracker text, MusicXML (and .mxl), ABC and MOD. Formats with
// tracker channels map straight onto the chip; the rest go through the MIDI importer's
// arranging (three busiest parts, drums to the noise channel).

import { midiToSong, type ImportReport } from '../../midi/convert'
import { MidiError, parseMidi, type MidiFile } from '../../midi/smf'
import type { Song } from '../model'
import { validateSong } from '../validate'
import { AbcError, abcToMidi } from './abc'
import { FamiTrackerError, famiTrackerToSong } from './famitracker'
import { ModError, modToMidi } from './mod'
import { MusicXmlError, musicXmlToMidi, unzipMxl } from './musicxml'
import { XmlError } from './xml'

/** For the file picker. */
export const SONG_FILE_TYPES = '.mid,.midi,audio/midi,.json,application/json,.txt,.musicxml,.xml,.mxl,.abc,.mod'

export class SongImportError extends Error {}

const ascii = (bytes: Uint8Array, from: number, len: number) => String.fromCharCode(...bytes.slice(from, from + len))

function fromMidi(midi: MidiFile, title: string, notes: string[], format: string): { song: Song; report: ImportReport } {
  const { song, report } = midiToSong(midi, title)
  return { song, report: { title, lines: [`Read as ${format}.`, ...notes, ...report.lines] } }
}

export async function importSongFile(file: File): Promise<{ song: Song; report: ImportReport }> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const name = file.name.replace(/\.[^.]+$/, '') || 'Imported song'
  try {
    if (ascii(bytes, 0, 4) === 'MThd') return fromMidi(parseMidi(bytes), name, [], 'MIDI')
    if (ascii(bytes, 0, 4) === 'PK\x03\x04') {
      const r = musicXmlToMidi(unzipMxl(bytes), name)
      return fromMidi(r.midi, r.title, r.notes, 'MusicXML')
    }
    if (bytes.length > 1084 && /^(M\.K\.|M!K!|FLT[48]|\dCHN|\d\dCH)$/.test(ascii(bytes, 1080, 4))) {
      const r = modToMidi(bytes, name)
      return fromMidi(r.midi, r.title, r.notes, 'a MOD module')
    }
    if (ascii(bytes, 0, 4) === 'rFX ' || /\.(sfs|rfx)$/i.test(file.name)) {
      throw new SongImportError('That’s a sound effect, not a song: open it in SFX Lab with Import….')
    }
    if (ascii(bytes, 0, 3) === 'FTM' || /\.ftm$/i.test(file.name)) {
      throw new SongImportError('FamiTracker .ftm files are binary: in FamiTracker, use File → Export Text and open the .txt.')
    }
    const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, '')
    if (/^\s*[{[]/.test(text)) {
      let song: Song | null = null
      try {
        song = validateSong(JSON.parse(text))
      } catch {
        // Reported below.
      }
      if (!song) throw new SongImportError('That JSON file is not a ChipForge song, or it is damaged.')
      return { song, report: { title: song.title, lines: ['Opened as a new song; the original file is unchanged.'] } }
    }
    if (/<score-(partwise|timewise)/.test(text)) {
      const r = musicXmlToMidi(text, name)
      return fromMidi(r.midi, r.title, r.notes, 'MusicXML')
    }
    if (/^\s*(#\s*FamiTracker|TRACK\s)/m.test(text) && /^\s*ROW\s/m.test(text)) {
      const r = famiTrackerToSong(text, name)
      return { song: r.song, report: { title: r.report.title, lines: ['Read as FamiTracker text.', ...r.report.lines] } }
    }
    if (/^K:/m.test(text) && (/^X:/m.test(text) || /\.abc$/i.test(file.name))) {
      const r = abcToMidi(text, name)
      return fromMidi(r.midi, r.title, r.notes, 'ABC notation')
    }
  } catch (err) {
    if (
      err instanceof SongImportError || err instanceof MidiError || err instanceof FamiTrackerError ||
      err instanceof MusicXmlError || err instanceof AbcError || err instanceof ModError
    ) {
      throw new SongImportError(err.message)
    }
    if (err instanceof XmlError) throw new SongImportError(`That MusicXML file is damaged: ${err.message}.`)
    throw new SongImportError('That file could not be read.')
  }
  throw new SongImportError(
    'ChipForge can open MIDI, MusicXML (.musicxml, .mxl), ABC, FamiTracker text, MOD and ChipForge song files. This one is none of those.',
  )
}
