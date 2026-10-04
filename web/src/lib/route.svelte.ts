// Hash routes: #/sfx (default), #/sfx?s=<share code>, #/demo.

import { parseHash, type Mode } from './hash'

class Route {
  mode = $state<Mode>(parseHash(location.hash).mode)

  constructor() {
    addEventListener('hashchange', () => {
      this.mode = parseHash(location.hash).mode
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
