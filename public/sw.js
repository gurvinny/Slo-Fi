// PRECACHE_ASSETS and BUILD_ID are replaced at build time by
// scripts/precache-sw.mjs. PRECACHE_ASSETS holds the hashed JS/CSS bundle
// filenames from the Vite manifest so they are cached at install time rather
// than only on first fetch. BUILD_ID is a per-build hash so the cache name is
// unique to each deploy and old caches are evicted on activate.
// Audio files are loaded via File.arrayBuffer() and never pass through here,
// so no audio data ever enters the cache.
const PRECACHE_ASSETS = []
const BUILD_ID = 'dev'

const CACHE = `slo-fi-${BUILD_ID}`
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

// Content-hashed, immutable build output. The filename changes whenever the
// content changes, so cache-first is both safe and fast for these.
function isHashedAsset(url) {
  return url.pathname.startsWith('/assets/')
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.origin !== self.location.origin) return

  // Navigations and the HTML shell: network-first. A redeployed index.html
  // references fresh chunk hashes, so it must win over any cached copy when
  // online — this is what prevents an old page from importing a chunk hash
  // that the current deploy no longer serves. Falls back to cache offline.
  if (e.request.mode === 'navigate' || url.pathname === '/index.html' || url.pathname === '/') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(e.request, clone))
          return res
        })
        .catch(() => caches.match(e.request).then((c) => c || caches.match('/index.html')))
    )
    return
  }

  // Immutable hashed assets: cache-first.
  if (isHashedAsset(url)) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached
        return fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(e.request, clone))
          }
          return res
        })
      })
    )
    return
  }

  // Everything else (icons, manifest.json, worklets, etc.): stale-while-
  // revalidate — serve the cached copy immediately, refresh it in the
  // background so the next load is current.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then((c) => c.put(e.request, clone))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
