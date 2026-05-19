const CACHE_VERSION = 'omnyra-v1'
const STATIC_PATTERNS = [/\/_next\/static\//, /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/]

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll(['/manifest.json', '/api/pwa-icon/192', '/api/pwa-icon/512'])
    )
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Never intercept non-GET, cross-origin, or API/auth requests
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/login')
  ) {
    return
  }

  const isStatic = STATIC_PATTERNS.some((p) => p.test(url.pathname))

  if (isStatic) {
    // Cache-first for hashed static assets
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const clone = res.clone()
              caches.open(CACHE_VERSION).then((c) => c.put(request, clone))
            }
            return res
          })
      )
    )
  } else {
    // Network-first for HTML pages, fall back to cache
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE_VERSION).then((c) => c.put(request, clone))
          }
          return res
        })
        .catch(() => caches.match(request))
    )
  }
})
