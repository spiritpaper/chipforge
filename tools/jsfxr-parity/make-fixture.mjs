// Makes core/tests/jsfxr_parity.txt: sounds rendered by jsfxr itself, which
// core/src/sfxr.rs's tests compare against sample by sample.
//
//   node tools/jsfxr-parity/make-fixture.mjs
//
// Downloads jsfxr at a pinned commit (the Unlicense). Noise sounds are left out:
// jsfxr's noise comes from Math.random.

import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const COMMIT = 'b7b6aa27d62f8f356db267276bf54b451555c49d'
const dir = mkdtempSync(join(tmpdir(), 'jsfxr-'))
const src = await (await fetch(`https://raw.githubusercontent.com/chr15m/jsfxr/${COMMIT}/sfxr.js`)).text()
writeFileSync(join(dir, 'sfxr.js'), src)
writeFileSync(join(dir, 'riffwave.js'), 'module.exports = function () {}')
const jsfxr = createRequire(import.meta.url)(join(dir, 'sfxr.js'))

// A fixed sequence so the fixture doesn't change between runs.
let seed = 12345
Math.random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)

const keys = jsfxr.parameters.order
const sounds = []
for (const preset of ['pickupCoin', 'laserShoot', 'powerUp', 'hitHurt', 'jump', 'blipSelect', 'synth', 'tone', 'random']) {
  for (let take = 0; take < 3 && sounds.filter((s) => s.preset === preset).length < 2; take++) {
    const p = new jsfxr.Params()[preset]()
    if (p.wave_type === 3) continue
    // Values as ChipForge stores them: 32-bit floats.
    const params = Object.fromEntries(keys.map((k) => [k, k === 'wave_type' ? p[k] : Math.fround(p[k])]))
    params.sound_vol = Math.fround(0.5)
    const synth = new jsfxr.Params()
    Object.assign(synth, params)
    const out = new jsfxr.SoundEffect(synth).getRawBuffer().normalized
    if (out.some((v) => !Number.isFinite(v))) continue
    const every = 37
    sounds.push({ preset, params, length: out.length, every, samples: out.filter((_, i) => i % every === 0) })
  }
}
// Plain text, so the dependency-free core can read it: per sound a line
// `sound <preset> <length> <every>`, the 24 parameters in core order (jsfxr's order,
// then sound_vol), then every `every`-th sample.
const lines = [`# jsfxr ${COMMIT}`]
for (const s of sounds) {
  lines.push(`sound ${s.preset} ${s.length} ${s.every}`)
  lines.push([...keys, 'sound_vol'].map((k) => s.params[k]).join(' '))
  lines.push(s.samples.join(' '))
}
const file = new URL('../../core/tests/jsfxr_parity.txt', import.meta.url)
writeFileSync(file, lines.join('\n') + '\n')
console.log(`wrote ${sounds.length} sounds to ${file.pathname}`)
