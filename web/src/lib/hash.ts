// Hash routes: #/sfx (default), #/sfx?s=<share code>, #/sfx?x=<jsfxr code>, #/compose, #/convert, #/account,
// #/s/<slug> (a shared song). The old #/demo (Sound check) opens the Composer.

export type Mode = 'sfx' | 'compose' | 'convert' | 'account' | 'shared'

export function parseHash(hash: string): { mode: Mode; share: string | null; slug?: string } {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const shared = /^s\/([A-Za-z0-9_-]{4,64})$/.exec(path)
  if (shared) return { mode: 'shared', share: null, slug: shared[1] }
  const mode: Mode =
    path === 'compose' || path === 'demo' ? 'compose' : path === 'convert' || path === 'account' ? path : 'sfx'
  const params = new URLSearchParams(query)
  // `x` carries a jsfxr code (a classic sound); `s` a chip sound.
  const classic = params.get('x')
  return { mode, share: classic ? `jsfxr:${classic}` : params.get('s') }
}
