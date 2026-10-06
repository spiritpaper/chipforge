// Shared helpers for scenarios.

/** The first saved Compose song, straight from IndexedDB. */
export const readSong = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('keyval-store')
        open.onsuccess = () => {
          const tx = open.result.transaction('keyval').objectStore('keyval')
          const idx = tx.get('chipforge.projects.v1')
          idx.onsuccess = () => {
            if (!idx.result?.length) return resolve(null)
            const req = tx.get(`chipforge.project.${idx.result[0].id}`)
            req.onsuccess = () => resolve(req.result)
          }
        }
      }),
  )

export const clickText = (page, selector, text) =>
  page.evaluate((s, t) => [...document.querySelectorAll(s)].find((e) => e.textContent.trim().startsWith(t))?.click(), selector, text)

export async function chord(page, mods, code) {
  for (const m of mods) await page.keyboard.down(m)
  await page.keyboard.press(code)
  for (const m of [...mods].reverse()) await page.keyboard.up(m)
}

export async function waitForFile(dir, test, sleep, timeoutMs = 20_000) {
  const fs = await import('node:fs')
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const f = fs.readdirSync(dir).find((x) => test(x) && !x.endsWith('.crdownload'))
    if (f) {
      await sleep(300)
      return `${dir}/${f}`
    }
    await sleep(200)
  }
  return null
}

/** Polls a page condition until it holds or `ms` pass; returns its last value. */
export async function waitFor(page, fn, ms = 3000, ...args) {
  const end = Date.now() + ms
  let value
  while (Date.now() < end) {
    value = await page.evaluate(fn, ...args)
    if (value) return value
    await new Promise((r) => setTimeout(r, 50))
  }
  return value
}
