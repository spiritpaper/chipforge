// End-to-end checks in a real (headless) Chromium against the production build.
//
//   pnpm build && pnpm e2e            # every scenario
//   pnpm e2e convert chip             # some scenarios
//
// Set CHROME=/path/to/chrome if it isn't found. Results and screenshots go to e2e/.tmp.

import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const here = path.dirname(fileURLToPath(import.meta.url))
// Inside the project: snap-packaged Chromium can't read /tmp.
const tmp = path.join(here, '.tmp')
const PORT = 4174
const BASE = `http://localhost:${PORT}`

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      return execFileSync('which', [name]).toString().trim()
    } catch {}
  }
  throw new Error('No Chrome or Chromium found; set CHROME=/path/to/chrome')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(path.join(tmp, 'downloads'), { recursive: true })
  const all = fs.readdirSync(path.join(here, 'scenarios')).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).sort()
  const wanted = process.argv.slice(2).length ? process.argv.slice(2) : all

  // The ChipForge server, when uv is available: a fresh database and a mail file the
  // scenarios read sign-in links from. Without it the app runs serverless.
  let api = null
  const API_PORT = 8765
  const mailFile = path.join(tmp, 'mail.txt')
  try {
    execFileSync('uv', ['--version'])
    api = spawn('uv', ['run', '--project', path.join(here, '../../api'), 'uvicorn', 'app.main:create_app', '--factory', '--port', String(API_PORT)], {
      cwd: path.join(here, '../../api'),
      stdio: 'ignore',
      env: { ...process.env, DATABASE_URL: `sqlite:///${path.join(tmp, 'e2e.db')}`, APP_ORIGIN: BASE, MAIL_FILE: mailFile },
    })
  } catch {
    console.log('(uv not found: running without the ChipForge server)')
  }
  const server = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: path.join(here, '..'),
    stdio: 'ignore',
    env: { ...process.env, CHIPFORGE_API: `http://localhost:${API_PORT}` },
  })
  if (api) {
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`http://localhost:${API_PORT}/api/health`)).ok) break
      } catch {}
      await sleep(200)
    }
  }
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE)).ok) break
    } catch {}
    await sleep(200)
  }

  let failed = 0
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    userDataDir: path.join(tmp, 'profile'),
    args: ['--autoplay-policy=no-user-gesture-required', '--no-first-run'],
  })
  try {
    for (const name of wanted) {
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      await page.setViewport({ width: 1366, height: 860 })
      const problems = []
      page.on('console', (m) => ['error', 'warn'].includes(m.type()) && problems.push(`${m.type()}: ${m.text()}`))
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
      const downloads = path.join(tmp, 'downloads', name)
      fs.mkdirSync(downloads, { recursive: true })
      const cdp = await page.createCDPSession()
      await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, browserContextId: context.id })

      const checks = []
      const ctx = {
        page, context, sleep, BASE, tmp, downloads, browser, mailFile, hasServer: Boolean(api),
        shot: (file) => page.screenshot({ path: path.join(tmp, `${name}-${file}.png`) }),
        /** Records a check; `ok` decides pass or fail. */
        check: (label, ok, detail = '') => checks.push({ label, ok: Boolean(ok), detail }),
      }
      const started = Date.now()
      try {
        const scenario = await import(path.join(here, 'scenarios', `${name}.mjs`))
        await scenario.default(ctx)
      } catch (err) {
        checks.push({ label: 'scenario ran', ok: false, detail: err.stack ?? String(err) })
      }
      if (problems.length) checks.push({ label: 'no console errors', ok: false, detail: problems.join('\n') })
      const bad = checks.filter((c) => !c.ok)
      failed += bad.length
      console.log(`\n${bad.length ? '✗' : '✓'} ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`)
      for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.label}${c.detail ? ` — ${String(c.detail).replace(/\n/g, '\n      ')}` : ''}`)
      await context.close()
    }
  } finally {
    await browser.close()
    server.kill()
    api?.kill()
  }
  console.log(`\n${failed ? `${failed} check(s) failed` : 'All checks passed'}`)
  process.exit(failed ? 1 : 0)
}

main()
