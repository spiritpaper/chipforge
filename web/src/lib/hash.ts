export type Mode = 'sfx' | 'demo'

export function parseHash(hash: string): { mode: Mode; share: string | null } {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const mode: Mode = path === 'demo' ? 'demo' : 'sfx'
  return { mode, share: new URLSearchParams(query).get('s') }
}
