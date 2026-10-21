// Every page address in one list. Pages load only when first opened.
// meta.label = the sidebar item that lights up; meta.roles = who may open the page.
import { createRouter, createWebHistory } from 'vue-router';
import { signOut } from 'firebase/auth';
import { auth, ALLOWED_ROLES } from './lib/firebase.js';
import { useSession } from './stores/session.js';

const FD = ['director', 'finance'], D = ['director'], DH = ['director', 'hr'];
const page = (path, load, label, roles = FD, extra = {}) => ({ path, component: load, meta: { label, title: label, roles, ...extra } });

const routes = [
  { path: '/', component: () => import('./pages/Login.vue'), meta: { public: true, title: 'Sign in' } },

  page('/Dashboard', () => import('./pages/Dashboard/Dashboard.vue'), 'Dashboard', ALLOWED_ROLES),
  page('/Reports', () => import('./pages/Reports/Reports.vue'), 'Reports'),

  ...['owners', 'properties', 'bookings'].map(section =>
    page(`/Portfolio/${section}`, () => import('./pages/Portfolio/Portfolio.vue'), section[0].toUpperCase() + section.slice(1), FD, { section })),
  { path: '/Portfolio', redirect: to => ({ path: `/Portfolio/${['owners', 'bookings'].includes(to.query.tab) ? to.query.tab : 'properties'}`, query: { ...to.query, tab: undefined } }) },

  page('/Finance/upload', () => import('./pages/Finance/Upload.vue'), 'Upload eZee report'),
  page('/Finance/expenses', () => import('./pages/Finance/Expenses.vue'), 'Expenses & Reimbursements'),
  page('/Finance/month-end', () => import('./pages/Finance/MonthEnd.vue'), 'Month-end payout'),
  page('/Finance/invoices', () => import('./pages/Finance/Invoices.vue'), 'Invoices & Receipts'),
  page('/Finance/offline-payments', () => import('./pages/Finance/OfflinePayments.vue'), 'Offline payments'),

  page('/Operations/issues', () => import('./pages/Operations/Issues.vue'), 'Issues'),
  page('/Operations/offline-inquiries', () => import('./pages/Operations/SalesLeads.vue'), 'Offline inquiries'),
  { path: '/Operations/sales-leads', redirect: to => ({ path: '/Operations/offline-inquiries', query: to.query }) },
  page('/Operations/booking-forms', () => import('./pages/Operations/BookingForms.vue'), 'Booking forms'),

  page('/Procurement/new-owner-listings', () => import('./pages/Procurement/NewListings.vue'), 'New owner listings'),
  { path: '/Procurement/new-listings', redirect: to => ({ path: '/Procurement/new-owner-listings', query: to.query }) },
  page('/Procurement/forms', () => import('./pages/Procurement/Forms.vue'), 'Forms', FD, { title: 'Procurement forms' }),

  page('/Playbook/onboarding', () => import('./pages/Playbook/Onboarding.vue'), 'Onboarding'),
  page('/Playbook/business-model', () => import('./pages/Playbook/BusinessModel.vue'), 'Business Model'),

  // Staff accounts and Audit log: Director and HR (Khairul 21 Oct). HR signs in once 'hr' is added to ALLOWED_ROLES.
  page('/Settings/staff', () => import('./pages/Settings/Staff.vue'), 'Staff accounts', DH),
  page('/Settings/brand-logos', () => import('./pages/Settings/BrandLogos.vue'), 'Brand logos', D),
  page('/Settings/audit-log', () => import('./pages/Settings/AuditLog.vue'), 'Audit log', DH),
  page('/Settings/appearance', () => import('./pages/Settings/Appearance.vue'), '', ALLOWED_ROLES, { title: 'Appearance' }),

  ...[['attendance', 'Attendance SOP'], ['advance', 'Advance SOP'], ['allowance', 'Allowance SOP']].map(([sop, label]) =>
    page(`/HR/${sop}-sop`, () => import('./pages/HR/SopPage.vue'), label, FD, { sop })),
  page('/HR/claim-socso', () => import('./pages/HR/SopPage.vue'), 'Claim SOCSO', FD, { sop: 'socso' }),
  page('/HR/staff-complaints', () => import('./pages/HR/StaffComplaints.vue'), 'Staff complaints', D),
  page('/HR/director-complaints', () => import('./pages/HR/DirectorComplaints.vue'), 'Director complaints', D),
  page('/HR/raise-complaint', () => import('./pages/HR/RaiseComplaint.vue'), 'Raise a complaint'),

  // Old prototype addresses (…/page.html) still work.
  { path: '/index.html', redirect: to => ({ path: '/', query: to.query }) },
  { path: '/Dashboard/dashboard.html', redirect: '/Dashboard' },
  { path: '/Reports/reports.html', redirect: '/Reports' },
  { path: '/:p(.*)\\.html', redirect: to => ({ path: '/' + to.params.p, query: to.query }) },
  { path: '/:p(.*)*', redirect: '/Dashboard' }
];

export const router = createRouter({ history: createWebHistory(), routes, scrollBehavior: () => ({ top: 0 }) });

router.beforeEach(async to => {
  if (to.meta.public) return true;
  const me = await useSession().check();
  if (!me.user) return { path: '/' };
  if (!(to.meta.roles || ALLOWED_ROLES).includes(me.role)) {
    if (ALLOWED_ROLES.includes(me.role)) return { path: '/Dashboard' };
    await signOut(auth);
    location.replace('/?noaccess=1');
    return false;
  }
  return true;
});
router.afterEach(to => { document.title = `${to.meta.title || 'Widebed'} · Widebed PMS`; });
