// Composer: typing notes, undo, transpose, Tab out, playback, autosave.
import { chord, clickText, readSong } from '../helpers.mjs'

async function gridPoint(page, channel) {
  const box = await (await page.$('.tracker .body')).boundingBox()
  const { cw, gutter } = await page.evaluate(() => {
    const css = getComputedStyle(document.querySelector('.tracker'))
    return { cw: parseFloat(css.getPropertyValue('--chw')), gutter: parseFloat(css.getPropertyValue('--gutter')) }
  })
  return { x: box.x + gutter + cw * channel + 14, y: box.y + box.height / 2 }
}

const ch1 = async (page) => (await readSong(page)).patterns[0].channels[1].slice(0, 4).map((c) => c.note)

export default async function ({ page, sleep, BASE, check, shot }) {
  await page.goto(`${BASE}/#/compose`, { waitUntil: 'networkidle0' })
  await sleep(800)
  const p = await gridPoint(page, 1)
  await page.mouse.click(p.x, p.y)
  for (const k of ['KeyZ', 'KeyX', 'KeyC', 'Digit1']) await page.keyboard.press(k)
  await sleep(700)
  check('Z X C 1 enter C-4 D-4 E-4 and an off', JSON.stringify(await ch1(page)) === '[60,62,64,-1]', JSON.stringify(await ch1(page)))
  await chord(page, ['Control'], 'KeyZ')
  await sleep(700)
  check('Ctrl+Z undoes the last entry', (await ch1(page))[3] === 60)
  await page.keyboard.press('Home')
  await page.keyboard.down('Shift')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.up('Shift')
  await chord(page, ['Control', 'Shift'], 'ArrowUp')
  await sleep(700)
  check('Ctrl+Shift+↑ transposes the selection an octave', JSON.stringify((await ch1(page)).slice(0, 3)) === '[72,74,76]')
  await page.keyboard.press('Escape')
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab')
  check('Tab past the last channel leaves the grid', !(await page.evaluate(() => document.activeElement?.classList.contains('body'))))
  await page.click('.transport .play')
  await sleep(1200)
  check('Play plays', (await page.evaluate(() => document.querySelector('.transport .play')?.getAttribute('aria-pressed'))) === 'true')
  await shot('playing')
  await page.click('.transport .play')
  await page.focus('input.title')
  await page.evaluate(() => document.querySelector('input.title').select())
  await page.keyboard.type('My Overworld')
  await page.keyboard.press('Enter')
  await sleep(800)
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(800)
  check('edits and title survive a reload', (await readSong(page)).title === 'My Overworld' && (await ch1(page))[0] === 72)
  await page.keyboard.press('Backquote')
  await sleep(300)
  check('` switches to the piano roll', await page.$('.roll'))
  await clickText(page, '.toolbar .key', 'Songs')
  await sleep(300)
  await clickText(page, '.templates button', 'Boss')
  await sleep(500)
  check('templates open as new songs', (await page.evaluate(() => document.querySelector('input.title')?.value)) === 'Boss')
}
