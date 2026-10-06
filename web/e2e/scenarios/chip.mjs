// Convert, Chip version: transcription on the test song, scored against what it contains.
import { TEST_SONG, writeTestSong } from '../testsong.mjs'
import { readSong } from '../helpers.mjs'

export default async function ({ page, sleep, BASE, tmp, check, shot }) {
  const song = `${tmp}/testsong.wav`
  writeTestSong(song)
  await page.goto(`${BASE}/#/convert`, { waitUntil: 'networkidle0' })
  await (await page.$('input[type=file]')).uploadFile(song)
  await sleep(1000)
  await page.evaluate(() => [...document.querySelectorAll('.modes button')][1].click())
  await page.evaluate(() => document.querySelector('.chip .big').click())
  const started = Date.now()
  for (let i = 0; i < 240 && !(await page.$('.chip .report')) && !(await page.$('.chip .error')); i++) await sleep(500)
  const error = await page.evaluate(() => document.querySelector('.chip .error')?.textContent)
  check('listening finishes', !error, error ?? `${((Date.now() - started) / 1000).toFixed(1)} s`)
  const bpm = Number(await page.evaluate(() => document.querySelector('#chip-bpm')?.value))
  check('finds the tempo', Math.abs(bpm - TEST_SONG.bpm) < 2, `${bpm} BPM`)
  await shot('result')

  await page.keyboard.press('Space')
  await sleep(1200)
  check('Space plays the chip version', (await page.evaluate(() => document.querySelector('.transport .play')?.getAttribute('aria-pressed'))) === 'true')
  await page.keyboard.press('KeyB')
  await sleep(500)
  const at = await page.evaluate(() => Number(document.querySelector('.overview')?.getAttribute('aria-valuenow')))
  check('B switches to the original in place', at >= 1, `at ${at} s`)
  await page.keyboard.press('Space')

  await page.evaluate(() => document.querySelector('.chip .primary').click())
  await sleep(1500)
  check('Open in Compose goes to Compose', (await page.evaluate(() => location.hash)) === '#/compose')
  const s = await readSong(page)
  const p = s.patterns[s.order[0]].channels
  const starts = (ch) => p[ch].map((c, row) => [row, c.note]).filter(([, n]) => n !== null && n >= 0)
  const lead = starts(0)
  const melodyHits = TEST_SONG.melody.filter((n, k) => lead.some(([row, pitch]) => Math.abs(row - k * 4) <= 1 && pitch === n)).length
  check('melody notes land on the lead channel', melodyHits >= 12, `${melodyHits}/16: ${lead.map(([r, n]) => `${r}:${n}`).join(' ')}`)
  check('few extra lead notes', lead.length <= 20, `${lead.length} notes for 16`)
  const bass = starts(2)
  const bassHits = TEST_SONG.bass.filter((n, k) => bass.some(([row, pitch]) => Math.abs(row - k * 8) <= 1 && pitch === n)).length
  check('bass notes land on the triangle', bassHits >= 6, `${bassHits}/8: ${bass.map(([r, n]) => `${r}:${n}`).join(' ')}`)
  check('few extra bass notes', bass.length <= 11, `${bass.length} notes for 8`)
  const drums = starts(3)
  const kicks = drums.filter(([row, n]) => n === 1 && row % 8 === 0).length
  const snares = drums.filter(([row, n]) => n === 8 && row % 8 === 4).length
  check('kicks and snares land on their beats', kicks >= 6 && snares >= 6, `${kicks} kicks, ${snares} snares: ${drums.map(([r, n]) => `${r}:${n === 1 ? 'k' : n === 8 ? 's' : 'h'}`).join(' ')}`)
  await shot('compose')
}
