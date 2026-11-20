// Widebed PMS service worker. Built by vite.config.js (pwaServiceWorker), which fills in the version and the file list.
// It keeps ONLY the app's own files (code, styles, icons) so the app opens fast and shows the offline notice.
// It never touches Firestore, Firebase Auth, Google Drive, fonts or /api: those are other hosts or are skipped below,
// so nobody is ever shown old or someone else's data.
// A new version waits until the person presses Reload on the "New version available" bar (lib/pwa.js).
const VERSION = '20261120095801';
const CACHE = 'wb-app-' + VERSION;
const PRECACHE = ["/index.html","/manifest.webmanifest","/icons/icon-192.png","/assets/index-CBEwJ1v3.js","/assets/AgentDatabase-BgpdxBo_.css","/assets/AgreementGuide-CcXCkz1h.css","/assets/Announcements-CdQMc1Vl.css","/assets/Appearance-ChPzSqU0.css","/assets/Attendance-dhGh8cJX.css","/assets/AuditLog-CEdsF8gn.css","/assets/BookingForms-CtTfQ7xD.css","/assets/BookingsPage-D4yL4NY9.css","/assets/BrandLogos-DRRxhR1O.css","/assets/BulkConverter-B6EFRQnP.css","/assets/BulkUpload-BqM8tlY0.css","/assets/BusinessModel-D0FZGf6B.css","/assets/COHEvaluate-C_OeYbHa.css","/assets/ComboInput-COlsg6Oi.css","/assets/ComplaintChat-YdVVSyHo.css","/assets/ConfirmDialog-CwBUR0ED.css","/assets/ConfirmReason-DpUcOvBW.css","/assets/DashboardHome-C_H9tJLi.css","/assets/Designer-CyZWSObU.css","/assets/DirectorComplaints-DLeqcIdz.css","/assets/DriveFiles-Dc9-i-9W.css","/assets/DriveStates-DEIkcm11.css","/assets/Expenses-D81yiGvY.css","/assets/FeesRatesPage-BTkdaV68.css","/assets/FieldInput-B1yQY-bX.css","/assets/FileViewer-B6-3Y3ER.css","/assets/FormBuilder-CJpKptK6.css","/assets/FormSaved--uITq4Bw.css","/assets/FormulaInfo-BxD6WzuX.css","/assets/GenerateDialog-CNhisDCH.css","/assets/InvoiceDialog-CDDW39Ta.css","/assets/InvoiceSettings-D4HfEuN0.css","/assets/Invoices-ujGmaopf.css","/assets/Issues-B_J7mGpR.css","/assets/KPI-B-XAzJ2C.css","/assets/LeadDefaults-CahwO9kj.css","/assets/LinksDialog-CADFPHWn.css","/assets/ListingFlow-CBNa6eNo.css","/assets/LiveStatus-BVu_E7Am.css","/assets/MasterFile-CKip6WWV.css","/assets/MonthEnd-6w4GpjGx.css","/assets/MonthPicker-BVxsndEj.css","/assets/Notifications-sYFppQzj.css","/assets/OfflinePayments-DtS_1uFN.css","/assets/Onboarding-CZ3q2Y81.css","/assets/OneToOne-dmnWCDQI.css","/assets/OptionPicker-qdD1p-Gd.css","/assets/OwnerDrawer-Bki4vjSF.css","/assets/PeoplePicker-CsfHLGUz.css","/assets/PropertiesRoute-B5cqo4JX.css","/assets/PropertyInspectionForm-Cg1CNsCv.css","/assets/PropertyPicker-C4fiH_Mz.css","/assets/PublicForm-rQYU-Rgf.css","/assets/Quarters-D8eTC4BR.css","/assets/RaiseComplaint-D5wzkYCP.css","/assets/RatesTab-BAZakLP2.css","/assets/RatingPicker-CTT8sdEl.css","/assets/RecordEdit-D1s_APgY.css","/assets/Records-Dm_2ZAVT.css","/assets/RefreshButton-BseFGCcV.css","/assets/Renewals-KA6If_JI.css","/assets/Reports-ClEi3Ayy.css","/assets/ReservationForm-Dgu5x5iP.css","/assets/Roles-D1rkDXiR.css","/assets/SalaryAdvance-D3GUbbvF.css","/assets/SalesLeads-BgwqML2B.css","/assets/Setup-DyQ0Ihe_.css","/assets/Sops-CIH1ujbS.css","/assets/Staff-sg5pH1D8.css","/assets/StaffComplaints-CrT0ro6g.css","/assets/StaffHR-jLiu4Iff.css","/assets/StatementApprovals-B_s3njyH.css","/assets/TMS-CGgHc4KU.css","/assets/ThankYou-D5xDWSOv.css","/assets/Upload-BEjdGqlz.css","/assets/UploadFile-DV6OewRi.css","/assets/UtilityForm-CtUdAr0l.css","/assets/WhatsNew-D8mR7jFV.css","/assets/agreements-CTxX_tGf.css","/assets/chat-sources-BkJ5NSn1.css","/assets/index-Cd1SldrW.css","/assets/portfolio-DgDrqRuf.css"];

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
