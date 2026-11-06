// Widebed PMS service worker. Built by vite.config.js (pwaServiceWorker), which fills in the version and the file list.
// It keeps ONLY the app's own files (code, styles, icons) so the app opens fast and shows the offline notice.
// It never touches Firestore, Firebase Auth, Google Drive, fonts or /api: those are other hosts or are skipped below,
// so nobody is ever shown old or someone else's data.
// A new version waits until the person presses Reload on the "New version available" bar (lib/pwa.js).
const VERSION = '20261106090802';
const CACHE = 'wb-app-' + VERSION;
const PRECACHE = ["/index.html","/manifest.webmanifest","/icons/icon-192.png","/assets/index-DX7HPUC7.js","/assets/Announcements-Dd9F5Z7I.css","/assets/Appearance-ChPzSqU0.css","/assets/AuditLog-BWSw71Ss.css","/assets/BookingForms-HRReHrOM.css","/assets/BrandLogos-DuSIVQxJ.css","/assets/BulkUpload-aKiPdmun.css","/assets/BusinessModel-BQ0R79YS.css","/assets/COHEvaluate-lbibdDbz.css","/assets/ChatCompose-CDYuZkSK.css","/assets/ComboInput-BMMxgXR-.css","/assets/ConfirmDialog-CwBUR0ED.css","/assets/ConfirmReason-DpUcOvBW.css","/assets/DashboardHome-C5xt-uMN.css","/assets/Designer-DNG8KQge.css","/assets/DirectorComplaints-m8wPtwYk.css","/assets/DriveFiles-ii0-haWY.css","/assets/Expenses-BNYGKWlQ.css","/assets/FieldInput-B1yQY-bX.css","/assets/FileViewer-ZuQDx_N2.css","/assets/FormBuilder-CM9xteP2.css","/assets/FormSaved-Li7rGkss.css","/assets/GenerateDialog-CNhisDCH.css","/assets/Invoices-EvE-yM1v.css","/assets/Issues-LJXwCRTj.css","/assets/KPI-D5vE5rxn.css","/assets/LinksDialog-CADFPHWn.css","/assets/MasterFile-D_--TvFb.css","/assets/MonthEnd-Bm1dyy8P.css","/assets/MonthPicker-C-NLDkiw.css","/assets/NewListings-CsaX3bti.css","/assets/Notifications-DpgBn-Ph.css","/assets/OfflinePayments-DNluoj_s.css","/assets/Onboarding-BTZZETOt.css","/assets/OptionPicker-CT0jkS8J.css","/assets/PeoplePicker-Dly0Vc-B.css","/assets/PropertyInspectionForm-Cg1CNsCv.css","/assets/PublicForm-rQYU-Rgf.css","/assets/Quarters-CVD1ekvO.css","/assets/RaiseComplaint-CCYxdeXK.css","/assets/RatingPicker-CTT8sdEl.css","/assets/RecordEdit-DSRqVyno.css","/assets/Records-9c_S1yZn.css","/assets/RefreshButton-BQ1dTWgN.css","/assets/Renewals-d-RHlZr7.css","/assets/Reports-D-MGrMMd.css","/assets/ReservationForm-BEifZxPA.css","/assets/Roles-CtSLZ1E-.css","/assets/SalaryAdvance-D_OBlE0-.css","/assets/SalesLeads-FJ-tcgxS.css","/assets/Setup-Cvdzq4XR.css","/assets/Sops-C_Xh8KDf.css","/assets/Staff-VhWshOxd.css","/assets/StaffComplaints-D9MTVsEq.css","/assets/StaffHR-BXR86mV2.css","/assets/StatementApprovals-BtSPV_u-.css","/assets/TMS-DAZho135.css","/assets/ThankYou-C0RitxM0.css","/assets/Upload-5ssMolca.css","/assets/UploadFile-DaAvC5tA.css","/assets/UtilityForm-DsEdXUoD.css","/assets/WhatsNew-VY-CjdyB.css","/assets/agreements-CXv43FYS.css","/assets/index-BB1qkiEz.css"];

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
