// ─── SERVICE WORKER KILL SWITCH ─────────────────────────────────
// A previous version of this site registered a cache-first service
// worker. Its registration was later removed from index.html, but the
// old worker stays ACTIVE in returning visitors' browsers and keeps
// serving a STALE, cached index.html. That stale bundle contained an
// old navigation bug (a 401 response ran logout() -> navigate('home')),
// which made pages like Outings/Blogs/Wallet/Dashboard open briefly and
// then bounce back to the homepage.
//
// This file is now a self-destruct worker: it takes control, deletes
// every cache it ever created, unregisters itself, and reloads open
// tabs so they fetch the current (fixed) code directly from the network.
// After this runs once per browser, no service worker remains.

self.addEventListener('install', () => {
  // Activate immediately without waiting for the old worker to be released.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // 1. Delete every cache created by any previous service worker version.
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    } catch (e) { /* ignore */ }

    // 2. Unregister this service worker so it never intercepts again.
    try {
      await self.registration.unregister();
    } catch (e) { /* ignore */ }

    // 3. Reload every open tab once so it loads fresh code from the network.
    try {
      const clientList = await self.clients.matchAll({ type: 'window' });
      for (const client of clientList) {
        if ('navigate' in client) client.navigate(client.url);
      }
    } catch (e) { /* ignore */ }
  })());
});

// While this worker is still briefly active, never serve from cache.
// Pass every request straight to the network so nothing stale is returned.
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
});
