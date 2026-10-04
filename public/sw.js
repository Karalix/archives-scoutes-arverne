// Service worker minimal (PWA installable). Pas de cache vidéo hors ligne en v1.
const CACHE = 'archives-shell-v1'
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/icon.svg'])))
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))))
  self.clients.claim()
})
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // Assets de build immuables uniquement ; jamais les médias ni l'API
  if (e.request.method === 'GET' && url.origin === location.origin && url.pathname.startsWith('/_nuxt/')) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request)
      if (hit) return hit
      const res = await fetch(e.request)
      if (res.ok) c.put(e.request, res.clone())
      return res
    }))
  }
})
