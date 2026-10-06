// SFX Lab: presets, keep, mutate, slider fork, export, share link, persistence.
import fs from 'node:fs'
import { waitFor, waitForFile } from '../helpers.mjs'

const state = (page) =>
  page.evaluate(() => ({
    name: document.querySelector('input.name')?.value,
    rows: document.querySelectorAll('.list li').length,
    kept: document.querySelector('.filter button:nth-child(2) .count')?.textContent,
  }))

export default async function ({ page, context, sleep, BASE, downloads, check, shot }) {
  await context.overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write'])
  await page.goto(`${BASE}/#/sfx`, { waitUntil: 'networkidle0' })
  await sleep(400)
  check('starts with a coin sound', (await state(page)).name === 'Coin 1')
  await page.keyboard.press('Digit3')
  // The first sound also starts the audio engine, which can take a moment.
  const playing = await waitFor(page, () => !!document.querySelector('.playhead'))
  check('3 makes a laser and plays it', (await state(page)).name === 'Laser 1' && playing)
  await page.keyboard.press('KeyS')
  await page.keyboard.press('KeyM')
  await sleep(150)
  const s = await state(page)
  check('S keeps, M mutates', s.kept === '1' && s.name === 'Laser 2', JSON.stringify(s))
  await page.keyboard.press('KeyF')
  await sleep(200)
  // Element clicks scroll into view first; the panel opens below the fold.
  const slider = await page.$('#param-volume')
  const box = await slider.boundingBox()
  await slider.click({ offset: { x: box.width * 0.3, y: box.height / 2 } })
  await sleep(150)
  check('first slider change forks a copy', (await state(page)).name === 'Laser 2 edit')
  await page.keyboard.press('KeyE')
  const wav = await waitForFile(downloads, (f) => f.endsWith('.wav'), sleep)
  check('E downloads a WAV even with a slider focused', wav && fs.readFileSync(wav).subarray(0, 4).toString() === 'RIFF', wav)
  await page.keyboard.press('KeyL')
  await sleep(300)
  const link = await page.evaluate(() => navigator.clipboard.readText())
  check('L copies a share link', link.includes('#/sfx?s='), link)
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(500)
  check('history survives a reload', (await state(page)).rows === 4)
  const other = await context.newPage()
  await other.goto(link, { waitUntil: 'networkidle0' })
  await sleep(500)
  check('share link opens the sound', (await other.evaluate(() => document.querySelector('input.name')?.value)) === 'Shared 1')
  await shot('lab')
}
