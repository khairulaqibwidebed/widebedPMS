// Sidebar per role. Folding groups: only the group of the current page is open (agreed 19 Oct for all roles).
// to = null means the page is not built yet. icon = key from components/navIcons.js.
// P = a page (label, route, icon). G = a department group (label, icon, pages); the group icon is what shows in the collapsed rail.
// The sidebar a person actually sees comes from navFor() at the bottom: their role's list, minus pages they
// were unticked from, plus pages they were ticked for on Staff accounts (lib/access.js).
//
// 6 Nov 2026 (Khairul): one group order for every role: Dashboard and Issues on top, then Portfolio, Leads & Agreements,
// Accounting, Performance, Playbook, HR, Company Settings, My Account. The Operations and Procurement groups are gone:
// Booking Forms and Offline Payments sit in Portfolio, Owner/Tenant Leads and Agreements in Leads & Agreements.
// Tickable pages a role can't view are dropped by navFor(), so one list can serve several roles.
import { can, navPerm } from './lib/access.js';

const P = (label, to = null, icon = 'dot') => ({ label, to, icon });
const G = (label, icon, items) => ({ label, icon, items });

const TOP = { items: [P('Dashboard', '/Dashboard', 'dashboard'), P('Issues', '/Operations/issues', 'alert')] };
// Owners, Properties and Bookings follow the Portfolio tick; Booking Forms, Offline Payments and Bulk Upload their own ticks.
// Fees & Rates (12 Nov 2026): one set for every property; shows with Portfolio Edit (Accounting, Directors, Edit tick).
const PORTFOLIO = G('Portfolio', 'layers', [P('Owners', '/Portfolio/owners', 'user'), P('Properties', '/Portfolio/properties', 'building'),
  P('Bookings', '/Portfolio/bookings', 'calendar'), P('Fees & Rates', '/Portfolio/fees-rates', 'percent'), P('Booking Forms', '/Operations/booking-forms', 'clipboard'),
  P('Offline Payments', '/Finance/offline-payments', 'creditCard'), P('Bulk Upload', '/Portfolio/bulk-upload', 'table')]);
// Leads follow their ticks; Agreements and Renewals are for everyone who has this group (not HR or IT).
// Owner Leads (overview) follows the Owner Leads View tick; Listing Flow (work on a listing) its Edit tick (11 Nov 2026).
const LEADS = G('Leads & Agreements', 'handshake', [P('Owner Leads', '/Procurement/owner-leads', 'home'), P('Listing Flow', '/Procurement/listing-flow', 'filePlus'), P('Tenant Leads', '/Operations/offline-inquiries', 'message'),
  P('Agreements', '/Agreements', 'fileText'), P('Renewals', '/Agreements/renewals', 'refresh')]);
const LEADS_DIR = G('Leads & Agreements', 'handshake', [...LEADS.items, P('Agreement Setup', '/Agreements/setup', 'filePen')]);
// Month-end order.
const ACCOUNTING = G('Accounting', 'calculator', [P('Upload eZee Report', '/Finance/upload', 'upload'), P('Expenses & Others', '/Finance/expenses', 'receipt'),
  P('Month-End Payout', '/Finance/month-end', 'banknote'), P('Invoices & Receipts', '/Finance/invoices', 'files'), P('Reports', '/Reports', 'pieChart')]);
const ACCOUNTING_DIR = G('Accounting', 'calculator', [P('Upload eZee Report', '/Finance/upload', 'upload'), P('Expenses & Others', '/Finance/expenses', 'receipt'),
  P('Statement Approvals', '/Finance/statement-approvals', 'fileCheck'), P('Month-End Payout', '/Finance/month-end', 'banknote'),
  P('Invoices & Receipts', '/Finance/invoices', 'files'), P('Reports', '/Reports', 'pieChart')]);
// Everyone evaluates and is evaluated; only Director/HR (performance tick) also get Quarterly Management.
const PERFORMANCE = G('Performance', 'chart', [P('My Performance', '/Performance/my', 'trendingUp'), P('COH Evaluations', '/Performance/coh', 'userCheck'), P('KPI Management', '/Performance/kpi', 'target'), P('TMS Performance', '/Performance/tms', 'listChecks')]);
const PERFORMANCE_ADMIN = G('Performance', 'chart', [P('My Performance', '/Performance/my', 'trendingUp'), P('Quarterly Management', '/Performance/quarters', 'calendarRange'), P('COH Evaluations', '/Performance/coh', 'userCheck'), P('KPI Management', '/Performance/kpi', 'target'), P('TMS Performance', '/Performance/tms', 'listChecks'), P('Final Approval', '/Performance/approval', 'badgeCheck')]);
const PLAYBOOK = G('Playbook', 'bookOpen', [P('Onboarding', '/Playbook/onboarding', 'book'), P('Business Model', '/Playbook/business-model', 'briefcase')]);
// HR: things to do first, then SOPs (one page for every SOP, 6 Nov 2026).
const SOPS = [P('SOPs', '/HR/sops', 'scrollText')];
const HR_STAFF = G('HR', 'idCard', [P('Announcements', '/HR/announcements', 'megaphone'), P('Salary Advance', '/HR/salary-advance', 'coins'), P('Raise a Complaint', '/HR/raise-complaint', 'flag'), ...SOPS]);
// Attendance (11 Nov 2026): Directors and HR only, never tickable.
const ATTENDANCE = P('Attendance', '/HR/attendance', 'clock');
const HR_DIR = G('HR', 'idCard', [P('Announcements', '/HR/announcements', 'megaphone'), ATTENDANCE, P('Salary Advance', '/HR/salary-advance', 'coins'), P('Raise a Complaint', '/HR/raise-complaint', 'flag'),
  P('Director Complaints', '/HR/director-complaints', 'shieldAlert'), ...SOPS]);
const HR_HR = G('HR', 'idCard', [P('Announcements', '/HR/announcements', 'megaphone'), ATTENDANCE, P('Salary Advance', '/HR/salary-advance', 'coins'),
  P('Staff Complaints', '/HR/staff-complaints', 'messageAlert'), P('Director Complaints', '/HR/director-complaints', 'shieldAlert'), ...SOPS]);
// Every role's own account page, last in the sidebar.
const MY_ACCOUNT = G('My Account', 'userCircle', [P('Profile & Appearance', '/Settings/appearance', 'palette')]);

export const NAV = {
  finance: [TOP, PORTFOLIO, LEADS, ACCOUNTING, PERFORMANCE, PLAYBOOK, HR_STAFF, MY_ACCOUNT],
  director: [TOP, PORTFOLIO, LEADS_DIR, ACCOUNTING_DIR, PERFORMANCE_ADMIN, PLAYBOOK, HR_DIR,
    G('Company Settings', 'settings', [P('Staff Accounts', '/Settings/staff', 'users'), P('Roles', '/Settings/roles', 'userCog'), P('Brand Logos', '/Settings/brand-logos', 'image'), P('Audit Log', '/Settings/audit-log', 'history')]),
    MY_ACCOUNT],
  // Portfolio is view-only for Operations, Procurement and Marketing (no fees, payouts or owner contact details).
  operations: [TOP, PORTFOLIO, LEADS, PERFORMANCE, PLAYBOOK, HR_STAFF, MY_ACCOUNT],
  // IT and HR: no Agreements (6 Nov 2026).
  it: [TOP, PERFORMANCE, PLAYBOOK, HR_STAFF, MY_ACCOUNT],
  hr: [TOP, PERFORMANCE_ADMIN, PLAYBOOK, HR_HR,
    G('Company Settings', 'settings', [P('Staff Accounts', '/Settings/staff', 'users'), P('Audit Log', '/Settings/audit-log', 'history')]),
    MY_ACCOUNT],
  procurement: [TOP, PORTFOLIO, LEADS, PERFORMANCE, PLAYBOOK, HR_STAFF, MY_ACCOUNT],
  marketing: [TOP, PORTFOLIO, LEADS, PERFORMANCE, PLAYBOOK, HR_STAFF, MY_ACCOUNT]
};

// Roles made on the Roles page start from this list (Agreements kept, as before); the pages they were ticked for are added by navFor().
NAV.custom = [TOP, LEADS, PERFORMANCE, PLAYBOOK, HR_STAFF, MY_ACCOUNT];
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
  const allowed = it => { const perm = navPerm(it.to); return !perm || can(me, perm); };

  // Interns (Staff accounts > HR details) have no Salary Advance page (5 Nov 2026)
  const out = navOf(role).map(g => ({ ...g, items: g.items.filter(it => allowed(it) && !(me.intern && it.to === '/HR/salary-advance')) })).filter(g => g.items.length);
  const seen = new Set(out.flatMap(g => g.items.map(it => it.to)));

  for (const group of NAV.director) {
    for (const it of group.items) {
      const perm = navPerm(it.to);
      if (!perm || seen.has(it.to) || !can(me, perm)) continue;
      seen.add(it.to);
      const same = out.find(g => g.label && g.label === group.label);
      if (same) { same.items.push(it); continue; }
      const myAccount = out.findIndex(g => g.label === 'My Account');
      out.splice(myAccount === -1 ? out.length : myAccount, 0, { ...group, items: [it] });
    }
  }
  return out;
}