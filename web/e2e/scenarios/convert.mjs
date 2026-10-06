// Convert, Lo-fi filter: decoding, errors, playback, A/B, presets, export.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { writeTestSong } from '../testsong.mjs'
import { waitForFile } from '../helpers.mjs'

export default async function ({ page, sleep, BASE, tmp, downloads, check, shot }) {
  const song = `${tmp}/testsong.wav`
  writeTestSong(song)
  fs.writeFileSync(`${tmp}/notes.txt`, 'hello')
  await page.goto(`${BASE}/#/convert`, { waitUntil: 'networkidle0' })
  await (await page.$('input[type=file]')).uploadFile(`${tmp}/notes.txt`)
  await sleep(800)
  check('a non-audio file gets a plain error', (await page.evaluate(() => document.querySelector('.error')?.textContent))?.includes('cannot read'))
  await (await page.$('input[type=file]')).uploadFile(song)
  await sleep(1000)
  check('the song opens', (await page.evaluate(() => document.querySelector('.overview .time')?.textContent)) === '0:00 / 0:08')
  await page.keyboard.press('Space')
  await sleep(1300)
  check('Space plays', (await page.evaluate(() => document.querySelector('.overview')?.getAttribute('aria-valuenow'))) >= '1')
  await page.keyboard.press('KeyB')
  await sleep(200)
  check('B compares with the original', (await page.evaluate(() => document.querySelector('.ab [aria-checked=true]')?.textContent)) === 'Original')
  await page.keyboard.press('Space')
  await page.click('.presets button:nth-child(2)')
  await page.click('.export input[value=ogg]')
  await page.evaluate(() => [...document.querySelectorAll('.export .key')].at(-1).click())
  const ogg = await waitForFile(downloads, (f) => f.endsWith('.ogg'), sleep)
  let probe = ''
  try {
    probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name', '-of', 'csv=p=0', ogg]).toString()
  } catch {}
  check('exports the 8-bit version as OGG', ogg && (!probe || (probe.includes('vorbis') && probe.includes('8.0'))), probe.replace(/\n/g, ' '))
  await shot('lofi')
}
