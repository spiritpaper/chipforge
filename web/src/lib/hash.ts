// Hash routes: #/sfx (default), #/sfx?s=<share code>, #/compose. The old #/demo
// (Sound check) now opens the Composer.

export type Mode = 'sfx' | 'compose'

export function parseHash(hash: string): { mode: Mode; share: string | null } {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const mode: Mode = path === 'compose' || path === 'demo' ? 'compose' : 'sfx'
  return { mode, share: new URLSearchParams(query).get('s') }
}
