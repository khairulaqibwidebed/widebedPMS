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

  // Portfolio: three separate pages (4 Nov 2026, Phase A). /Portfolio/properties?property=<id> is one property.
  ticked('/Portfolio/owners', () => import('./pages/Portfolio/Owners/OwnersPage.vue'), 'Owners', 'portfolio'),
  ticked('/Portfolio/properties', () => import('./pages/Portfolio/Properties/PropertiesRoute.vue'), 'Properties', 'portfolio'),
  ticked('/Portfolio/bookings', () => import('./pages/Portfolio/Bookings/BookingsPage.vue'), 'Bookings', 'portfolio'),
  ticked('/Portfolio/bulk-upload', () => import('./pages/Portfolio/BulkUpload.vue'), 'Bulk Upload', 'bulkUpload'),
  // Converter (13 Nov 2026): any Excel/CSV -> the Bulk Upload template layout. Same tick as Bulk Upload; nothing is saved to the database.
  ticked('/Portfolio/bulk-upload/converter', () => import('./pages/Portfolio/BulkConverter.vue'), 'Bulk Upload', 'bulkUpload'),
  { path: '/Portfolio', redirect: to => ({ path: `/Portfolio/${['owners', 'bookings'].includes(to.query.tab) ? to.query.tab : 'properties'}`, query: { ...to.query, tab: undefined } }) },

  ticked('/Finance/upload', () => import('./pages/Finance/Upload.vue'), 'Upload eZee Report', 'ezeeUpload'),
  ticked('/Finance/expenses', () => import('./pages/Finance/Expenses.vue'), 'Expenses & Others', 'expenses'),
  page('/Finance/statement-approvals', () => import('./pages/Finance/StatementApprovals.vue'), 'Statement Approvals', D),   // Director only, never tickable
  ticked('/Finance/month-end', () => import('./pages/Finance/MonthEnd.vue'), 'Month-End Payout', 'monthEnd'),
  ticked('/Finance/invoices', () => import('./pages/Finance/Invoices.vue'), 'Invoices & Receipts', 'invoices'),
  ticked('/Finance/offline-payments', () => import('./pages/Finance/OfflinePayments.vue'), 'Offline Payments', 'offlinePayments'),

  page('/Operations/issues', () => import('./pages/Operations/Issues.vue'), 'Issues', ALL),
  ticked('/Operations/offline-inquiries', () => import('./pages/Operations/SalesLeads.vue'), 'Tenant Leads', 'offlineInquiries'),
  { path: '/Operations/sales-leads', redirect: to => ({ path: '/Operations/offline-inquiries', query: to.query }) },
  // One address per form (tabs); the old /Operations/booking-forms opens the Reservation tab
  ticked('/Operations/booking-forms/:form(reservation|utility|property)?', () => import('./pages/Operations/BookingForms.vue'), 'Booking Forms', 'bookingForms'),

  // Owner Leads (13 Nov 2026: one page). Nothing open = every owner lead as a table or cards; one listing stage by stage:
  // /Procurement/listing-flow/new, /Procurement/listing-flow/NL-0001, /Procurement/listing-flow/NL-0001/payment.
  // Opens with the Owner Leads View tick. The old overview address goes to the same page.
  ticked('/Procurement/listing-flow/:id?/:stage(agreement|services|renovation|furniture|payment|setup|marketing|live)?', () => import('./pages/Procurement/OwnerLeads/ListingFlow.vue'), 'Owner Leads', 'newOwnerListings'),
  { path: '/Procurement/owner-leads', redirect: '/Procurement/listing-flow' },
  // Old addresses (notifications and bookmarks): ?id=NL-0001 opens that listing, ?new the new-listing form, else the list.
  ...['/Procurement/new-owner-listings', '/Procurement/new-listings'].map(path => ({ path, redirect: to =>
    to.query.id ? { path: `/Procurement/listing-flow/${to.query.id}`, query: {} } : 'new' in to.query ? { path: '/Procurement/listing-flow/new', query: {} } : { path: '/Procurement/listing-flow', query: {} } })),

  // Agreements: every role fills in forms and sees records. Setup (forms, formulas, templates, designer) needs its tick.
  page('/Agreements', () => import('./pages/Agreements/Records.vue'), 'Agreements', ALL),
  page('/Agreements/renewals', () => import('./pages/Agreements/Renewals.vue'), 'Renewals', ALL, { title: 'Agreement renewals' }),
  page('/Agreements/record/:id', () => import('./pages/Agreements/RecordEdit.vue'), 'Agreements', ALL, { title: 'Agreement' }),
  ticked('/Agreements/setup', () => import('./pages/Agreements/Setup.vue'), 'Agreement Setup', 'agreementSetup'),
  ticked('/Agreements/setup/form/:id', () => import('./pages/Agreements/FormBuilder.vue'), 'Agreement Setup', 'agreementSetup', { title: 'Form builder' }),
  ticked('/Agreements/setup/template/:id', () => import('./pages/Agreements/Designer.vue'), 'Agreement Setup', 'agreementSetup', { title: 'Place fields' }),
  ticked('/Agreements/setup/master/:id', () => import('./pages/Agreements/MasterFile.vue'), 'Agreement Setup', 'agreementSetup', { title: 'Master file' }),
  // Fill-in page for tenants and landlords: no sign-in. The Apps Script checks the link's password.
  { path: '/f/:slug', component: () => import('./pages/Agreements/PublicForm.vue'), meta: { public: true, title: 'Agreement form' } },

  page('/Playbook/onboarding', () => import('./pages/Playbook/Onboarding.vue'), 'Onboarding', ALL),
  page('/Playbook/business-model', () => import('./pages/Playbook/BusinessModel.vue'), 'Business Model', ALL),

  ticked('/Performance/quarters', () => import('./pages/Performance/Quarters.vue'), 'Quarterly Management', 'performance'),
  page('/Performance/coh', () => import('./pages/Performance/COHEvaluate.vue'), 'COH Evaluations', ALL, { title: 'Code of conduct evaluations' }),
  page('/Performance/kpi', () => import('./pages/Performance/KPI.vue'), 'KPI Management', ALL, { title: 'KPI management' }),
  page('/Performance/tms', () => import('./pages/Performance/TMS.vue'), 'TMS Performance', ALL, { title: 'TMS performance' }),
  page('/Performance/my', () => import('./pages/Performance/MyPerformance.vue'), 'My Performance', ALL, { title: 'My performance' }),
  ticked('/Performance/approval', () => import('./pages/Performance/Approval.vue'), 'Final Approval', 'performance', { title: 'Final performance approval' }),
  // One To One Session (12 Nov 2026): Directors and HR only (only they can read the COH marks), never tickable.
  page('/Performance/one-to-one', () => import('./pages/Performance/OneToOne.vue'), 'One To One Session', DH),

  // Staff accounts and Audit log: Director and HR (Khairul 21 Oct). Never tickable.
  page('/Settings/staff', () => import('./pages/Settings/Staff.vue'), 'Staff Accounts', DH),
  page('/Settings/staff-hr', () => import('./pages/Settings/StaffHR.vue'), 'Staff Accounts', DH, { title: 'HR details' }),
  page('/Settings/roles', () => import('./pages/Settings/Roles.vue'), 'Roles', D),   // Director only, never tickable
  page('/Settings/brand-logos', () => import('./pages/Settings/BrandLogos.vue'), 'Brand Logos', D),
  page('/Settings/audit-log', () => import('./pages/Settings/AuditLog.vue'), 'Audit Log', DH),
  page('/Settings/appearance', () => import('./pages/Settings/Appearance.vue'), 'Profile & Appearance', ALLOWED_ROLES),

  // HR > SOPs (6 Nov 2026): one page lists every SOP, each at /HR/sops/<key>. The four old SOP addresses redirect.
  page('/HR/sops/:key?', () => import('./pages/HR/Sops.vue'), 'SOPs', ALL),
  ...[['attendance-sop', 'attendance'], ['advance-sop', 'advance'], ['allowance-sop', 'allowance'], ['claim-socso', 'socso']].map(([old, key]) =>
    ({ path: `/HR/${old}`, redirect: `/HR/sops/${key}` })),
  // Staff complaints: HR only. Directors see only the Director complaints page. Never tickable.
  page('/HR/staff-complaints', () => import('./pages/HR/StaffComplaints.vue'), 'Staff Complaints', ['hr']),
  page('/HR/director-complaints', () => import('./pages/HR/DirectorComplaints.vue'), 'Director Complaints', DH),
  // Salary advances (5 Nov 2026): everyone asks; HR and Directors also get the Requests / Signature tabs on the same page
  // (HR moves requests on). Never tickable. /HR/advances (first address) opens the Requests tab.
  page('/HR/salary-advance', () => import('./pages/HR/SalaryAdvance.vue'), 'Salary Advance', ALL),
  { path: '/HR/advances', redirect: to => ({ path: '/HR/salary-advance', query: { ...to.query, tab: 'requests' } }) },
  page('/HR/raise-complaint', () => import('./pages/HR/RaiseComplaint.vue'), 'Raise a Complaint', ALL),
  // Announcements: everyone reads; HR and Directors post (5 Nov 2026). Never tickable.
  page('/HR/announcements', () => import('./pages/HR/Announcements.vue'), 'Announcements', ALL),
  // Staff Attendance (11 Nov 2026): everyone's clock-ins from the attendance app, holidays, office settings. Directors and HR only.
  page('/HR/attendance', () => import('./pages/HR/Attendance.vue'), 'Attendance', DH),
  page('/Notifications', () => import('./pages/Notifications.vue'), 'Notifications', ALL),
  page('/whats-new', () => import('./pages/WhatsNew/WhatsNew.vue'), "What's New", ALL),

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
