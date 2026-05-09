const CACHE_NAME = 'vibes-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  // Skip cross-origin requests entirely — let the browser handle them
  if (new URL(request.url).origin !== self.location.origin) return;
  // Network-first for same-origin API calls (proxied via Vercel rewrite)
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then(resp => resp)
        .catch(() => new Response(
          JSON.stringify({ success: false, message: 'You appear to be offline. Please check your connection.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        ))
    );
    return;
  }
  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(resp => {
      const clone = resp.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
      return resp;
    }))
  );
});
