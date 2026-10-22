// Offline support. Hashed build assets never change, so they are served from cache
// first; the page itself is fetched fresh when online and falls back to cache offline.

const CACHE = 'chipforge-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', './favicon.svg'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Cross-origin isolation lets the part splitter (Convert → Split into parts) run on
// every processor core. It needs these two headers on the page and its workers, which
// static hosts like GitHub Pages can't send, so the service worker adds them.
function isolated(response) {
  if (!response || response.type === 'opaque' || response.status === 0) return response
  const headers = new Headers(response.headers)
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== location.origin) return

  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches
        .match(request)
        .then(
          (hit) =>
            hit ??
            fetch(request).then((response) => {
              const copy = response.clone()
              if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, copy))
              return response
            }),
        )
        .then(isolated),
    )
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('./', copy))
          return response
        })
        .catch(() => caches.match('./'))
        .then(isolated),
    )
  }
})
