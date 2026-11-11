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
  if (url.pathname.startsWith('/templates/')) return;                         // Excel templates (e.g. owner list): always the real file, never index.html
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

// ---- Push (3 Nov 2026): api/push.js sends a data message through Firebase Cloud Messaging ----
// Shown as a pop-up whether the PMS is open or closed. The tag (the notification id) stops one notice showing twice.
self.addEventListener('push', e => {
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch (_) { msg = {}; }
  const d = msg.data || msg;
  e.waitUntil(self.registration.showNotification(d.title || 'Widebed PMS', {
    body: d.body || '', tag: d.tag || undefined, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { link: d.link || '/Notifications' }
  }));
});

// Click: bring an open PMS window to the front on that page, or open a new one
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = new URL(e.notification.data?.link || '/Notifications', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin !== self.location.origin) continue;
      await w.focus();
      try { await w.navigate(link); } catch (_) { w.postMessage({ type: 'open', link }); }
      return;
    }
    await self.clients.openWindow(link);
  })());
});
