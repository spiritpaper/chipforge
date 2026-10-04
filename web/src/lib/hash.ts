// Hash routes: #/sfx (default), #/sfx?s=<share code>, #/compose, #/demo.

export type Mode = 'sfx' | 'compose' | 'demo'

export function parseHash(hash: string): { mode: Mode; share: string | null } {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const mode: Mode = path === 'demo' || path === 'compose' ? path : 'sfx'
  return { mode, share: new URLSearchParams(query).get('s') }
}
