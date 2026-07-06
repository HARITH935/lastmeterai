/* LastMeter AI service worker — offline app shell + last-known data cache */

const VERSION     = 'v1'
const SHELL_CACHE = `lm-shell-${VERSION}`
const DATA_CACHE  = `lm-data-${VERSION}`
const ASSET_CACHE = `lm-assets-${VERSION}`

const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/pwa-icon.svg', '/favicon.svg']

// ── Install: precache the app shell ────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_URLS).catch(() => {}))
      .then(() => self.skipWaiting()),
  )
})

// ── Activate: drop old caches ──────────────────────────────────────────────────
self.addEventListener('activate', event => {
  const keep = new Set([SHELL_CACHE, DATA_CACHE, ASSET_CACHE])
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// ── Fetch routing ──────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // SPA navigations → network-first, fall back to cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone()
          caches.open(SHELL_CACHE).then(c => c.put('/index.html', copy))
          return res
        })
        .catch(() => caches.match('/index.html').then(r => r || caches.match('/'))),
    )
    return
  }

  // API GETs → network-first, cache successes, serve last-known copy offline.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(DATA_CACHE).then(c => c.put(request, copy))
          }
          return res
        })
        .catch(() => caches.match(request).then(r =>
          r || new Response(
            JSON.stringify({ error: 'OFFLINE', message: 'You are offline. Showing last saved data if available.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          ),
        )),
    )
    return
  }

  // Same-origin static assets → cache-first (stale-while-revalidate).
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        const network = fetch(request)
          .then(res => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(ASSET_CACHE).then(c => c.put(request, copy))
            }
            return res
          })
          .catch(() => cached)
        return cached || network
      }),
    )
  }
})
