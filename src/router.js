// Every page address in one list. Pages load only when first opened.
// meta.label = the sidebar item that lights up; meta.roles = who may open the page.
// meta.perm = a tickable page (lib/access.js): opening it needs its View tick on Staff accounts, not a role.
import { createRouter, createWebHistory } from 'vue-router';
import { signOut } from 'firebase/auth';
import { auth, ALLOWED_ROLES } from './lib/firebase.js';
import { canOpen } from './lib/access.js';
import { homeFor } from './nav.js';
import { useSession } from './stores/session.js';

const FD = ['director', 'finance'], D = ['director'], DH = ['director', 'hr'];
// Issues, the Playbook and the staff HR pages: every role.
const ALL = ALLOWED_ROLES;
const page = (path, load, label, roles = FD, extra = {}) => ({ path, component: load, meta: { label, title: label, roles, ...extra } });
// A tickable page: who opens it is decided by the person's ticks (roles left empty on purpose).
const ticked = (path, load, label, perm, extra = {}) => page(path, load, label, [], { perm, ...extra });

const routes = [
  { path: '/', component: () => import('./pages/Login.vue'), meta: { public: true, title: 'Sign in' } },

  // Every role has a Dashboard: Director and Finance their own page, the others RoleDashboard (DashboardHome picks).
  page('/Dashboard', () => import('./pages/Dashboard/DashboardHome.vue'), 'Dashboard', ALL),
  ticked('/Reports', () => import('./pages/Reports/Reports.vue'), 'Reports', 'reports'),

  ...['owners', 'properties', 'bookings'].map(section =>
    ticked(`/Portfolio/${section}`, () => import('./pages/Portfolio/Portfolio.vue'), section[0].toUpperCase() + section.slice(1), 'portfolio', { section })),
  ticked('/Portfolio/bulk-upload', () => import('./pages/Portfolio/BulkUpload.vue'), 'Bulk Upload', 'bulkUpload'),
  { path: '/Portfolio', redirect: to => ({ path: `/Portfolio/${['owners', 'bookings'].includes(to.query.tab) ? to.query.tab : 'properties'}`, query: { ...to.query, tab: undefined } }) },

  ticked('/Finance/upload', () => import('./pages/Finance/Upload.vue'), 'Upload eZee Report', 'ezeeUpload'),
  ticked('/Finance/expenses', () => import('./pages/Finance/Expenses.vue'), 'Expenses & Others', 'expenses'),
  page('/Finance/statement-approvals', () => import('./pages/Finance/StatementApprovals.vue'), 'Statement Approvals', D),   // Director only, never tickable
  ticked('/Finance/month-end', () => import('./pages/Finance/MonthEnd.vue'), 'Month-End Payout', 'monthEnd'),
  ticked('/Finance/invoices', () => import('./pages/Finance/Invoices.vue'), 'Invoices & Receipts', 'invoices'),
  ticked('/Finance/offline-payments', () => import('./pages/Finance/OfflinePayments.vue'), 'Offline Payments', 'offlinePayments'),

  page('/Operations/issues', () => import('./pages/Operations/Issues.vue'), 'Issues', ALL),
  ticked('/Operations/offline-inquiries', () => import('./pages/Operations/SalesLeads.vue'), 'Offline Inquiries', 'offlineInquiries'),
  { path: '/Operations/sales-leads', redirect: to => ({ path: '/Operations/offline-inquiries', query: to.query }) },
  ticked('/Operations/booking-forms', () => import('./pages/Operations/BookingForms.vue'), 'Booking Forms', 'bookingForms'),

  ticked('/Procurement/new-owner-listings', () => import('./pages/Procurement/NewListings.vue'), 'New Owner Listings', 'newOwnerListings'),
  { path: '/Procurement/new-listings', redirect: to => ({ path: '/Procurement/new-owner-listings', query: to.query }) },
  ticked('/Procurement/forms', () => import('./pages/Procurement/Forms.vue'), 'Forms', 'procurementForms', { title: 'Procurement forms' }),

  // Agreements: every role fills in forms and sees records. Setup (forms, formulas, templates, designer) needs its tick.
  page('/Agreements', () => import('./pages/Agreements/Records.vue'), 'Agreements', ALL),
  page('/Agreements/record/:id', () => import('./pages/Agreements/RecordEdit.vue'), 'Agreements', ALL, { title: 'Agreement' }),
  ticked('/Agreements/setup', () => import('./pages/Agreements/Setup.vue'), 'Agreement Setup', 'agreementSetup'),
  ticked('/Agreements/setup/form/:id', () => import('./pages/Agreements/FormBuilder.vue'), 'Agreement Setup', 'agreementSetup', { title: 'Form builder' }),
  ticked('/Agreements/setup/template/:id', () => import('./pages/Agreements/Designer.vue'), 'Agreement Setup', 'agreementSetup', { title: 'Place fields' }),

  page('/Playbook/onboarding', () => import('./pages/Playbook/Onboarding.vue'), 'Onboarding', ALL),
  page('/Playbook/business-model', () => import('./pages/Playbook/BusinessModel.vue'), 'Business Model', ALL),

  // Staff accounts and Audit log: Director and HR (Khairul 21 Oct). Never tickable.
  page('/Settings/staff', () => import('./pages/Settings/Staff.vue'), 'Staff Accounts', DH),
  page('/Settings/brand-logos', () => import('./pages/Settings/BrandLogos.vue'), 'Brand Logos', D),
  page('/Settings/audit-log', () => import('./pages/Settings/AuditLog.vue'), 'Audit Log', DH),
  page('/Settings/appearance', () => import('./pages/Settings/Appearance.vue'), 'Profile & Appearance', ALLOWED_ROLES),

  ...[['attendance', 'Attendance SOP'], ['advance', 'Advance SOP'], ['allowance', 'Allowance SOP']].map(([sop, label]) =>
    page(`/HR/${sop}-sop`, () => import('./pages/HR/SopPage.vue'), label, ALL, { sop })),
  page('/HR/claim-socso', () => import('./pages/HR/SopPage.vue'), 'Claim SOCSO', ALL, { sop: 'socso' }),
  // Staff complaints: HR only. Directors see only the Director complaints page. Never tickable.
  page('/HR/staff-complaints', () => import('./pages/HR/StaffComplaints.vue'), 'Staff Complaints', ['hr']),
  page('/HR/director-complaints', () => import('./pages/HR/DirectorComplaints.vue'), 'Director Complaints', DH),
  page('/HR/raise-complaint', () => import('./pages/HR/RaiseComplaint.vue'), 'Raise a Complaint', ALL),
  page('/Notifications', () => import('./pages/Notifications.vue'), 'Notifications', ALL),

  // Old prototype addresses (…/page.html) still work.
  { path: '/index.html', redirect: to => ({ path: '/', query: to.query }) },
  { path: '/Dashboard/dashboard.html', redirect: '/Dashboard' },
  { path: '/Reports/reports.html', redirect: '/Reports' },
  { path: '/:p(.*)\\.html', redirect: to => ({ path: '/' + to.params.p, query: to.query }) },
  { path: '/:p(.*)*', redirect: '/home' },
  { path: '/home', redirect: () => homeFor(useSession().role) }
];

export const router = createRouter({ history: createWebHistory(), routes, scrollBehavior: () => ({ top: 0 }) });

router.beforeEach(async to => {
  if (to.meta.public) return true;
  const me = await useSession().check();
  if (!me.user) return { path: '/' };
  // Tickable pages need their View tick (Directors always have it); the rest follow the role list.
  if (!canOpen(to.meta, me, ALLOWED_ROLES)) {
    if (ALLOWED_ROLES.includes(me.role)) return { path: homeFor(me.role) };
    await signOut(auth);
    location.replace('/?noaccess=1');
    return false;
  }
  return true;
});
router.afterEach(to => { document.title = `${to.meta.title || 'Widebed'} · Widebed PMS`; });
