// Off switch for the PWA. Built instead of the normal service worker when PWA_OFF=1 is set on Vercel (vite.config.js).
// On each person's next visit it deletes the app's saved files, removes itself and reloads open tabs, so phones and
// PCs go back to a plain website. Then the PWA code can be removed in a later deploy.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('wb-app-')) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
  })());
});
