// Sidebar per role. Folding groups: only the group of the current page is open (agreed 19 Oct for all roles).
// to = null means the page is not built yet. icon = key from components/navIcons.js.
// P = a page (label, route, icon). G = a department group (label, icon, pages); the group icon is what shows in the collapsed rail.
// The sidebar a person actually sees comes from navFor() at the bottom: their role's list, minus pages they
// were unticked from, plus pages they were ticked for on Staff accounts (lib/access.js).
import { can, pageKeyFor } from './lib/access.js';

const P = (label, to = null, icon = 'dot') => ({ label, to, icon });
const G = (label, icon, items) => ({ label, icon, items });

const PORTFOLIO = G('Portfolio', 'building', [P('Owners', '/Portfolio/owners', 'user'), P('Properties', '/Portfolio/properties', 'building'), P('Bookings', '/Portfolio/bookings', 'calendar')]);
// Finance and Directors also get Bulk Upload (owners and properties from a spreadsheet).
const PORTFOLIO_FD = G('Portfolio', 'building', [...PORTFOLIO.items, P('Bulk Upload', '/Portfolio/bulk-upload', 'upload')]);
const HR_STAFF = G('HR', 'users', [P('Announcements', '/HR/announcements', 'megaphone'), P('Attendance SOP', '/HR/attendance-sop', 'clock'), P('Advance SOP', '/HR/advance-sop', 'wallet'), P('Salary Advance', '/HR/salary-advance', 'banknote'), P('Allowance SOP', '/HR/allowance-sop', 'gift'), P('Claim SOCSO', '/HR/claim-socso', 'shieldCheck'), P('Raise a Complaint', '/HR/raise-complaint', 'flag')]);
const NEW_LISTINGS = G('Procurement', 'package', [P('Owner Leads', '/Procurement/new-owner-listings', 'home')]);
// Every role's own account page, last in the sidebar.
const MY_ACCOUNT = G('My Account', 'user', [P('Profile & Appearance', '/Settings/appearance', 'sliders')]);
// Agreements: everyone fills in forms. Setup shows for Directors and anyone ticked for it (navFor adds it).
const AGREEMENTS = G('Agreements', 'fileText', [P('Agreements', '/Agreements', 'fileText'), P('Renewals', '/Agreements/renewals', 'fileText')]);
const AGREEMENTS_DIR = G('Agreements', 'fileText', [P('Agreements', '/Agreements', 'fileText'), P('Renewals', '/Agreements/renewals', 'fileText'), P('Agreement Setup', '/Agreements/setup', 'sliders')]);
const PLAYBOOK = G('Playbook', 'book', [P('Onboarding', '/Playbook/onboarding', 'book'), P('Business Model', '/Playbook/business-model', 'briefcase')]);
// Everyone evaluates and is evaluated; only Director/HR (performance tick) also get Quarterly Management.
const PERFORMANCE = G('Performance', 'chart', [P('My Performance', '/Performance/my', 'chart'), P('COH Evaluations', '/Performance/coh', 'users'), P('KPI Management', '/Performance/kpi', 'target'), P('TMS Performance', '/Performance/tms', 'clipboard')]);
const PERFORMANCE_ADMIN = G('Performance', 'chart', [P('My Performance', '/Performance/my', 'chart'), P('Quarterly Management', '/Performance/quarters', 'calendar'), P('COH Evaluations', '/Performance/coh', 'users'), P('KPI Management', '/Performance/kpi', 'target'), P('TMS Performance', '/Performance/tms', 'clipboard'), P('Final Approval', '/Performance/approval', 'shieldCheck')]);

export const NAV = {
  finance: [
    { items: [P('Dashboard', '/Dashboard', 'dashboard')] },
    PORTFOLIO_FD,
    G('Accounting', 'banknote', [P('Upload eZee Report', '/Finance/upload', 'upload'), P('Expenses & Others', '/Finance/expenses', 'receipt'), P('Month-End Payout', '/Finance/month-end', 'banknote'),
      P('Invoices & Receipts', '/Finance/invoices', 'fileText'), P('Offline Payments', '/Finance/offline-payments', 'creditCard'), P('Reports', '/Reports', 'chart')]),
    // Offline Inquiries belongs under Operations (same as the Director's and Operations' sidebars), not Accounting.
    G('Operations', 'clipboard', [P('Issues', '/Operations/issues', 'alert'), P('Tenant Leads', '/Operations/offline-inquiries', 'message')]),
    AGREEMENTS, PLAYBOOK, PERFORMANCE,
    HR_STAFF,
    MY_ACCOUNT
  ],
  director: [
    { items: [P('Dashboard', '/Dashboard', 'dashboard')] },
    PORTFOLIO_FD,
    G('Accounting', 'banknote', [P('Statement Approvals', '/Finance/statement-approvals', 'shieldCheck'), P('Upload eZee Report', '/Finance/upload', 'upload'), P('Expenses & Others', '/Finance/expenses', 'receipt'), P('Month-End Payout', '/Finance/month-end', 'banknote'),
      P('Invoices & Receipts', '/Finance/invoices', 'fileText'), P('Offline Payments', '/Finance/offline-payments', 'creditCard'), P('Reports', '/Reports', 'chart')]),
    G('Operations', 'clipboard', [P('Issues', '/Operations/issues', 'alert'), P('Tenant Leads', '/Operations/offline-inquiries', 'message'), P('Booking Forms', '/Operations/booking-forms', 'clipboard')]),
    G('Procurement', 'package', [P('Owner Leads', '/Procurement/new-owner-listings', 'home')]),
    AGREEMENTS_DIR, PLAYBOOK, PERFORMANCE_ADMIN,
    G('Company Settings', 'settings', [P('Staff Accounts', '/Settings/staff', 'users'), P('Roles', '/Settings/roles', 'sliders'), P('Brand Logos', '/Settings/brand-logos', 'image'), P('Audit Log', '/Settings/audit-log', 'history')]),
    G('HR', 'users', [P('Announcements', '/HR/announcements', 'megaphone'), P('Attendance SOP', '/HR/attendance-sop', 'clock'), P('Advance SOP', '/HR/advance-sop', 'wallet'), P('Salary Advance', '/HR/salary-advance', 'banknote'), P('Allowance SOP', '/HR/allowance-sop', 'gift'), P('Claim SOCSO', '/HR/claim-socso', 'shieldCheck'),
       P('Director Complaints', '/HR/director-complaints', 'shieldAlert'), P('Raise a Complaint', '/HR/raise-complaint', 'flag')]),
    MY_ACCOUNT
  ],
  // Roles without their own pages yet (signed in 21 Oct): their Dashboard, Issues, Playbook, the staff HR pages and their own forms.
  // Portfolio is view-only for Operations, Procurement and Marketing (no fees, payouts or owner contact details).
  operations: [
    { items: [P('Dashboard', '/Dashboard', 'dashboard')] },
    PORTFOLIO,
    G('Operations', 'clipboard', [P('Issues', '/Operations/issues', 'alert'), P('Tenant Leads', '/Operations/offline-inquiries', 'message'), P('Booking Forms', '/Operations/booking-forms', 'clipboard'), P('Offline Payments', '/Finance/offline-payments', 'creditCard')]),
    NEW_LISTINGS, AGREEMENTS, PLAYBOOK, PERFORMANCE, HR_STAFF,
    MY_ACCOUNT
  ],
  // IT: view-only except its own tickets.
  it: [
    { items: [P('Dashboard', '/Dashboard', 'dashboard')] },
    G('Operations', 'clipboard', [P('Issues', '/Operations/issues', 'alert')]),
    AGREEMENTS, PLAYBOOK, PERFORMANCE, HR_STAFF,
    MY_ACCOUNT
  ],
  hr: [
    { items: [P('Dashboard', '/Dashboard', 'dashboard')] },
    G('HR', 'users', [P('Announcements', '/HR/announcements', 'megaphone'), P('Attendance SOP', '/HR/attendance-sop', 'clock'), P('Advance SOP', '/HR/advance-sop', 'wallet'), P('Salary Advance', '/HR/salary-advance', 'banknote'), P('Allowance SOP', '/HR/allowance-sop', 'gift'), P('Claim SOCSO', '/HR/claim-socso', 'shieldCheck'),
      P('Staff Complaints', '/HR/staff-complaints', 'clipboard'), P('Director Complaints', '/HR/director-complaints', 'shieldAlert')]),
    G('Operations', 'clipboard', [P('Issues', '/Operations/issues', 'alert')]),
    AGREEMENTS, PLAYBOOK, PERFORMANCE_ADMIN,
    G('Company Settings', 'settings', [P('Staff Accounts', '/Settings/staff', 'users'), P('Audit Log', '/Settings/audit-log', 'history')]),
    MY_ACCOUNT
  ],
  procurement: [
    { items: [P('Dashboard', '/Dashboard', 'dashboard')] },
    PORTFOLIO,
    G('Procurement', 'package', [P('Owner Leads', '/Procurement/new-owner-listings', 'home')]),
    G('Operations', 'clipboard', [P('Issues', '/Operations/issues', 'alert')]),
    AGREEMENTS, PLAYBOOK, PERFORMANCE, HR_STAFF,
    MY_ACCOUNT
  ],
  marketing: [
    { items: [P('Dashboard', '/Dashboard', 'dashboard')] },
    PORTFOLIO,
    G('Operations', 'clipboard', [P('Issues', '/Operations/issues', 'alert')]),
    NEW_LISTINGS, AGREEMENTS, PLAYBOOK, PERFORMANCE, HR_STAFF,
    MY_ACCOUNT
  ]
};

// Roles made on the Roles page start from this list; the pages they were ticked for are added by navFor().
NAV.custom = [
  { items: [P('Dashboard', '/Dashboard', 'dashboard')] },
  G('Operations', 'clipboard', [P('Issues', '/Operations/issues', 'alert')]),
  AGREEMENTS, PLAYBOOK, PERFORMANCE, HR_STAFF,
  MY_ACCOUNT
];
const navOf = role => NAV[role] || NAV.custom;

// Where a role lands after signing in: the Dashboard if they have one, otherwise the first page in their sidebar.
export function homeFor(role) {
  const pages = navOf(role).flatMap(g => g.items).filter(it => it.to);
  if (pages.some(it => it.to === '/Dashboard')) return '/Dashboard';
  if (pages.length) return pages[0].to;
  return '/Dashboard';
}

// The sidebar for one person. Starts from their role's list (so the order they know stays), takes out tickable pages
// they can't view, then adds tickable pages they were given from the full (Director) sidebar: into the group with the
// same name, or as a new group just above My Account. NAV itself is never changed.
export function navFor(me) {
  const role = (me && me.role) || '';
  if (role === 'director') return NAV.director;
  const allowed = it => { const key = pageKeyFor(it.to); return !key || can(me, key + '.view'); };

  // Interns (Staff accounts > HR details) have no Salary Advance page (5 Nov 2026)
  const out = navOf(role).map(g => ({ ...g, items: g.items.filter(it => allowed(it) && !(me.intern && it.to === '/HR/salary-advance')) })).filter(g => g.items.length);
  const seen = new Set(out.flatMap(g => g.items.map(it => it.to)));

  for (const group of NAV.director) {
    for (const it of group.items) {
      const key = pageKeyFor(it.to);
      if (!key || seen.has(it.to) || !can(me, key + '.view')) continue;
      seen.add(it.to);
      const same = out.find(g => g.label && g.label === group.label);
      if (same) { same.items.push(it); continue; }
      const myAccount = out.findIndex(g => g.label === 'My Account');
      out.splice(myAccount === -1 ? out.length : myAccount, 0, { ...group, items: [it] });
    }
  }
  return out;
}