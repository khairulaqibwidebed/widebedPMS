// Widebed PMS service worker. Built by vite.config.js (pwaServiceWorker), which fills in the version and the file list.
// It keeps ONLY the app's own files (code, styles, icons) so the app opens fast and shows the offline notice.
// It never touches Firestore, Firebase Auth, Google Drive, fonts or /api: those are other hosts or are skipped below,
// so nobody is ever shown old or someone else's data.
// A new version waits until the person presses Reload on the "New version available" bar (lib/pwa.js).
const VERSION = '20261127073039';
const CACHE = 'wb-app-' + VERSION;
const PRECACHE = ["/index.html","/manifest.webmanifest","/icons/icon-192.png","/assets/index-DMsL5-F7.js","/assets/AgentDatabase-BPzUyQXi.css","/assets/AgreementGuide-zGRsGdV4.css","/assets/Announcements-UYf0oPB4.css","/assets/Appearance-frNkiqYX.css","/assets/Approval-BiSf-JNe.css","/assets/Attendance-Cps_bhOk.css","/assets/AuditLog-CEdsF8gn.css","/assets/BookingForms-CtTfQ7xD.css","/assets/BookingSettings-ClKFOLVa.css","/assets/BookingsPage-nAxjcG2A.css","/assets/BranchManagement-B8qJ53e0.css","/assets/BrandLogos-DRRxhR1O.css","/assets/BulkConverter-B6EFRQnP.css","/assets/BulkUpload-CCCIAb3L.css","/assets/BusinessModel-D0FZGf6B.css","/assets/COHEvaluate-BYYVROe5.css","/assets/ComboInput-COlsg6Oi.css","/assets/ComplaintChat-YdVVSyHo.css","/assets/ConfirmDialog-CwBUR0ED.css","/assets/ConfirmReason-DpUcOvBW.css","/assets/DashboardHome-DCm73QKO.css","/assets/Designer-CyZWSObU.css","/assets/DirectorComplaints-Du7J7qkl.css","/assets/DriveFiles-Bl8mEdWe.css","/assets/DriveStates-DTW2ziT3.css","/assets/Expenses-eXXjPY_C.css","/assets/FeesRatesPage-BTkdaV68.css","/assets/FieldInput-B1yQY-bX.css","/assets/FileViewer-B6-3Y3ER.css","/assets/FormBuilder-Djp5UxIt.css","/assets/FormSaved--uITq4Bw.css","/assets/FormulaInfo-BuBnWigk.css","/assets/GenerateDialog-CNhisDCH.css","/assets/InvoiceDialog-V5-S3tx_.css","/assets/Invoices-Bw3O-lJY.css","/assets/Issues--IysfgUD.css","/assets/KPI-B1but90_.css","/assets/LeadDefaults-7drLZukI.css","/assets/Leave-CmF7JWWU.css","/assets/LinksDialog-ZxPykouM.css","/assets/ListingFlow-6OXDeE9r.css","/assets/LiveStatus-BVu_E7Am.css","/assets/MasterFile-CKip6WWV.css","/assets/MonthEnd-BRUv2LRL.css","/assets/MonthPicker-BVxsndEj.css","/assets/Notifications-sYFppQzj.css","/assets/OfflinePayments-CyeMyeJO.css","/assets/Onboarding-VKaGULxa.css","/assets/OneToOne-B2jfvA5S.css","/assets/OptionPicker-B-M1ATS-.css","/assets/OwnerDrawer-CumY6Ay0.css","/assets/PeoplePicker-VvchS2rV.css","/assets/PropertiesRoute-DsgKSLdL.css","/assets/PropertyInspectionForm-Cg1CNsCv.css","/assets/PropertyPicker-C4fiH_Mz.css","/assets/PublicForm-E_TV1HUX.css","/assets/Quarters-CVssF3f4.css","/assets/RaiseComplaint-D5wzkYCP.css","/assets/RatesTab-ClwWoGk4.css","/assets/RatingPicker-CTT8sdEl.css","/assets/RecordEdit-8mAlF2GT.css","/assets/Records-SmjMOj_S.css","/assets/RefreshButton-BseFGCcV.css","/assets/Renewals-CrnzLwhd.css","/assets/Reports-ClEi3Ayy.css","/assets/ReservationForm-De1Lx6p_.css","/assets/Roles-D-bum67g.css","/assets/SalaryAdvance-C9wFXVbm.css","/assets/SalesLeads-DN2f-uK3.css","/assets/Setup-BBWgR5qr.css","/assets/Sops-oFIzOun1.css","/assets/Staff-DzqK86po.css","/assets/StaffComplaints-CrT0ro6g.css","/assets/StaffHR-l-Gzz2QN.css","/assets/StatementApprovals-DA7JwUGr.css","/assets/TMS-TzQTriIa.css","/assets/ThankYou-DmeIWARO.css","/assets/Upload-BPVzOXPt.css","/assets/UploadFile-DV6OewRi.css","/assets/UtilityForm--jO540fN.css","/assets/WhatsNew-9YNt8RG-.css","/assets/agreements-CTxX_tGf.css","/assets/chat-sources-BkJ5NSn1.css","/assets/index-BhCDZQUi.css","/assets/portfolio-DgDrqRuf.css"];

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
