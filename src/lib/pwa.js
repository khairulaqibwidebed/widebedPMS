// PWA: registers the service worker (public build only, never on `npm run dev`) and keeps two flags for AppShell:
//   pwa.updateReady: a new version is downloaded and waiting -> "New version available" bar, Reload applies it
//   pwa.offline:     the device has no connection -> "You're offline" bar
import { reactive } from 'vue';

export const pwa = reactive({ updateReady: false, offline: typeof navigator !== 'undefined' && navigator.onLine === false });
let waiting = null, reloading = false;

export function startPwa() {
  window.addEventListener('online', () => { pwa.offline = false; });
  window.addEventListener('offline', () => { pwa.offline = true; });
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const hadController = !!navigator.serviceWorker.controller;   // first install: nothing to replace, no bar
      const track = w => {
        if (!w) return;
        const done = () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { waiting = w; pwa.updateReady = true; } };
        done(); w.addEventListener('statechange', done);
      };
      if (hadController) track(reg.waiting);
      reg.addEventListener('updatefound', () => track(reg.installing));
      // Check for a new version when the app comes back to the front, and every 30 minutes
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
      // A push clicked while a PMS window was open but couldn't be moved by the service worker: go there
      navigator.serviceWorker.addEventListener('message', e => { if (e.data?.type === 'open' && e.data.link) location.assign(e.data.link); });
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading && pwa.updateReady) { reloading = true; location.reload(); } });
    } catch (e) { console.warn('Service worker not registered:', e.message); }
  });
}

// Reload button on the bar: let the waiting version take over, then the page reloads (controllerchange above).
export function applyUpdate() {
  if (waiting) waiting.postMessage('skipWaiting');
  else location.reload();
}
