// Widebed PMS service worker. Built by vite.config.js (pwaServiceWorker), which fills in the version and the file list.
// It keeps ONLY the app's own files (code, styles, icons) so the app opens fast and shows the offline notice.
// It never touches Firestore, Firebase Auth, Google Drive, fonts or /api: those are other hosts or are skipped below,
// so nobody is ever shown old or someone else's data.
// A new version waits until the person presses Reload on the "New version available" bar (lib/pwa.js).
const VERSION = '__VERSION__';
const CACHE = 'wb-app-' + VERSION;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('wb-app-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;   // Firestore, Auth, Drive, fonts: straight to the network
  if (url.pathname.startsWith('/api/')) return;                               // Drive function: never cached
  // Pages: always the network first, so a deploy shows at once. The saved page is only used offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(async () => (await caches.match('/index.html', { cacheName: CACHE })) || Response.error()));
    return;
  }
  // Built files have a hash in their name, so a saved copy is always the right one. Others go to the network.
  if (['/assets/', '/icons/', '/fonts/'].some(p => url.pathname.startsWith(p))) {
    e.respondWith((async () => {
      const hit = await caches.match(req, { cacheName: CACHE });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
      return res;
    })());
  }
});
