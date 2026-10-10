// Accounts and sync across two "devices" (separate browser profiles), conflicts and
// share links, against the real ChipForge server started by the runner.
import fs from 'node:fs'
import { clickText, readSong, waitFor } from '../helpers.mjs'

async function signIn(page, BASE, mailFile, email, sleep) {
  await page.goto(`${BASE}/#/account`, { waitUntil: 'networkidle0' })
  await waitFor(page, () => !!document.querySelector('#email'), 5000)
  await page.type('#email', email)
  await page.click('form .key')
  await waitFor(page, () => document.querySelector('.sent')?.textContent.includes('Check'))
  const links = fs.readFileSync(mailFile, 'utf8').match(/http\S+/g)
  await page.goto(links.at(-1), { waitUntil: 'networkidle0' })
  await waitFor(page, () => document.querySelector('.account')?.textContent.includes('Signed in as'), 5000)
  await sleep(300)
}

const serverSongs = (page) => page.evaluate(() => fetch('/api/songs').then((r) => r.json()))

async function rename(page, title, sleep) {
  await page.evaluate(() => (location.hash = '#/compose'))
  await page.waitForSelector('input.title')
  await page.evaluate(() => document.querySelector('input.title').select())
  await page.focus('input.title')
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
  await sleep(2600) // autosave (0.5 s) + sync push delay (1.5 s)
}

export default async function ({ page, browser, sleep, BASE, mailFile, hasServer, check, shot }) {
  if (!hasServer) {
    check('server-dependent checks skipped (uv not installed)', true)
    return
  }
  await signIn(page, BASE, mailFile, 'ada@example.com', sleep)
  check('signs in with the emailed link', (await page.evaluate(() => document.querySelector('.account strong')?.textContent)) === 'ada@example.com')
  await shot('signed-in')

  await page.goto(`${BASE}/#/compose`, { waitUntil: 'networkidle0' })
  await sleep(1500)
  let songs = await serverSongs(page)
  check('the untouched demo song stays local', songs.length === 0, JSON.stringify(songs))
  await rename(page, 'My Tune', sleep)
  songs = await serverSongs(page)
  check('an edited song reaches the server', songs.length === 1 && songs[0].title === 'My Tune', JSON.stringify(songs))

  // A second device: a fresh profile signs in and gets the song.
  const deviceB = await browser.createBrowserContext()
  const b = await deviceB.newPage()
  await b.setViewport({ width: 1366, height: 860 })
  await signIn(b, BASE, mailFile, 'ada@example.com', sleep)
  await b.goto(`${BASE}/#/compose`, { waitUntil: 'networkidle0' })
  await sleep(1500)
  const songId = songs[0].id
  const onB = await b.evaluate(
    (id) => new Promise((resolve) => {
      const open = indexedDB.open('keyval-store')
      open.onsuccess = () => {
        const req = open.result.transaction('keyval').objectStore('keyval').get(`chipforge.project.${id}`)
        req.onsuccess = () => resolve(req.result?.title ?? null)
      }
    }),
    songId,
  )
  check('the second device receives it', onB === 'My Tune', onB)
  const bOpen = await b.evaluate(() => document.querySelector('input.title')?.value)
  const bLocal = await b.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('keyval-store')
    open.onsuccess = () => {
      const req = open.result.transaction('keyval').objectStore('keyval').get('chipforge.projects.v1')
      req.onsuccess = () => resolve(req.result.map((p) => p.title))
    }
  }))
  check('and opens it in place of its own untouched demo song', bOpen === 'My Tune' && bLocal.length === 1, `${bOpen}; local: ${bLocal}`)
  check('without adding a copy to the account', (await serverSongs(b)).length === 1)

  // Both devices rename the same version: the later save conflicts and both are kept.
  await rename(page, 'Renamed on A', sleep)
  await rename(b, 'Renamed on B', sleep)
  // The conflict copy uploads on its own short delay; poll for it.
  let titles = []
  for (let i = 0; i < 30; i++) {
    titles = (await serverSongs(page)).map((s) => s.title).sort()
    if (titles.length >= 2) break
    await sleep(200)
  }
  check('a conflicting edit keeps both versions', titles.includes('Renamed on A') && titles.includes('Renamed on B (this device)'), titles.join(' | '))
  await b.goto(`${BASE}/#/account`, { waitUntil: 'networkidle0' })
  await sleep(500)
  check('the conflict is explained', (await b.evaluate(() => document.querySelector('.notice')?.textContent ?? '')).includes('both versions were kept'))

  // Share a link from device A and open it signed out.
  await page.goto(`${BASE}/#/compose`, { waitUntil: 'networkidle0' })
  await sleep(500)
  await clickText(page, '.toolbar .key', 'Export')
  await sleep(200)
  await clickText(page, 'dialog[open] .key', 'Create share link')
  await waitFor(page, () => !!document.querySelector('dialog[open] input.url'), 5000)
  const url = await page.evaluate(() => document.querySelector('dialog[open] input.url').value)
  check('creates a share link', /#\/s\/[A-Za-z0-9_-]+$/.test(url), url)
  const stranger = await browser.createBrowserContext()
  const s = await stranger.newPage()
  await s.goto(url, { waitUntil: 'networkidle0' })
  await waitFor(s, () => !!document.querySelector('.shared h1'), 5000)
  check('anyone with the link can open it', (await s.evaluate(() => document.querySelector('.shared h1')?.textContent)) === 'Renamed on A')
  await clickText(s, '.shared .key', 'Copy to my songs')
  await sleep(800)
  check('and copy it into their songs', (await readSong(s))?.title === 'Renamed on A')
  await shot('shared')

  await page.goto(`${BASE}/#/account`, { waitUntil: 'networkidle0' })
  await sleep(300)
  await clickText(page, '.account .key', 'Sign out')
  await sleep(500)
  check('signs out', (await page.evaluate(() => fetch('/api/me').then((r) => r.json()))).email === null)
  await deviceB.close()
  await stranger.close()
}
