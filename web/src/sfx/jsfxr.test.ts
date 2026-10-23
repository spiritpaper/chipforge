import { describe, expect, it } from 'vitest'
import { fromFile, fromJsfxrCode, fromJsfxrJson, fromRfx, fromSfs, fromText, jsfxrLink, SFXR_ORDER, toJsfxrCode } from './jsfxr'

// Made by jsfxr itself (Params().laserShoot().toB58()), with the values it encoded.
const LASER =
  '34T6Pm1xpoiBpuarXsQgP5hwmU6rGBqmgwdi8eVVa5awiqEaqXhGshiJhyjsUYxzSN9cMbgE2CmY96CMJ9RzoXvYnku8L5S5FP3wAxFcfjiEf4CLpadSX8osV'
const LASER_PARAMS: Record<string, number> = {
  wave_type: 1, p_env_attack: 0, p_env_sustain: 0.11491193771362306, p_env_punch: 0, p_env_decay: 0.3989492535591126,
  p_base_freq: 0.6253751993179322, p_freq_limit: 0.0987091898918152, p_freq_ramp: -0.551655626296997, p_freq_dramp: 0,
  p_vib_strength: 0, p_vib_speed: 0, p_arp_mod: 0, p_arp_speed: 0, p_duty: 0.43494677543640137,
  p_duty_ramp: 0.18306531906127932, p_repeat_speed: 0, p_pha_offset: 0.19855202436447145, p_pha_ramp: -0.011806821823120118,
  p_lpf_freq: 1, p_lpf_ramp: 0, p_lpf_resonance: 0, p_hpf_freq: 0.11521933972835541, p_hpf_ramp: 0,
}

const close = (a: Record<string, number>, b: Record<string, number>) => {
  for (const key of SFXR_ORDER) expect(a[key], key).toBeCloseTo(b[key], 6)
}

describe('jsfxr share codes', () => {
  it("reads jsfxr's own codes", () => {
    close(fromJsfxrCode(LASER)!, LASER_PARAMS)
  })

  it('writes codes jsfxr reads back the same', () => {
    expect(toJsfxrCode(fromJsfxrCode(LASER)!)).toBe(LASER)
  })

  it('reads links and bare codes, and rejects junk', () => {
    close(fromText(`https://sfxr.me/#${LASER}`)!, LASER_PARAMS)
    close(fromText(`  ${LASER}\n`)!, LASER_PARAMS)
    expect(jsfxrLink(LASER_PARAMS)).toMatch(/^https:\/\/sfxr\.me\/#34T6/)
    expect(fromText('hello')).toBeNull()
    expect(fromText(LASER.slice(0, 40))).toBeNull()
    expect(fromText('0OIl')).toBeNull()
  })

  it("reads jsfxr's JSON, filling in what's missing", () => {
    close(fromText(JSON.stringify({ ...LASER_PARAMS, sound_vol: 0.25 }))!, LASER_PARAMS)
    const sparse = fromJsfxrJson({ wave_type: 2, p_base_freq: 0.3 })!
    expect(sparse).toMatchObject({ wave_type: 2, p_lpf_freq: 1, p_env_decay: 0 })
    expect(fromJsfxrJson({ foo: 1 })).toBeNull()
  })
})

describe('sfxr and rFXGen files', () => {
  /** An .sfs as DrPetter's sfxr writes it. */
  function sfs(version: number) {
    const parts: [string, number][] = [['i', version], ['i', LASER_PARAMS.wave_type]]
    if (version === 102) parts.push(['f', 0.4])
    const f = (key: string) => parts.push(['f', LASER_PARAMS[key]])
    f('p_base_freq'); f('p_freq_limit'); f('p_freq_ramp')
    if (version >= 101) f('p_freq_dramp')
    f('p_duty'); f('p_duty_ramp'); f('p_vib_strength'); f('p_vib_speed'); parts.push(['f', 0])
    f('p_env_attack'); f('p_env_sustain'); f('p_env_decay'); f('p_env_punch'); parts.push(['b', 1])
    f('p_lpf_resonance'); f('p_lpf_freq'); f('p_lpf_ramp'); f('p_hpf_freq'); f('p_hpf_ramp')
    f('p_pha_offset'); f('p_pha_ramp'); f('p_repeat_speed')
    if (version >= 101) { f('p_arp_speed'); f('p_arp_mod') }
    const bytes = new Uint8Array(parts.reduce((n, [t]) => n + (t === 'b' ? 1 : 4), 0))
    const view = new DataView(bytes.buffer)
    let at = 0
    for (const [t, v] of parts) {
      if (t === 'b') bytes[at++] = v
      else {
        if (t === 'i') view.setInt32(at, v, true)
        else view.setFloat32(at, v, true)
        at += 4
      }
    }
    return bytes
  }

  it('reads .sfs files of every version', () => {
    const v102 = fromSfs(sfs(102))!
    close(v102, LASER_PARAMS)
    expect(v102.sound_vol).toBeCloseTo(0.4)
    expect(fromSfs(sfs(100))!.p_arp_mod).toBe(0)
    expect(fromSfs(sfs(99))).toBeNull()
    expect(fromSfs(sfs(102).slice(0, 20))).toBeNull()
  })

  it('reads .rfx files', () => {
    const bytes = new Uint8Array(104)
    const view = new DataView(bytes.buffer)
    bytes.set([...'rFX '].map((c) => c.charCodeAt(0)))
    view.setUint16(4, 200, true)
    view.setUint16(6, 96, true)
    view.setInt32(8, 1234, true) // seed
    view.setInt32(12, 1, true)
    const order = ['p_env_attack', 'p_env_sustain', 'p_env_punch', 'p_env_decay', 'p_base_freq', 'p_freq_limit',
      'p_freq_ramp', 'p_freq_dramp', 'p_vib_strength', 'p_vib_speed', 'p_arp_mod', 'p_arp_speed', 'p_duty',
      'p_duty_ramp', 'p_repeat_speed', 'p_pha_offset', 'p_pha_ramp', 'p_lpf_freq', 'p_lpf_ramp',
      'p_lpf_resonance', 'p_hpf_freq', 'p_hpf_ramp']
    order.forEach((key, i) => view.setFloat32(16 + i * 4, LASER_PARAMS[key], true))
    close(fromRfx(bytes)!, LASER_PARAMS)
    view.setUint16(4, 100, true)
    expect(fromRfx(bytes)).toBeNull()
  })

  it('tells files apart by their contents', async () => {
    close((await fromFile(new Blob([sfs(102)])))!, LASER_PARAMS)
    close((await fromFile(new Blob([`https://sfxr.me/#${LASER}`])))!, LASER_PARAMS)
    expect(await fromFile(new Blob(['not a sound']))).toBeNull()
  })
})
