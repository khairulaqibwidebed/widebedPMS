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
// editTo = pages that still open with View, but whose sidebar item shows only with Edit (navPerm below).
// Order and groups follow the sidebar (6 Nov 2026): Portfolio, Leads & Agreements, Accounting, then the rest.
export const PAGES = [
  // 16 Nov 2026 (Khairul): "Owners, Properties & Bookings" split into three rows, each with its own access level.
  { key: 'owners',           label: 'Owners',                        group: 'Portfolio',   to: ['/Portfolio/owners'] },
  // 23 Nov 2026 (Khairul): two tabs of the owner form get their own tick (one level each). KEEP IN STEP WITH ownerCredsOk()
  // in firestore.rules (Draft 1.04). Lists saved before this (no SPLIT3_MARK): Owners Full gives both (upgradePerms).
  { key: 'ownerCreds',       label: 'Credentials (IC, date of birth, address, bank)', group: 'Portfolio', to: [], viewOnly: true, sub: true },
  { key: 'ownerPayouts',     label: 'Units & payouts',             group: 'Portfolio',   to: [], viewOnly: true, sub: true },
  { key: 'portfolio',        label: 'Properties, Units and Fees & Rates', group: 'Portfolio', to: ['/Portfolio/properties', '/Portfolio/fees-rates'], editTo: ['/Portfolio/fees-rates'] },
  { key: 'bookings',         label: 'Bookings',                      group: 'Portfolio',   to: ['/Portfolio/bookings'] },
  { key: 'bookingForms',     label: 'Utility Lodgment Form & New booking',                 group: 'Portfolio',   to: ['/Operations/booking-forms'], viewOnly: true },
  { key: 'offlinePayments',  label: 'Offline Payments',              group: 'Portfolio',   to: ['/Finance/offline-payments'] },
  { key: 'bulkUpload',       label: 'Bulk Upload',                   group: 'Portfolio',   to: ['/Portfolio/bulk-upload'] },
  // 20 Nov 2026 (Khairul): end a stay early (Portfolio > Bookings > open a booking > Early termination). No page of its own.
  { key: 'earlyTermination', label: 'Early termination (end a stay early)', group: 'Portfolio', to: [], editOnly: true },
  // 23 Nov 2026 (Khairul): Portfolio > Bookings > gear > Booking settings (invoice header, T&Cs, bank details). Opens with Edit only.
  // KEEP IN STEP WITH config/invoiceDefaults in firestore.rules (Draft 1.01).
  { key: 'bookingSettings',  label: 'Booking settings (invoice, sources, fees)', group: 'Portfolio', to: [], editOnly: true },
  { key: 'newOwnerListings', label: 'Owner Leads',                   group: 'Leads & Agreements', to: ['/Procurement/listing-flow', '/Procurement/owner-leads'] },
  { key: 'offlineInquiries', label: 'Tenant Leads',                  group: 'Leads & Agreements', to: ['/Operations/offline-inquiries'] },
  { key: 'agreementSetup',   label: 'Agreement Setup (forms, templates, formulas)', group: 'Leads & Agreements', to: ['/Agreements/setup'], viewOnly: true },
  { key: 'ezeeUpload',       label: 'Upload eZee Report',            group: 'Accounting',     to: ['/Finance/upload'] },
  { key: 'expenses',         label: 'Expenses & Others',             group: 'Accounting',     to: ['/Finance/expenses'] },
  { key: 'monthEnd',         label: 'Month-End Payout',              group: 'Accounting',     to: ['/Finance/month-end'] },
  { key: 'invoices',         label: 'Invoices & Receipts',           group: 'Accounting',     to: ['/Finance/invoices'] },
  { key: 'reports',          label: 'Reports',                       group: 'Accounting',     to: ['/Reports'] },
  { key: 'playbook',         label: 'Playbook (Onboarding, Business Model)', group: 'Content', to: [], editOnly: true },
  { key: 'sops',             label: 'HR SOP pages',                  group: 'Content',     to: [], editOnly: true },
  // 18 Nov 2026 (Khairul): post, edit and delete What's New updates (was Directors only). No role has it to start.
  // KEEP IN STEP WITH updates/{id} in firestore.rules.
  { key: 'whatsNew',         label: "What's New (post, edit, delete updates)", group: 'Content', to: [], editOnly: true },
  // 20 Nov 2026 (Khairul): Marketing > Agent Database. Base: the list and agent profiles. Full: add, edit and see bank details.
  // KEEP IN STEP WITH agents/{id} in firestore.rules (Draft 0.94).
  { key: 'agents',           label: 'Agent Database',                group: 'Marketing',   to: ['/Marketing/agents'] },
  { key: 'performance',      label: 'Performance Management',        group: 'Performance', to: ['/Performance/quarters'] },
  // 17 Nov 2026: Google Drive Folders (Settings). Base: see the page and the link check. Full: set a state's folder, create
  // unit folders, change a property's units folder. KEEP IN STEP WITH driveFolders in firestore.rules and api/drive.js.
  { key: 'driveFolders',     label: 'Branch Management',             group: 'Company Settings', to: ['/Settings/branches', '/Settings/states'] },   // 23 Nov 2026: was Google Drive Folders (same key)
  // 17 Nov 2026: shown only on the AI Agent role (aiOnly). Everyone else reads these through their role.
  { key: 'aiIssues',         label: 'Issues (tickets and replies)',  group: 'AI Agent only', to: [], viewOnly: true, aiOnly: true },
  { key: 'aiAnnouncements',  label: 'Announcements',                 group: 'AI Agent only', to: [], viewOnly: true, aiOnly: true },
  { key: 'aiContent',        label: 'Playbook and SOP pages',        group: 'AI Agent only', to: [], viewOnly: true, aiOnly: true }
];

// One row per page on Roles and Staff accounts (16 Nov 2026): a dropdown of access levels instead of a tick.
// The saved names stay '<key>.view' (Base) and '<key>.edit' (Full), so the sidebar and security rules read them as before.
// sub: shown indented under the row above (23 Nov 2026: the owner form's Credentials and Units & payouts under Owners)
export const ACCESS_ROWS = PAGES.filter(p => !p.aiOnly).map(p => ({ id: p.key, label: p.label, group: p.group, keys: [p.key], sub: !!p.sub }));
// The AI Agent's rows (17 Nov 2026): every page that has a view level (not the Content edit-only rows), plus the AI-only rows.
// The AI only ever gets None or Base (view).
// Left out for the AI: payments and finance (Khairul 17 Nov 2026: not needed), people's work or personal records, and
// pages that would let it act (forms, uploads). The rules accept only AI_VIEW_PERMS on roles/ai.
const AI_SKIP = ['ownerCreds', 'ownerPayouts', 'agents', 'bookingForms', 'bulkUpload', 'offlineInquiries', 'agreementSetup', 'performance', 'driveFolders',
  'offlinePayments', 'ezeeUpload', 'expenses', 'monthEnd', 'invoices', 'reports'];
const aiPage = p => !p.editOnly && !AI_SKIP.includes(p.key);
export const AI_ROWS = PAGES.filter(aiPage).map(p => ({ id: p.key, label: p.label, group: p.group, keys: [p.key], ai: true }));
export const AI_GROUP_NOTES = {
  Portfolio: 'Owners Base: names, email and phone (never IC, address or bank). Bookings Base: booking details and the tenant\'s name, phone and email (never IC, passcodes or payments).',
  'AI Agent only': 'Read only. Staff list, notifications of other people, salary advances, complaints and attendance stay blocked.'
};

// Access levels. A page may later get its own extra levels (e.g. a Medium level on Owners) through PAGES[].levels.
export const LEVEL_LABEL = { none: 'None', view: 'Base (view)', edit: 'Full (edit)' };
// A page with one level (viewOnly: the booking forms, Agreement Setup): opening it is full use, so it reads "Full (use it)".
export function levelLabel(row, lv) {
  const p = PAGES.find(x => x.key === row.keys[0]);
  return p?.viewOnly && lv === 'view' && !row.ai ? 'Full (use it)' : LEVEL_LABEL[lv];
}
export function levelsOf(row) {
  if (row.ai) return ['none', 'view'];
  const p = PAGES.find(x => x.key === row.keys[0]);
  return p.levels || (p.viewOnly ? ['none', 'view'] : p.editOnly ? ['none', 'edit'] : ['none', 'view', 'edit']);
}
// The level a tick list gives a row: 'edit', 'view' or 'none'.
export function rowLevel(perms, row) {
  const k = row.keys[0], list = perms || [];
  return list.includes(k + '.edit') ? 'edit' : list.includes(k + '.view') ? 'view' : 'none';
}
// The tick list with a row set to a level.
export function setRowLevel(perms, row, level) {
  const k = row.keys[0], p = PAGES.find(x => x.key === k);
  const set = new Set((perms || []).filter(x => x !== k + '.view' && x !== k + '.edit'));
  if (level === 'view' || (level === 'edit' && !p.editOnly)) set.add(k + '.view');
  if (level === 'edit') set.add(k + '.edit');
  return cleanPerms([...set]);
}
export const rowPerms = row => row.keys.flatMap(k => { const p = PAGES.find(x => x.key === k); return p.viewOnly ? [k + '.view'] : p.editOnly ? [k + '.edit'] : [k + '.view', k + '.edit']; });

// One line under some groups in the access table, so it's clear what a level really gives.
export const GROUP_NOTES = {
  Accounting: 'Any Accounting page lets them read the finance data. Any Accounting Full lets them change it.',
  Portfolio: 'Owners Base: names and contact only. Owners Full: can add and edit owners. Owners · Credentials: see (and with Full, change) IC, date of birth, address and bank details. Owners · Units & payouts: the owner\'s units, carried forward and payout history. Bookings Base: stay dates, deposit and payments; Full: can change them and see guest details. Offline Payments Full also lets them change the finance data. Early termination: end a booking early (move-out date, reason, the notice from the tenant) and record the deposit refund; they also need Bookings to open the booking. Only Directors can undo it. Booking settings: the gear on Bookings (invoice header, the default T&Cs and bank details).',
  Content: 'Everyone can read these. Full lets them change the text (What\'s New: post, edit and delete updates).',
  'Leads & Agreements': 'Agreements and Renewals show for everyone with this group (not HR or IT). Agreement Setup lets them change forms, formulas, templates and where fields print.',
  'Company Settings': 'Branch Management Base: see the branches, their properties, links and staff, and each state\'s Drive folder. Full: add and edit branches, set a state\'s folder, create unit folders and change a property\'s units folder.',
  Marketing: 'Agent Database Base: the list of agents and their contact details. Full: add and edit agents and see their bank account number.',
  Performance: 'Quarterly performance management (quarters, COH, KPI, TMS administration). Everyone can still see their own results without this access.'
};

const both = key => [key + '.view', key + '.edit'];

// Saved in every tick list made since the Portfolio split (16 Nov 2026). A list without it is older: its Portfolio
// ticks are read as Owners and Bookings too (upgradePerms). firestore.rules reads it the same way (can()).
export const SPLIT_MARK = 'split.v2';
// 23 Nov 2026: saved in every tick list made since the owner Credentials / Units & payouts ticks. A list without it is older:
// Owners Full (or Bulk Upload Full) there also gives both ticks. firestore.rules reads it the same way (ownerCredsOk()).
export const SPLIT3_MARK = 'split.v3';
const MARKS = [SPLIT_MARK, SPLIT3_MARK];

// AI Agent (16 Nov 2026, Khairul): a login for an AI agent (Grok). Read-only and locked: no page ticks, can't open the
// PMS screens, and the security rules let it read only what they list for it (properties). Not a BUILTIN_ROLES role, so it
// never gets announcements, tickets or role-wide notifications.
export const AI_ROLE = 'ai';

// What each role gets before any ticks are changed (today's sidebar for that role).
// Directors are not listed: they can do everything. KEEP IN STEP WITH presetFor() in firestore.rules.
export const PRESETS = {
  finance: [...both('reports'), ...both('ezeeUpload'), ...both('expenses'), ...both('monthEnd'), ...both('invoices'),
    ...both('offlinePayments'), ...both('owners'), ...both('portfolio'), ...both('bookings'), ...both('bulkUpload'), ...both('offlineInquiries'), SPLIT_MARK],
  // 13 Nov 2026: Operations work owner listings too (Owner Leads Edit; Operations Setup is theirs)
  // 23 Nov 2026: Booking settings (invoice, T&Cs)
  operations: ['owners.view', 'portfolio.view', ...both('bookings'), ...both('offlineInquiries'), 'bookingForms.view', ...both('newOwnerListings'), 'offlinePayments.view', ...both('driveFolders'), 'bookingSettings.edit', SPLIT_MARK],
  it: [SPLIT_MARK],
  hr: ['playbook.edit', 'sops.edit', SPLIT_MARK],
  procurement: ['owners.view', 'portfolio.view', 'bookings.view', ...both('newOwnerListings'), SPLIT_MARK],
  marketing: ['owners.view', 'portfolio.view', 'bookings.view', ...both('newOwnerListings'), ...both('agents'), SPLIT_MARK],   // agents: 20 Nov 2026
  // Housekeeping (17 Nov 2026): the always-open pages only to start; HR or the Director add pages per person or on Roles.
  housekeeping: [SPLIT_MARK],
  // AI Agent: Properties Base to start; the Director changes it on Roles (Base only). KEEP IN STEP WITH aiViewPerms() in the rules.
  ai: ['portfolio.view', SPLIT_MARK]
};

const ALL_PERMS = new Set([...PAGES.flatMap(p => p.viewOnly ? [p.key + '.view'] : p.editOnly ? [p.key + '.edit'] : both(p.key)), ...MARKS]);

// An older tick list (no SPLIT_MARK): Portfolio View/Edit also gives Owners and Bookings View/Edit, and Tenant Leads
// (which used to edit offline bookings) gives Bookings Full. Same reading as legacyHas() in firestore.rules.
export function upgradePerms(list) {
  const l = list || [];
  let out = [...l];
  if (!l.includes(SPLIT_MARK)) {
    out.push(SPLIT_MARK);
    if (l.includes('portfolio.view')) out.push('owners.view', 'bookings.view');
    if (l.includes('portfolio.edit')) out.push('owners.edit', 'bookings.edit');
    if (l.includes('offlineInquiries.view')) out.push('bookings.view', 'bookings.edit');
  }
  if (!out.includes(SPLIT3_MARK)) {   // 23 Nov 2026: before the owner tab ticks, Owners Full saw both tabs
    if (out.includes('owners.edit') || out.includes('bulkUpload.edit')) out.push('ownerCreds.view', 'ownerPayouts.view');
    out.push(SPLIT3_MARK);
  }
  return out;
}

// The AI Agent's list: view levels only (never edit), whatever is saved.
export const cleanAiPerms = list => cleanPerms(list).filter(p => AI_VIEW_PERMS.includes(p));
// Every name the AI Agent may hold (the rules accept only these on roles/ai).
export const AI_VIEW_PERMS = [...PAGES.filter(aiPage).map(p => p.key + '.view'), SPLIT_MARK];

// A person's ticks: their saved list, or their role's preset. The AI Agent: its role's view levels only.
export function permsOf(me) {
  if (!me || !me.role) return [];
  if (me.role === AI_ROLE) return cleanAiPerms(PRESETS[AI_ROLE] || []);
  return upgradePerms(Array.isArray(me.perms) ? me.perms : (PRESETS[me.role] || []));
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

// The tick a sidebar item needs: '<key>.edit' for a page in its editTo list, else '<key>.view'. null = not tickable.
// e.g. Listing Flow opens with Owner Leads View (a notification link for Operations) but shows in the sidebar only with Edit.
export function navPerm(path) {
  const page = PAGES.find(p => p.to.includes(path));
  return page ? page.key + ((page.editTo || []).includes(path) ? '.edit' : '.view') : null;
}

// Can this person open a route? Tickable pages need their View tick; every other page follows the role list.
export function canOpen(meta, me, allRoles = []) {
  if (!me || !me.role) return false;
  if (meta.need) return can(me, meta.need);   // 23 Nov 2026: one exact tick, e.g. 'bookingSettings.edit' (an Edit-only tick)
  if (meta.perm) return can(me, meta.perm + '.view');
  return (meta.roles || allRoles).includes(me.role);
}

// Tidy a tick list: older lists upgraded, known keys only, Edit adds View, fixed order, no duplicates, SPLIT_MARK kept.
export function cleanPerms(list) {
  const set = new Set(upgradePerms(list).filter(p => ALL_PERMS.has(p)));
  for (const p of PAGES) if (!p.editOnly && set.has(p.key + '.edit')) set.add(p.key + '.view');
  return [...ALL_PERMS].filter(p => set.has(p));
}

export const samePerms = (a, b) => cleanPerms(a).join() === cleanPerms(b).join();
// How many pages a list opens (Roles page "Pages ticked").
export const pageCount = list => new Set(cleanPerms(list).filter(p => !MARKS.includes(p)).map(p => p.split('.')[0])).size;

// "Expenses & Others (Full)" — used in the audit log text. '' for SPLIT_MARK.
export function permLabel(perm) {
  if (MARKS.includes(perm)) return '';
  const [key, level] = perm.split('.');
  const page = PAGES.find(p => p.key === key);
  return (page ? (page.sub ? 'Owners · ' : '') + page.label : key) + (level === 'edit' || page?.viewOnly ? ' (Full)' : ' (Base)');
}
