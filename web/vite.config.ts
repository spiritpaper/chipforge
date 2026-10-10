import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// The optional ChipForge server. In development and preview, /api is forwarded to it so
// the app and server share an origin, as they do behind the production proxy.
const api = { '/api': { target: process.env.CHIPFORGE_API ?? 'http://localhost:8000' } }

export default defineConfig({
  plugins: [svelte()],
  server: { proxy: api },
  preview: { proxy: api },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
