import { mount } from 'svelte'
import '@fontsource/chakra-petch/500.css'
import '@fontsource/chakra-petch/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/silkscreen/400.css'
import './app.css'
import App from './App.svelte'

export default mount(App, { target: document.getElementById('app')! })

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline support is a bonus; the app works without it.
    })
  })
}
