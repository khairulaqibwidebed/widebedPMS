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
export const PAGES = [
  { key: 'reports',          label: 'Reports',                       group: 'Finance',     to: ['/Reports'] },
  { key: 'ezeeUpload',       label: 'Upload eZee Report',            group: 'Finance',     to: ['/Finance/upload'] },
  { key: 'expenses',         label: 'Expenses & Others',             group: 'Finance',     to: ['/Finance/expenses'] },
  { key: 'monthEnd',         label: 'Month-End Payout',              group: 'Finance',     to: ['/Finance/month-end'] },
  { key: 'invoices',         label: 'Invoices & Receipts',           group: 'Finance',     to: ['/Finance/invoices'] },
  { key: 'offlinePayments',  label: 'Offline Payments',              group: 'Finance',     to: ['/Finance/offline-payments'] },
  { key: 'portfolio',        label: 'Owners, Properties & Bookings', group: 'Portfolio',   to: ['/Portfolio/owners', '/Portfolio/properties', '/Portfolio/bookings'] },
  { key: 'bulkUpload',       label: 'Bulk Upload',                   group: 'Portfolio',   to: ['/Portfolio/bulk-upload'] },
  { key: 'offlineInquiries', label: 'Offline Inquiries',             group: 'Operations',  to: ['/Operations/offline-inquiries'] },
  { key: 'bookingForms',     label: 'Booking Forms',                 group: 'Operations',  to: ['/Operations/booking-forms'], viewOnly: true },
  { key: 'newOwnerListings', label: 'New Owner Listings',            group: 'Procurement', to: ['/Procurement/new-owner-listings'] },
  { key: 'procurementForms', label: 'Forms',                         group: 'Procurement', to: ['/Procurement/forms'], viewOnly: true },
  { key: 'playbook',         label: 'Playbook (Onboarding, Business Model)', group: 'Content', to: [], editOnly: true },
  { key: 'sops',             label: 'HR SOP pages',                  group: 'Content',     to: [], editOnly: true },
  { key: 'agreementSetup',   label: 'Agreement Setup (forms, templates, formulas)', group: 'Agreements', to: ['/Agreements/setup'], viewOnly: true }
];

// What Staff accounts shows: one tick per row, giving both View and Edit of the pages in it (each page has its own row).
// Content rows only have an Edit tick (everyone can read them). The saved ticks still use the '<key>.view' / '<key>.edit' names above,
// so the security rules and the sidebar work as before.
export const ACCESS_ROWS = [
  { id: 'reports', label: 'Reports', group: 'Finance', keys: ['reports'] },
  { id: 'ezeeUpload', label: 'Upload eZee Report', group: 'Finance', keys: ['ezeeUpload'] },
  { id: 'expenses', label: 'Expenses & Others', group: 'Finance', keys: ['expenses'] },
  { id: 'monthEnd', label: 'Month-End Payout', group: 'Finance', keys: ['monthEnd'] },
  { id: 'invoices', label: 'Invoices & Receipts', group: 'Finance', keys: ['invoices'] },
  { id: 'offlinePayments', label: 'Offline Payments', group: 'Finance', keys: ['offlinePayments'] },
  { id: 'portfolio', label: 'Owners, Properties & Bookings', group: 'Portfolio', keys: ['portfolio'] },
  { id: 'bulkUpload', label: 'Bulk Upload', group: 'Portfolio', keys: ['bulkUpload'] },
  { id: 'offlineInquiries', label: 'Offline Inquiries', group: 'Operations', keys: ['offlineInquiries'] },
  { id: 'bookingForms', label: 'Booking Forms', group: 'Operations', keys: ['bookingForms'] },
  { id: 'newOwnerListings', label: 'New Owner Listings', group: 'Procurement', keys: ['newOwnerListings'] },
  { id: 'procurementForms', label: 'Forms', group: 'Procurement', keys: ['procurementForms'] },
  { id: 'playbook', label: 'Playbook (Onboarding, Business Model)', group: 'Content', keys: ['playbook'], editOnly: true },
  { id: 'sops', label: 'HR SOP pages', group: 'Content', keys: ['sops'], editOnly: true },
  { id: 'agreementSetup', label: 'Agreement Setup (forms, templates, formulas)', group: 'Agreements', keys: ['agreementSetup'] }
];
// Every permission name a row stands for.
export const rowPerms = row => row.keys.flatMap(k => { const p = PAGES.find(x => x.key === k); return p.viewOnly ? [k + '.view'] : p.editOnly ? [k + '.edit'] : [k + '.view', k + '.edit']; });

// One line under some groups in the tick table, so it's clear what a tick really gives.
export const GROUP_NOTES = {
  Finance: 'Any Finance page lets them read the finance data. Any Finance Edit lets them change it.',
  Portfolio: 'Edit includes owners\' bank details and unit terms.',
  Content: 'Everyone can read these. Edit lets them change the text.',
  Agreements: 'Everyone can fill in agreements and see the records. This tick lets them change forms, formulas, templates and where fields print.'
};

const both = key => [key + '.view', key + '.edit'];

// What each role gets before any ticks are changed (today's sidebar for that role).
// Directors are not listed: they can do everything.
export const PRESETS = {
  finance: [...both('reports'), ...both('ezeeUpload'), ...both('expenses'), ...both('monthEnd'), ...both('invoices'),
    ...both('offlinePayments'), ...both('portfolio'), ...both('bulkUpload'), ...both('offlineInquiries')],
  operations: ['portfolio.view', ...both('offlineInquiries'), 'bookingForms.view', 'newOwnerListings.view'],
  it: [],
  hr: ['playbook.edit', 'sops.edit'],
  procurement: ['portfolio.view', ...both('newOwnerListings'), 'procurementForms.view'],
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
