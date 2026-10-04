// Hash routes: #/sfx (default), #/sfx?s=<share code>, #/compose, #/convert. The old #/demo
// (Sound check) now opens the Composer.

export type Mode = 'sfx' | 'compose' | 'convert'

export function parseHash(hash: string): { mode: Mode; share: string | null } {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const mode: Mode = path === 'compose' || path === 'demo' ? 'compose' : path === 'convert' ? 'convert' : 'sfx'
  return { mode, share: new URLSearchParams(query).get('s') }
}
