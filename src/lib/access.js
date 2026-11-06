// lib/access.js — which pages a person can open, and whether they can change things there.
//
// Each tickable page has a key and two levels: '<key>.view' and '<key>.edit' (Edit always includes View).
// The ticks are saved on the person's staff record as users/{uid}.perms (Staff accounts page).
// No perms saved = their role's preset below, so existing accounts work exactly as before.
//
// IMPORTANT: keep PRESETS in step with presetFor() in firestore.rules. The rules use the same lists
// to decide what data each person may read and write.

// Every page that can be ticked. group = heading in the tick table.
// viewOnly = only a View box (nothing to change on the page). editOnly = everyone views it; only Edit is tickable.
// Order and groups follow the sidebar (6 Nov 2026): Portfolio, Leads & Agreements, Accounting, then the rest.
export const PAGES = [
  { key: 'portfolio',        label: 'Owners, Properties & Bookings', group: 'Portfolio',   to: ['/Portfolio/owners', '/Portfolio/properties', '/Portfolio/bookings'] },
  { key: 'bookingForms',     label: 'Booking Forms',                 group: 'Portfolio',   to: ['/Operations/booking-forms'], viewOnly: true },
  { key: 'offlinePayments',  label: 'Offline Payments',              group: 'Portfolio',   to: ['/Finance/offline-payments'] },
  { key: 'bulkUpload',       label: 'Bulk Upload',                   group: 'Portfolio',   to: ['/Portfolio/bulk-upload'] },
  { key: 'newOwnerListings', label: 'Owner Leads',                   group: 'Leads & Agreements', to: ['/Procurement/new-owner-listings'] },
  { key: 'offlineInquiries', label: 'Tenant Leads',                  group: 'Leads & Agreements', to: ['/Operations/offline-inquiries'] },
  { key: 'agreementSetup',   label: 'Agreement Setup (forms, templates, formulas)', group: 'Leads & Agreements', to: ['/Agreements/setup'], viewOnly: true },
  { key: 'ezeeUpload',       label: 'Upload eZee Report',            group: 'Accounting',     to: ['/Finance/upload'] },
  { key: 'expenses',         label: 'Expenses & Others',             group: 'Accounting',     to: ['/Finance/expenses'] },
  { key: 'monthEnd',         label: 'Month-End Payout',              group: 'Accounting',     to: ['/Finance/month-end'] },
  { key: 'invoices',         label: 'Invoices & Receipts',           group: 'Accounting',     to: ['/Finance/invoices'] },
  { key: 'reports',          label: 'Reports',                       group: 'Accounting',     to: ['/Reports'] },
  { key: 'playbook',         label: 'Playbook (Onboarding, Business Model)', group: 'Content', to: [], editOnly: true },
  { key: 'sops',             label: 'HR SOP pages',                  group: 'Content',     to: [], editOnly: true },
  { key: 'performance',      label: 'Performance Management',        group: 'Performance', to: ['/Performance/quarters'] }
];

// What Staff accounts shows: one tick per row, giving both View and Edit of the pages in it (each page has its own row).
// Content rows only have an Edit tick (everyone can read them). The saved ticks still use the '<key>.view' / '<key>.edit' names above,
// so the security rules and the sidebar work as before.
export const ACCESS_ROWS = [
  { id: 'portfolio', label: 'Owners, Properties & Bookings', group: 'Portfolio', keys: ['portfolio'] },
  { id: 'bookingForms', label: 'Booking Forms', group: 'Portfolio', keys: ['bookingForms'] },
  { id: 'offlinePayments', label: 'Offline Payments', group: 'Portfolio', keys: ['offlinePayments'] },
  { id: 'bulkUpload', label: 'Bulk Upload', group: 'Portfolio', keys: ['bulkUpload'] },
  { id: 'newOwnerListings', label: 'Owner Leads', group: 'Leads & Agreements', keys: ['newOwnerListings'] },
  { id: 'offlineInquiries', label: 'Tenant Leads', group: 'Leads & Agreements', keys: ['offlineInquiries'] },
  { id: 'agreementSetup', label: 'Agreement Setup (forms, templates, formulas)', group: 'Leads & Agreements', keys: ['agreementSetup'] },
  { id: 'ezeeUpload', label: 'Upload eZee Report', group: 'Accounting', keys: ['ezeeUpload'] },
  { id: 'expenses', label: 'Expenses & Others', group: 'Accounting', keys: ['expenses'] },
  { id: 'monthEnd', label: 'Month-End Payout', group: 'Accounting', keys: ['monthEnd'] },
  { id: 'invoices', label: 'Invoices & Receipts', group: 'Accounting', keys: ['invoices'] },
  { id: 'reports', label: 'Reports', group: 'Accounting', keys: ['reports'] },
  { id: 'playbook', label: 'Playbook (Onboarding, Business Model)', group: 'Content', keys: ['playbook'], editOnly: true },
  { id: 'sops', label: 'HR SOP pages', group: 'Content', keys: ['sops'], editOnly: true },
  { id: 'performance', label: 'Performance Management', group: 'Performance', keys: ['performance'] }
];
// Every permission name a row stands for.
export const rowPerms = row => row.keys.flatMap(k => { const p = PAGES.find(x => x.key === k); return p.viewOnly ? [k + '.view'] : p.editOnly ? [k + '.edit'] : [k + '.view', k + '.edit']; });

// One line under some groups in the tick table, so it's clear what a tick really gives.
export const GROUP_NOTES = {
  Accounting: 'Any Accounting page lets them read the finance data. Any Accounting Edit lets them change it.',
  Portfolio: 'Edit includes owners\' bank details and unit terms. Offline Payments Edit also lets them change the finance data.',
  Content: 'Everyone can read these. Edit lets them change the text.',
  'Leads & Agreements': 'Agreements and Renewals show for everyone with this group (not HR or IT). Agreement Setup lets them change forms, formulas, templates and where fields print.',
  Performance: 'Quarterly performance management (quarters, COH, KPI, TMS administration). Everyone can still see their own results without this tick.'
};

const both = key => [key + '.view', key + '.edit'];

// What each role gets before any ticks are changed (today's sidebar for that role).
// Directors are not listed: they can do everything.
export const PRESETS = {
  finance: [...both('reports'), ...both('ezeeUpload'), ...both('expenses'), ...both('monthEnd'), ...both('invoices'),
    ...both('offlinePayments'), ...both('portfolio'), ...both('bulkUpload'), ...both('offlineInquiries')],
  operations: ['portfolio.view', ...both('offlineInquiries'), 'bookingForms.view', 'newOwnerListings.view', 'offlinePayments.view'],
  it: [],
  hr: ['playbook.edit', 'sops.edit'],
  procurement: ['portfolio.view', ...both('newOwnerListings')],
  marketing: ['portfolio.view', ...both('newOwnerListings')]
};

const ALL_PERMS = new Set(PAGES.flatMap(p => p.viewOnly ? [p.key + '.view'] : p.editOnly ? [p.key + '.edit'] : both(p.key)));

// A person's ticks: their saved list, or their role's preset.
export function permsOf(me) {
  if (!me || !me.role) return [];
  return Array.isArray(me.perms) ? me.perms : (PRESETS[me.role] || []);
}

// Can this person do this? e.g. can(me, 'expenses.edit'). Directors can do everything.
export function can(me, perm) {
  return !!me && !!me.role && (me.role === 'director' || permsOf(me).includes(perm));
}

// The tickable page a route belongs to, or null (always-on and role-only pages).
export function pageKeyFor(path) {
  const page = PAGES.find(p => p.to.includes(path));
  return page ? page.key : null;
}

// Can this person open a route? Tickable pages need their View tick; every other page follows the role list.
export function canOpen(meta, me, allRoles = []) {
  if (!me || !me.role) return false;
  if (meta.perm) return can(me, meta.perm + '.view');
  return (meta.roles || allRoles).includes(me.role);
}

// Tidy a tick list: known keys only, Edit adds View, fixed order, no duplicates.
export function cleanPerms(list) {
  const set = new Set((list || []).filter(p => ALL_PERMS.has(p)));
  for (const p of PAGES) if (!p.editOnly && set.has(p.key + '.edit')) set.add(p.key + '.view');
  return [...ALL_PERMS].filter(p => set.has(p));
}

export const samePerms = (a, b) => cleanPerms(a).join() === cleanPerms(b).join();

// "Expenses & Others (edit)" — used in the audit log text.
export function permLabel(perm) {
  const [key, level] = perm.split('.');
  const page = PAGES.find(p => p.key === key);
  return (page ? page.label : key) + (level === 'edit' ? ' (edit)' : '');
}
