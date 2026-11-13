// Widebed PMS service worker. Built by vite.config.js (pwaServiceWorker), which fills in the version and the file list.
// It keeps ONLY the app's own files (code, styles, icons) so the app opens fast and shows the offline notice.
// It never touches Firestore, Firebase Auth, Google Drive, fonts or /api: those are other hosts or are skipped below,
// so nobody is ever shown old or someone else's data.
// A new version waits until the person presses Reload on the "New version available" bar (lib/pwa.js).
const VERSION = '20261113100517';
const CACHE = 'wb-app-' + VERSION;
const PRECACHE = ["/index.html","/manifest.webmanifest","/icons/icon-192.png","/assets/index-DjGCRF8-.js","/assets/AgreementGuide-KG_SUFQy.css","/assets/Announcements-Cntrmwry.css","/assets/Appearance-ChPzSqU0.css","/assets/Attendance-CBqGhYdc.css","/assets/AuditLog-BG17Wnal.css","/assets/BookingForms-HRReHrOM.css","/assets/BookingsPage-sPE0YspB.css","/assets/BrandLogos-DuSIVQxJ.css","/assets/BulkConverter-C1LMBekb.css","/assets/BulkUpload-CXAp6Huz.css","/assets/BusinessModel-BQ0R79YS.css","/assets/COHEvaluate-CD9azyC_.css","/assets/ComboInput-BMMxgXR-.css","/assets/ComplaintChat-1f6NWeUO.css","/assets/ConfirmDialog-CwBUR0ED.css","/assets/ConfirmReason-DpUcOvBW.css","/assets/DashboardHome-DUja1aE1.css","/assets/Designer-BIB_g5My.css","/assets/DirectorComplaints-C92yulDx.css","/assets/DriveFiles-Cy0V2WPV.css","/assets/Expenses-B3-rjSnq.css","/assets/FieldInput-B1yQY-bX.css","/assets/FileViewer-BlW5U9se.css","/assets/FormBuilder-BCOGUht1.css","/assets/FormSaved-Li7rGkss.css","/assets/FormulaInfo-BxD6WzuX.css","/assets/GenerateDialog-CNhisDCH.css","/assets/Invoices-DjIFj41P.css","/assets/Issues-DnVtHmtM.css","/assets/KPI-BayEdfcv.css","/assets/LinksDialog-CADFPHWn.css","/assets/ListingFlow-CUaiC9T2.css","/assets/LiveStatus-BVu_E7Am.css","/assets/MasterFile-C7vyQUqo.css","/assets/MonthEnd-GaLQLQof.css","/assets/MonthPicker-C-NLDkiw.css","/assets/Notifications-C8SSBH-C.css","/assets/OfflinePayments-DZOxZauF.css","/assets/Onboarding-BTZZETOt.css","/assets/OneToOne-DgDJo1RJ.css","/assets/OptionPicker-p5BDeL5y.css","/assets/PeoplePicker-Dly0Vc-B.css","/assets/PropertiesRoute-CZnUwMs9.css","/assets/PropertyInspectionForm-Cg1CNsCv.css","/assets/PropertyPicker-ChPYKzEe.css","/assets/PublicForm-rQYU-Rgf.css","/assets/Quarters-CVD1ekvO.css","/assets/RaiseComplaint-BltLPkdi.css","/assets/RatingPicker-CTT8sdEl.css","/assets/RecordEdit-vLKzoMjK.css","/assets/Records-yF7qQzqr.css","/assets/RefreshButton-BQ1dTWgN.css","/assets/Renewals-kk7PS9Xo.css","/assets/Reports-Db3IUksO.css","/assets/ReservationForm-DfvrgJjV.css","/assets/Roles-CtSLZ1E-.css","/assets/SalaryAdvance-BjkPA5cV.css","/assets/SalesLeads-C4un4fhv.css","/assets/Setup-Cyz0Urxw.css","/assets/Sops-C_Xh8KDf.css","/assets/Staff-zUVSBwMH.css","/assets/StaffComplaints-CeOFGZsr.css","/assets/StaffHR-DHPfdK-k.css","/assets/StatementApprovals-B5Eb87gr.css","/assets/TMS-CzEq5XdR.css","/assets/ThankYou-C0RitxM0.css","/assets/Upload-D-Q5pTub.css","/assets/UploadFile-Bqg2hG1W.css","/assets/UtilityForm-DpxcXwvx.css","/assets/WhatsNew-VY-CjdyB.css","/assets/agreements-CXv43FYS.css","/assets/chat-sources-BkJ5NSn1.css","/assets/index-DHoQ9GEB.css"];

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
