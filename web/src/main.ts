import { mount } from 'svelte'
import '@fontsource/chakra-petch/500.css'
import '@fontsource/chakra-petch/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/silkscreen/400.css'
import './app.css'
import App from './App.svelte'
import { isDesktop } from './lib/desktop'

export default mount(App, { target: document.getElementById('app')! })

// The desktop app already has everything on disk.
if (import.meta.env.PROD && !isDesktop && 'serviceWorker' in navigator) {
  const loadedAt = Date.now()
  // The service worker adds the headers that make the page cross-origin isolated (so
  // the part splitter can use every core), but only to pages it serves. On a first
  // visit, once it takes over, reload once, early, before anything has been done.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (crossOriginIsolated || Date.now() - loadedAt > 10_000) return
    try {
      if (sessionStorage.getItem('chipforge.isolate')) return
      sessionStorage.setItem('chipforge.isolate', '1')
    } catch {
      return
    }
    location.reload()
  })
  addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline support is a bonus; the app works without it.
    })
  })
}
