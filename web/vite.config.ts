import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// The optional ChipForge server. In development and preview, /api is forwarded to it so
// the app and server share an origin, as they do behind the production proxy.
const api = { '/api': { target: process.env.CHIPFORGE_API ?? 'http://localhost:8000' } }

export default defineConfig({
  // Where the app is served from: "/" normally, "/chipforge/app/" on GitHub Pages.
  base: process.env.CHIPFORGE_BASE ?? '/',
  plugins: [svelte()],
  server: { proxy: api },
  // ONNX Runtime loads its WebAssembly files itself; pre-bundling it would also make
  // the dev server reload the page the first time a song is split.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  preview: { proxy: api },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
