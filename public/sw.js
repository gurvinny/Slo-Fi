// PRECACHE_ASSETS is replaced at build time by scripts/precache-sw.mjs.
// It will contain the hashed JS/CSS bundle filenames from the Vite manifest
// so they are cached at install time rather than only on first fetch.
// Audio files are loaded via File.arrayBuffer() and never pass through here,
// so no audio data ever enters the cache.
const PRECACHE_ASSETS = []

const CACHE = 'slo-fi-v2'
const SHELL = ['/', '/index.html', '/manifest.json', '/favicon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll([...SHELL, ...PRECACHE_ASSETS]))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  // Serve from cache first. On a miss, fetch from the network and cache the
  // response so any assets not precached are available on the next offline load.
  // Audio files are loaded via File.arrayBuffer() and never pass through here,
  // so no audio data ever enters the cache.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached
      return fetch(e.request).then((res) => {
        if (res.ok && e.request.url.startsWith(self.location.origin)) {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(e.request, clone))
        }
        return res
      })
    })
  )
})
