// Hash routes: #/sfx (default), #/sfx?s=<share code>, #/demo.

import { parseHash, type Mode } from './hash'

class Route {
  mode = $state<Mode>(parseHash(location.hash).mode)
  /** The shared song's slug on #/s/<slug>. */
  slug = $state<string | null>(parseHash(location.hash).slug ?? null)

  constructor() {
    addEventListener('hashchange', () => {
      const parsed = parseHash(location.hash)
      this.mode = parsed.mode
      this.slug = parsed.slug ?? null
    })
  }

  /** Reads a share code from the URL once, then tidies the address bar. */
  takeShareCode(): string | null {
    const { share } = parseHash(location.hash)
    if (share) history.replaceState(null, '', '#/sfx')
    return share
  }
}

export const route = new Route()
