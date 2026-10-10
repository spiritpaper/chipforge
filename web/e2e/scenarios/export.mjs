// Compose → Export: engine file, MIDI, song file and audio, checked as files.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { clickText, waitForFile } from '../helpers.mjs'

export default async function ({ page, sleep, BASE, tmp, downloads, check, shot }) {
  await page.goto(`${BASE}/#/compose`, { waitUntil: 'networkidle0' })
  await sleep(800)
  await clickText(page, '.toolbar .key', 'Export')
  await sleep(300)
  await shot('dialog')

  await clickText(page, 'dialog[open] .key', 'Download first-light.chipsong')
  const engine = await waitForFile(downloads, (f) => f.endsWith('.chipsong'), sleep)
  const bytes = engine && fs.readFileSync(engine)
  check('engine file has the ChipForge song header', bytes && bytes.subarray(0, 4).toString('latin1') === 'CFS\x01', engine)

  await clickText(page, 'dialog[open] .key', 'Download first-light.vgm')
  const vgm = await waitForFile(downloads, (f) => f.endsWith('.vgm'), sleep)
  check('VGM file starts with "Vgm "', vgm && fs.readFileSync(vgm).subarray(0, 4).toString() === 'Vgm ')
  if (process.env.VGM2WAV && vgm) {
    // An independent NES APU emulator (libvgm) plays it: two passes plus its fade.
    // Outside the downloads folder, so later checks don't mistake it for an export.
    const wav = `${tmp}/first-light.decoded.wav`
    execFileSync(process.env.VGM2WAV, [vgm, wav])
    const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString())
    check('libvgm plays the VGM with its loop', Math.abs(seconds - (2 * 6.857 + 8)) < 0.1, `${seconds} s`)
  }

  await clickText(page, 'dialog[open] .key', 'Download first-light.mid')
  const mid = await waitForFile(downloads, (f) => f.endsWith('.mid'), sleep)
  check('MIDI file starts with MThd', mid && fs.readFileSync(mid).subarray(0, 4).toString() === 'MThd')

  await clickText(page, 'dialog[open] .key', 'Download first-light.wav')
  const wav = await waitForFile(downloads, (f) => f.endsWith('.wav'), sleep)
  const hasLoop = wav && fs.readFileSync(wav).includes(Buffer.from('smpl'))
  let seconds = ''
  try {
    seconds = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString().trim()
  } catch {}
  check('WAV has loop points and one pass of the song', hasLoop && (!seconds || Math.abs(Number(seconds) - 6.857) < 0.02), seconds)
}
