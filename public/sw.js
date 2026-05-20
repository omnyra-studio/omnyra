// Cache-reset service worker.
// The previous SW precached /index.html and served it for all "/" requests,
// hiding the Next.js app and making every CTA non-functional.
// This replacement SW:
//   1. Wipes every cache the old SW created
//   2. Activates immediately (no waiting)
//   3. Reloads all open windows so they hit the network fresh
//   4. Has NO fetch handler — all requests fall through to the network
//
// The next production build (npm run build) will overwrite this file with
// a correctly-generated next-pwa service worker.

self.addEventListener('install', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.map(n => caches.delete(n))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => Promise.all(clients.map(c => c.navigate(c.url))))
  )
})
