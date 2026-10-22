// Every page address in one list. Pages load only when first opened.
// meta.label = the sidebar item that lights up; meta.roles = who may open the page.
import { createRouter, createWebHistory } from 'vue-router';
import { signOut } from 'firebase/auth';
import { auth, ALLOWED_ROLES } from './lib/firebase.js';
import { homeFor } from './nav.js';
import { useSession } from './stores/session.js';

const FD = ['director', 'finance'], D = ['director'], DH = ['director', 'hr'];
// Issues, the Playbook and the staff HR pages: every role.
const ALL = ALLOWED_ROLES;
// Portfolio: Director and Finance edit; Operations, Procurement and Marketing view only.
const PORTFOLIO_ROLES = [...FD, 'operations', 'procurement', 'marketing'];
const page = (path, load, label, roles = FD, extra = {}) => ({ path, component: load, meta: { label, title: label, roles, ...extra } });

const routes = [
  { path: '/', component: () => import('./pages/Login.vue'), meta: { public: true, title: 'Sign in' } },

  // Every role has a Dashboard: Director and Finance their own page, the others RoleDashboard (DashboardHome picks).
  page('/Dashboard', () => import('./pages/Dashboard/DashboardHome.vue'), 'Dashboard', ALL),
  page('/Reports', () => import('./pages/Reports/Reports.vue'), 'Reports'),

  ...['owners', 'properties', 'bookings'].map(section =>
    page(`/Portfolio/${section}`, () => import('./pages/Portfolio/Portfolio.vue'), section[0].toUpperCase() + section.slice(1), PORTFOLIO_ROLES, { section })),
  { path: '/Portfolio', redirect: to => ({ path: `/Portfolio/${['owners', 'bookings'].includes(to.query.tab) ? to.query.tab : 'properties'}`, query: { ...to.query, tab: undefined } }) },

  page('/Finance/upload', () => import('./pages/Finance/Upload.vue'), 'Upload eZee Report'),
  page('/Finance/expenses', () => import('./pages/Finance/Expenses.vue'), 'Expenses & Reimbursements'),
  page('/Finance/month-end', () => import('./pages/Finance/MonthEnd.vue'), 'Month-End Payout'),
  page('/Finance/invoices', () => import('./pages/Finance/Invoices.vue'), 'Invoices & Receipts'),
  page('/Finance/offline-payments', () => import('./pages/Finance/OfflinePayments.vue'), 'Offline Payments'),

  page('/Operations/issues', () => import('./pages/Operations/Issues.vue'), 'Issues', ALL),
  page('/Operations/offline-inquiries', () => import('./pages/Operations/SalesLeads.vue'), 'Offline Inquiries', [...FD, 'operations']),
  { path: '/Operations/sales-leads', redirect: to => ({ path: '/Operations/offline-inquiries', query: to.query }) },
  page('/Operations/booking-forms', () => import('./pages/Operations/BookingForms.vue'), 'Booking Forms', [...FD, 'operations']),

  // New Owner Listings: Director and Procurement edit; Finance, Operations and Marketing view only.
  page('/Procurement/new-owner-listings', () => import('./pages/Procurement/NewListings.vue'), 'New Owner Listings', [...FD, 'operations', 'procurement', 'marketing']),
  { path: '/Procurement/new-listings', redirect: to => ({ path: '/Procurement/new-owner-listings', query: to.query }) },
  page('/Procurement/forms', () => import('./pages/Procurement/Forms.vue'), 'Forms', [...FD, 'procurement'], { title: 'Procurement forms' }),

  page('/Playbook/onboarding', () => import('./pages/Playbook/Onboarding.vue'), 'Onboarding', ALL),
  page('/Playbook/business-model', () => import('./pages/Playbook/BusinessModel.vue'), 'Business Model', ALL),

  // Staff accounts and Audit log: Director and HR (Khairul 21 Oct).
  page('/Settings/staff', () => import('./pages/Settings/Staff.vue'), 'Staff Accounts', DH),
  page('/Settings/brand-logos', () => import('./pages/Settings/BrandLogos.vue'), 'Brand Logos', D),
  page('/Settings/audit-log', () => import('./pages/Settings/AuditLog.vue'), 'Audit Log', DH),
  page('/Settings/appearance', () => import('./pages/Settings/Appearance.vue'), 'Profile & Appearance', ALLOWED_ROLES),

  ...[['attendance', 'Attendance SOP'], ['advance', 'Advance SOP'], ['allowance', 'Allowance SOP']].map(([sop, label]) =>
    page(`/HR/${sop}-sop`, () => import('./pages/HR/SopPage.vue'), label, ALL, { sop })),
  page('/HR/claim-socso', () => import('./pages/HR/SopPage.vue'), 'Claim SOCSO', ALL, { sop: 'socso' }),
  page('/HR/staff-complaints', () => import('./pages/HR/StaffComplaints.vue'), 'Staff Complaints', DH),
  page('/HR/director-complaints', () => import('./pages/HR/DirectorComplaints.vue'), 'Director Complaints', DH),
  page('/HR/raise-complaint', () => import('./pages/HR/RaiseComplaint.vue'), 'Raise a Complaint', ALL),

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
  if (!(to.meta.roles || ALLOWED_ROLES).includes(me.role)) {
    if (ALLOWED_ROLES.includes(me.role)) return { path: homeFor(me.role) };
    await signOut(auth);
    location.replace('/?noaccess=1');
    return false;
  }
  return true;
});
router.afterEach(to => { document.title = `${to.meta.title || 'Widebed'} · Widebed PMS`; });
