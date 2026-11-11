// Owner Leads and Listing Flow (11 Nov 2026, Phase 1 of the Owner Leads rebuild): everything about a new owner listing
// that is not screen layout. Split out of the old pages/Procurement/NewListings.vue with no change to what a listing does.
// Pages: pages/Procurement/OwnerLeads/LeadsOverview.vue (overview) and ListingFlow.vue (one listing, stage by stage).
//
// Firestore:
//   newOwnerListings/{NL-0001}            the unit, owner name, each stage, history, the linked TMS task and its send state
//   newOwnerListings/{id}/private/main    owner phone and email
//   counters/newOwnerListings             the next NL number (taken in the create transaction)
// Work starts as a Procurement task in the task system (TMS): "From task system" lists the ones with no listing.
// Every save sends one message to the linked task (a note of what changed, the checklist as its subtasks, completed when
// Live). If the TMS can't be reached the save still happens here and the listing shows "Not sent" with Send now.
//
// Stages are keyed by name (agreement, services, renovation, furniture, payment, marketing, live). stagesFor(listing)
// gives the stages a listing shows: Renovation only when "Renovation & interior design" is ticked in Types of service,
// Furniture only when "Short-term rent amenities" is (never for Yearly rent). The stored `stage` number is the position
// of the current stage in the full list of seven (nothing reads it but the audit log; screens work it out from the data).
import { doc, getDoc, writeBatch, updateDoc, runTransaction, arrayUnion, serverTimestamp, deleteField, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { audit, friendlyError } from '@/lib/finance-data.js';
import { link, syncTask, moveOwnerLead } from '@/lib/tms.js';

export const LINK_TYPE = 'newOwnerListing';
export const LIST_LIMIT = 300;
export const FEE_PCT = 20;   // Procurement fee on renovation item costs

// Who may create properties, units and owners in Portfolio (the rules: Directors and Finance, and Operations create-only).
// Procurement may not, so it sees a note instead of the Create buttons.
export const PORTFOLIO_ADDERS = ['director', 'finance', 'operations', 'marketing'];
// Who sees the owner's phone and email on screen: Directors and Procurement (11 Nov 2026; before, also Marketing and
// Operations). The rules still let Marketing and Operations read the private part until Phase 3 tightens them.
export const CONTACT_READERS = ['director', 'procurement'];

// ---- Lead status (Phase 3, 11 Nov 2026). The TMS board "Owner Leads" has one column per status, both ways. ----
// new = a TMS card nobody started in the PMS (no listing yet); the others are on the listing as `status`.
// Older listings say 'inProgress' (= progress) until the Director runs the migration on the Owner Leads page.
export const LEAD_STATUS = {
  new: { label: 'New', pill: 'grey' }, progress: { label: 'In progress', pill: 'blue' }, signed: { label: 'Signed', pill: 'amber' },
  live: { label: 'Live', pill: 'green' }, cancelled: { label: 'Not proceeding', pill: 'red' }
};
export const LEAD_KEYS = ['new', 'progress', 'signed', 'live', 'cancelled'];
export const statusOf = l => (!l.status || l.status === 'inProgress' ? 'progress' : l.status);
// Who changes a lead's status (Not proceeding, signed, moving the card): Directors and Procurement. Marketing may only
// take it to Live (Go Live is theirs). Only Directors reopen a Not proceeding one. The rules say the same.
export const STATUS_MOVERS = ['director', 'procurement'];
// Who reads the Owner Leads board in the TMS (api/pms-task.js there)
export const LEAD_READERS = ['director', 'procurement', 'marketing', 'operations'];
export const UNIT_TYPES = ['Studio', '1 bedroom', '2 bedroom', '3 bedroom', '4+ bedroom'];
// Same list as Tenant Leads (Operations/SalesLeads.vue)
export const SOURCES = ['Walk-in', 'Phone call', 'WhatsApp', 'Referral', 'Agent', 'Other'];

export const STAGES = {
  agreement: { label: 'Service Agreement Signed', short: 'Agreement' },
  services: { label: 'Types of service', short: 'Services' },
  renovation: { label: 'Renovation', short: 'Renovation' },
  furniture: { label: 'Furniture', short: 'Furniture' },
  payment: { label: 'Final quotation & payment', short: 'Payment' },
  marketing: { label: 'Marketing', short: 'Marketing' },
  live: { label: 'Live', short: 'Live' }
};
// The full order (Khairul 6 Nov). The stored stage number is the position here + 1.
export const STAGE_KEYS = ['agreement', 'services', 'renovation', 'furniture', 'payment', 'marketing', 'live'];
export const SECTIONS = STAGE_KEYS;

// ---- Types of service (sheet "One Stop Property Rental Solution", Khairul 6 Nov) ----
export const RENT_TYPES = [
  { key: 'daily', label: 'Daily', hint: 'Short-term stays' },
  { key: 'monthly', label: 'Monthly', hint: 'Month-to-month tenants' },
  { key: 'yearly', label: 'Yearly', hint: 'Yearly tenancy' }
];
export const rentLabel = k => RENT_TYPES.find(r => r.key === k)?.label || 'Not set';
// Service fee, % of the net receivable rental, by rent type. TODO: confirm with the sheet.
export const SERVICE_FEE = { daily: 25, monthly: 20, yearly: 10 };
// stage = the stage the service adds; notFor = rent types it is not offered for (hidden and unticked).
export const SERVICES = [
  { key: 'marketCheck', label: 'Market check', hint: 'Rental price check for the area' },
  { key: 'advertising', label: 'Advertising', hint: 'Listing and promoting the unit' },
  { key: 'contract', label: 'Contract & move-in / move-out', hint: 'Tenancy papers and handover' },
  { key: 'rentalCollection', label: 'Rental collection', hint: 'Collects the rent every month' },
  { key: 'billPayment', label: 'Bill payment', hint: 'Pays the unit\'s bills' },
  { key: 'cleaning', label: 'Cleaning', hint: { daily: 'On every check-out', monthly: 'Once a month; extra cleaning from RM80', yearly: 'On request, from RM80', '': 'Depends on the rent type' } },
  { key: 'renovation', label: 'Renovation & interior design', hint: 'Adds the Renovation stage', stage: 'renovation' },
  { key: 'amenities', label: 'Short-term rent amenities', hint: 'Adds the Furniture stage', stage: 'furniture', notFor: ['yearly'] }
];
// Yearly maintenance package (sheet "Yearly Maintenance Package"). TODO: what each package covers (the sheet and its
// text differ on air-con servicing and Change Battery).
export const PACKAGES = [
  { key: 'none', label: 'No package', price: 0 },
  { key: 'p1', label: 'Package 1', price: 200 },
  { key: 'p2', label: 'Package 2', price: 800 },
  { key: 'p3', label: 'Package 3', price: 3000 }
];
export const packageOf = k => PACKAGES.find(p => p.key === k) || PACKAGES[0];
const allItems = on => Object.fromEntries(SERVICES.map(x => [x.key, on]));
// Is a service in use? (Amenities never for Yearly rent.)
export const serviceOn = (l, key) => !!l.services.items[key] && !(SERVICES.find(x => x.key === key)?.notFor || []).includes(l.services.rentType);
// Something typed in the stage a service adds (unticking it then asks first; the items are kept).
export function stageHasContent(l, key) {
  if (key === 'renovation') { const r = l.renovation; return r.items.some(x => x.custom || x.status !== 'notStarted' || money(x.cost)) || r.links.length > 0 || !!r.internalNotes.trim() || !!r.ownerNotes.trim(); }
  if (key === 'furniture') return FURN.some(f => l.furniture[f.key].length > 0);
  return false;
}

export const RSTATUS = { notStarted: ['Not started', 'grey'], ongoing: ['Ongoing', 'amber'], done: ['Done', 'green'] };
export const RENO_GROUPS = ['General works', 'Kitchen cabinet', 'Cleaning', 'Curtains'];
const RENO_DEFAULT = [
  ['General works', 'Electrical work / general work: pull new cable, add points, fan, light, aircon'], ['General works', 'Painting'],
  ['General works', 'Windows'], ['General works', 'Hacking'],
  ['Kitchen cabinet', 'Custom-made kitchen cabinet'], ['Kitchen cabinet', 'Colour spec'], ['Kitchen cabinet', 'Plumbing work'],
  ['Cleaning', 'Cleaning'], ['Curtains', 'Curtains']
];
export const FURN = [
  { key: 'big', label: 'Big furniture', doneText: 'All big furniture has been fully added in.' },
  { key: 'electrical', label: 'Electrical items', doneText: 'All electrical items have been fully added in.' },
  { key: 'essential', label: 'Essential items', doneText: 'All essential items have been fully added in.' }
];
export const PAY_LINKS = [['quotationUrl', 'Quotation PDF'], ['invoiceUrl', 'Owner invoice'], ['proofUrl', 'Payment proof']];
const MK_DEFAULT = ['Logo & Branding', 'Website', 'IG', 'FB', 'TikTok', 'Google Business', 'Flyer', 'Social media content'];
export const DETAILS = [['property', 'property'], ['unit', 'unit'], ['ownerName', 'owner name'], ['title', 'title'], ['description', 'description'], ['dueDate', 'due date'],
  ['unitType', 'unit type'], ['sizeSqft', 'size'], ['source', 'source'], ['remarks', 'remarks']];

// ---- small helpers ----
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const localIso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
export const nowIso = () => localIso(new Date());
export const isoOf = t => (t?.toDate ? localIso(t.toDate()) : typeof t === 'string' ? t : '');
const num = (prefix, n) => `${prefix}-${String(n).padStart(4, '0')}`;
export const lineId = () => Math.random().toString(36).slice(2, 10);
export const clone = o => JSON.parse(JSON.stringify(o));
export const money = v => Math.round((parseFloat(String(v ?? '').replace(/,/g, '')) || 0) * 100) / 100;
export const rm = v => 'RM ' + money(v).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const httpsOk = u => /^https:\/\/\S+$/.test(String(u || '').trim());
export const emailOk = e => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const stop = msg => Object.assign(new Error(msg), { plain: true });
export const errText = (e, what) => (e.plain ? e.message : friendlyError(e, what));
// TMS due dates are midnight Malaysia time (ISO in UTC): back to the Malaysian calendar date.
export const tmsDate = iso => (iso ? new Date(Date.parse(iso) + 8 * 3600e3).toISOString().slice(0, 10) : '');
export const short = iso => { if (!iso) return ''; const [, m, dd] = iso.slice(0, 10).split('-'); return `${+dd} ${MON[+m - 1]}`; };
export const full = iso => (iso ? `${short(iso)} ${iso.slice(0, 4)}` : '');
export const stamp = iso => (iso ? `${short(iso)} ${iso.slice(0, 4)}, ${iso.slice(11, 16)}` : '');
export const entry = text => ({ at: nowIso(), by: useSession().name, text });

// ---- the listing record ----
export function blank() {
  return {
    agreement: { signed: false, date: '', skipped: false, skipNote: '', signedDuringStage: null },
    // New listings start with every service ticked; untick what the owner doesn't take.
    services: { rentType: '', items: allItems(true), maintenance: 'none', notes: '', legacy: false },
    renovation: { items: RENO_DEFAULT.map(([group, title]) => ({ id: lineId(), group, title, status: 'notStarted', cost: '' })), links: [], internalNotes: '', ownerNotes: '' },
    furniture: { big: [], electrical: [], essential: [] },
    payment: { quotationUrl: '', invoiceUrl: '', proofUrl: '', amount: '', confirmed: false, confirmedByUid: null, confirmedByName: '', confirmedAt: '' },
    marketing: { items: MK_DEFAULT.map(title => ({ title, on: false })), taskId: null, sentAt: '', sentByName: '', notifiedAt: '', notifiedByName: '' },
    live: { live: false, at: '', byName: '', overrideReason: '', opsGroup: false }
  };
}
// Older or partial documents get every field (missing sections from blank()).
export function withDefaults(data) {
  const b = blank(), out = { ...data };
  for (const k of SECTIONS) out[k] = { ...b[k], ...(data[k] || {}) };
  out.furniture = { ...b.furniture, ...(data.furniture || {}) };
  // Listings made before Types of service: renovation and amenities ticked (both stages show, as before), the rest
  // unticked, rent type Not set. legacy = the stage counts as done so they don't jump back to it.
  out.services = data.services
    ? { ...b.services, ...data.services, items: { ...allItems(false), ...(data.services.items || {}) } }
    : { ...b.services, items: { ...allItems(false), renovation: true, amenities: true }, legacy: true };
  for (const [k] of DETAILS) out[k] = data[k] == null ? '' : String(data[k]);
  return out;
}
// A Firestore row (from use-live.js: { id, ...data }) as the screens use it.
export function toRow(data) {
  const l = withDefaults(data);
  return { ...l, id: data.id, history: data.history || [], stage: data.stage || stageNumberOf(l), status: data.status || 'inProgress',
    startedOn: (data.startedOn || isoOf(data.createdAt)).slice(0, 10), updated: isoOf(data.updatedAt) };
}
// The editable part of a listing (details and every stage), compared to find unsaved changes.
export const draftOf = l => clone(Object.fromEntries([...DETAILS.map(x => x[0]), ...SECTIONS].map(k => [k, l[k]])));

// ---- stages ----
export const subDoneOf = (l, k) => l.furniture[k].length > 0 && l.furniture[k].every(x => x.done);
// Furniture groups that have lines; an empty group (e.g. no electrical items for this unit) is not counted.
export const furnUsed = l => FURN.filter(f => l.furniture[f.key].length > 0);
// Marketing checklist: every line ticked (Khairul 27 Oct: no Go Live before it is 100%).
export const mkDoneOf = l => l.marketing.items.length > 0 && l.marketing.items.every(m => m.on);
// The TMS department that holds the listing's task: Procurement, then Marketing once the payment is confirmed, then
// Operations once it is Live.
export const deptOf = l => (l.live.live ? 'operation' : l.payment.confirmed ? 'marketing' : 'procurement');

// The stages this listing shows, in order. All six for now (Phase 2: Renovation / Furniture only when chosen).
export function stagesFor(l) {
  return STAGE_KEYS.filter(k => !(k === 'renovation' && !serviceOn(l, 'renovation')) && !(k === 'furniture' && !serviceOn(l, 'amenities')));
}

// Each stage counts as done when: agreement signed or skipped for now (with a note); every renovation line Done; every
// furniture line ticked in each sub-stage that has lines (empty ones are not needed); payment confirmed; Marketing
// notified and every checklist line ticked (or an older Marketing task sent); Live.
export function stageDoneOf(l, key) {
  if (key === 'agreement') return l.agreement.signed || (l.agreement.skipped && !!l.agreement.skipNote.trim());
  if (key === 'services') return !!l.services.rentType || !!l.services.legacy;
  if (key === 'renovation') return l.renovation.items.length > 0 && l.renovation.items.every(x => x.status === 'done');
  if (key === 'furniture') return furnUsed(l).length > 0 && furnUsed(l).every(f => subDoneOf(l, f.key));
  if (key === 'payment') return l.payment.confirmed;
  if (key === 'marketing') return !!l.marketing.taskId || (!!l.marketing.notifiedAt && mkDoneOf(l));
  return l.live.live;
}
// Started but not finished (yellow dash on the stage bar, Khairul 27 Oct): some work in the stage, not all of it.
export function stagePartOf(l, key) {
  if (stageDoneOf(l, key)) return false;
  if (key === 'agreement') return l.agreement.skipped;   // skipped, the reason not written yet
  if (key === 'services') return l.services.maintenance !== 'none' || !!l.services.notes.trim();
  if (key === 'renovation') return l.renovation.items.some(x => x.status !== 'notStarted');
  if (key === 'furniture') return FURN.some(f => l.furniture[f.key].some(x => x.done));
  if (key === 'payment') return PAY_LINKS.some(([k]) => !!l.payment[k]) || money(l.payment.amount) > 0;
  if (key === 'marketing') return !!l.marketing.notifiedAt || l.marketing.items.some(m => m.on);
  return false;
}
// The stage the listing is at: the first one shown that is not done (Live once live).
export function currentKeyOf(l) {
  if (l.live.live) return 'live';
  return stagesFor(l).find(k => !stageDoneOf(l, k)) || 'live';
}
export const stageNumberOf = l => STAGE_KEYS.indexOf(currentKeyOf(l)) + 1;
// The short line under each stage on the stage bar.
export function stageNote(l, key) {
  if (key === 'agreement') return l.agreement.signed ? 'Signed' : l.agreement.skipped ? 'Skipped for now' : 'Not yet';
  if (key === 'services') return l.services.rentType ? `${rentLabel(l.services.rentType)} rent` : l.services.legacy ? 'Not set (older)' : 'Not set';
  if (key === 'renovation') return `${l.renovation.items.filter(x => x.status === 'done').length}/${l.renovation.items.length} done`;
  if (key === 'furniture') return furnUsed(l).length ? `${furnUsed(l).filter(f => subDoneOf(l, f.key)).length}/${furnUsed(l).length} completed` : 'No items yet';
  if (key === 'payment') return l.payment.confirmed ? 'Confirmed' : 'Waiting';
  if (key === 'marketing') return l.marketing.taskId ? 'Sent' : !l.marketing.notifiedAt ? 'Waiting' : `${l.marketing.items.filter(m => m.on).length}/${l.marketing.items.length} done`;
  return l.live.live ? 'Live' : 'Not yet';
}

// ---- money ----
export const renoCost = l => money(l.renovation.items.reduce((t, x) => t + money(x.cost), 0));
export const renoFee = l => money(renoCost(l) * FEE_PCT / 100);
export const sumLines = lines => money(lines.reduce((t, x) => t + money(x.cost), 0));
export const furnTotal = l => money(FURN.reduce((t, f) => t + sumLines(l.furniture[f.key]), 0));
// Final quotation: only the stages in use (renovation with the procurement fee, furniture) plus the maintenance package.
// Items of a stage that was unticked are kept but left out. [[label, amount]]
export function quoteParts(l) {
  const pkg = packageOf(l.services.maintenance);
  return [
    ...(serviceOn(l, 'renovation') ? [[`Renovation (incl. ${FEE_PCT}% procurement fee)`, money(renoCost(l) + renoFee(l))]] : []),
    ...(serviceOn(l, 'amenities') ? [['Furniture', furnTotal(l)]] : []),
    ...(pkg.price ? [[`Maintenance ${pkg.label} (a year)`, pkg.price]] : [])
  ];
}
export const quoteTotal = l => money(quoteParts(l).reduce((t, [, v]) => t + v, 0));
export const renoGroupsOf = l => [...RENO_GROUPS, ...new Set(l.renovation.items.map(x => x.group).filter(g => !RENO_GROUPS.includes(g)))];

// ---- lists ----
export const placeOf = l => [l.property, l.unit].filter(Boolean).join(' · ') || l.title || 'Property not set';
export const tmsState = l => (!l.tmsTaskId ? ['Not linked', 'grey'] : l.tmsSync?.pending ? ['Not sent', 'amber'] : ['Linked', 'green']);
export const matches = (x, s) => !s || [x.id, x.property, x.unit, x.ownerName, x.title, x.tmsTitle, x.remarks].some(v => String(v || '').toLowerCase().includes(s));

// The task's checklist: the stages, with each renovation line and furniture sub-stage on its own.
export function checklistOf(l) {
  return [
    { title: 'Service agreement signed', done: l.agreement.signed },
    { title: `Types of service${l.services.rentType ? `: ${rentLabel(l.services.rentType)} rent` : ''}`, done: stageDoneOf(l, 'services') },
    ...(serviceOn(l, 'renovation') ? l.renovation.items.filter(x => x.title.trim()).map(x => ({ title: `Renovation: ${x.title.trim()}`, done: x.status === 'done' })) : []),
    ...(serviceOn(l, 'amenities') ? FURN.map(f => ({ title: `Furniture: ${f.label}`, done: subDoneOf(l, f.key) || (!l.furniture[f.key].length && stageDoneOf(l, 'furniture')) })) : []),
    { title: 'Final quotation & payment confirmed', done: l.payment.confirmed },
    { title: 'Marketing notified', done: !!(l.marketing.taskId || l.marketing.notifiedAt) },
    { title: 'Live', done: l.live.live }
  ];
}

// What changed between two versions of a listing, as short lines (history, audit reason and the task note).
export function summarize(a, b, contactChanged) {
  const out = [];
  const det = DETAILS.filter(([k]) => (a[k] || '') !== (b[k] || '')).map(x => x[1]);
  if (det.length) out.push(`Details updated (${det.join(', ')}).`);
  if (contactChanged) out.push('Owner contact details updated.');
  const g0 = a.agreement, g = b.agreement;
  if (g.signed && !g0.signed) out.push(`Service agreement signed${g.date ? ` on ${g.date}` : ''}${g.signedDuringStage ? ` (signed during ${g.signedDuringStage})` : ''}.`);
  else if (g.signed && g.date !== g0.date) out.push(`Agreement date changed to ${g.date}.`);
  if (!g.signed && g0.signed) out.push('Service agreement no longer ticked as signed.');
  if (!g.signed && g.skipped && (!g0.skipped || g.skipNote !== g0.skipNote)) out.push(`Service agreement skipped for now: ${g.skipNote.trim()}`);
  if (!g.signed && !g.skipped && g0.skipped) out.push('Service agreement no longer skipped.');

  const v0 = a.services, v = b.services;
  if (v0.rentType !== v.rentType) out.push(`Rent type: ${rentLabel(v.rentType)}${v.rentType ? ` (service fee ${SERVICE_FEE[v.rentType]}%)` : ''}.`);
  const on = SERVICES.filter(x => serviceOn(b, x.key) && !serviceOn(a, x.key)).map(x => x.label), off = SERVICES.filter(x => !serviceOn(b, x.key) && serviceOn(a, x.key)).map(x => x.label);
  if (on.length) out.push(`Services ticked: ${on.join(', ')}.`);
  if (off.length) out.push(`Services unticked: ${off.join(', ')}.`);
  if (v0.maintenance !== v.maintenance) out.push(`Maintenance: ${packageOf(v.maintenance).label}${packageOf(v.maintenance).price ? ` (${rm(packageOf(v.maintenance).price)} a year)` : ''}.`);
  if (v0.notes !== v.notes) out.push('Types of service notes updated.');

  const byId = list => Object.fromEntries(list.map(x => [x.id, x]));
  const r0 = byId(a.renovation.items);
  for (const x of b.renovation.items) {
    const o = r0[x.id];
    if (!o) { out.push(`Renovation: added ${x.title.trim()}${money(x.cost) ? ' ' + rm(x.cost) : ''}.`); continue; }
    if (o.title !== x.title) out.push(`Renovation: ${o.title} renamed to ${x.title.trim()}.`);
    if (o.status !== x.status) out.push(`Renovation: ${x.title.trim()} ${RSTATUS[x.status][0]}.`);
    if (money(o.cost) !== money(x.cost) || (o.cost === '') !== (x.cost === '')) out.push(`Renovation: ${x.title.trim()} cost ${rm(x.cost)}.`);
  }
  const r1 = byId(b.renovation.items);
  for (const o of a.renovation.items) if (!r1[o.id]) out.push(`Renovation: removed ${o.title}.`);
  const urls0 = a.renovation.links.map(x => x.url), urls1 = b.renovation.links.map(x => x.url);
  for (const x of b.renovation.links) if (!urls0.includes(x.url)) out.push(`Renovation: added link ${x.label}.`);
  for (const x of a.renovation.links) if (!urls1.includes(x.url)) out.push(`Renovation: removed link ${x.label}.`);
  if (a.renovation.internalNotes !== b.renovation.internalNotes) out.push('Renovation internal notes updated.');
  if (a.renovation.ownerNotes !== b.renovation.ownerNotes) out.push('Renovation owner notes updated.');

  for (const f of FURN) {
    const f0 = byId(a.furniture[f.key]), f1 = byId(b.furniture[f.key]);
    for (const x of b.furniture[f.key]) {
      const o = f0[x.id];
      if (!o) { out.push(`${f.label}: added ${x.item.trim()} ${rm(x.cost)}${x.done ? ' (ticked)' : ''}.`); continue; }
      if (o.item !== x.item) out.push(`${f.label}: ${o.item} renamed to ${x.item.trim()}.`);
      if (money(o.cost) !== money(x.cost)) out.push(`${f.label}: ${x.item.trim()} ${rm(x.cost)}.`);
      if (o.done !== x.done) out.push(`${f.label}: ${x.item.trim()} ${x.done ? 'ticked' : 'unticked'}.`);
    }
    for (const o of a.furniture[f.key]) if (!f1[o.id]) out.push(`${f.label}: removed ${o.item}.`);
    if (subDoneOf(b, f.key) && !subDoneOf(a, f.key)) out.push(`${f.label} completed. ${f.doneText}`);
  }

  for (const [k, label] of PAY_LINKS) if ((a.payment[k] || '') !== (b.payment[k] || '')) out.push(`${label} link ${b.payment[k] ? (a.payment[k] ? 'changed' : 'added') : 'removed'}.`);
  if (money(a.payment.amount) !== money(b.payment.amount)) out.push(`Final amount ${rm(b.payment.amount)}.`);
  if (b.payment.confirmed && !a.payment.confirmed) out.push(`Payment confirmed by ${b.payment.confirmedByName}.`);
  if (b.marketing.notifiedAt && !a.marketing.notifiedAt) out.push('Marketing team notified.');

  const mk = x => x.marketing.items.filter(m => m.on).map(m => m.title).join(', ');
  const t0 = a.marketing.items.map(m => m.title), t1 = b.marketing.items.map(m => m.title);
  for (const t of t1) if (!t0.includes(t)) out.push(`Marketing: added ${t}.`);
  for (const t of t0) if (!t1.includes(t)) out.push(`Marketing: removed ${t}.`);
  if (mk(a) !== mk(b)) out.push(`Marketing items: ${mk(b) || 'none'}.`);
  if (b.marketing.taskId && !a.marketing.taskId) out.push(`Sent to Marketing as a task (${b.marketing.items.filter(m => m.on).length} items).`);

  if (b.live.live && !a.live.live) out.push(`Marked as Live${b.live.overrideReason ? ` before Marketing was done: ${b.live.overrideReason}` : ''}.`);
  if (b.live.opsGroup !== a.live.opsGroup) out.push(b.live.opsGroup ? 'Ops WhatsApp group made.' : 'Ops WhatsApp group un-ticked.');

  const s0 = currentKeyOf(a), s1 = currentKeyOf(b);
  if (s0 !== s1) out.push(`Now at stage ${stagesFor(b).indexOf(s1) + 1}: ${STAGES[s1].label}.`);
  return out;
}

// '' when the draft can be saved, else the message to show.
export function validate(d, contact) {
  if (d.agreement.signed && !d.agreement.date) return 'Add the date the service agreement was signed.';
  if (!d.agreement.signed && d.agreement.skipped && !d.agreement.skipNote.trim()) return 'Add a note saying why the agreement is skipped for now.';
  if (d.renovation.items.some(x => !x.title.trim())) return 'Give each new renovation line a name, or remove it.';
  if (FURN.some(f => d.furniture[f.key].some(x => !x.item.trim()))) return 'Give each furniture line an item name, or remove it.';
  if ([...d.renovation.items, ...FURN.flatMap(f => d.furniture[f.key])].some(x => String(x.cost ?? '').trim() && isNaN(Number(String(x.cost).replace(/,/g, ''))))) return 'Costs are numbers in RM, e.g. 2500.';
  for (const [k, label] of PAY_LINKS) if (d.payment[k] && !httpsOk(d.payment[k])) return `The ${label} link must be a Google Drive link starting with https://.`;
  if (!emailOk((contact?.ownerEmail || '').trim())) return 'That owner email doesn\'t look right.';
  return '';
}

// ---- Firestore ----
// The owner's phone and email (private part). Empty when not allowed or not there.
export async function loadContact(id) {
  const p = await getDoc(doc(db, 'newOwnerListings', id, 'private', 'main')).catch(() => null);
  const pd = p?.exists() ? p.data() : {};
  return { ownerPhone: pd.ownerPhone || '', ownerEmail: pd.ownerEmail || '' };
}

// Saves the whole listing (one batch: listing, private part if changed, audit entry). The caller then sends it to the
// linked task with pushListing(). Throws stop('Nothing changed yet.') when there is nothing to save.
// l = the row as loaded, before = its draft, d = the edited draft, c / c0 = owner contact now / as loaded.
export async function saveListing({ l, before, d, c, c0, live = false }) {
  const me = useSession();
  d.renovation.items.forEach(x => { x.title = x.title.trim(); delete x.custom; });
  if (d.agreement.signed && !before.agreement.signed) d.agreement.signedDuringStage = before.agreement.skipped ? STAGES[currentKeyOf(before)].label : null;
  const contact = { ownerPhone: (c?.ownerPhone || '').trim(), ownerEmail: (c?.ownerEmail || '').trim() };
  const contactChanged = !!c && (contact.ownerPhone !== (c0?.ownerPhone || '') || contact.ownerEmail !== (c0?.ownerEmail || ''));
  const lines = summarize(before, d, contactChanged);
  if (!lines.length) throw stop('Nothing changed yet.');
  // Status (Phase 3): never worked out again from the stages (a move in the TMS would be undone). It moves forward
  // only here: agreement Signed (not Skip) -> signed; Mark as Live -> live. Written only when it changes.
  const cur = statusOf(l), mover = STATUS_MOVERS.includes(me.role), stamps = {};
  let status = cur;
  if (mover && cur === 'progress' && d.agreement.signed && !before.agreement.signed) { status = 'signed'; if (!l.signedAt) stamps.signedAt = serverTimestamp(); }
  if (live && cur !== 'live' && cur !== 'cancelled' && (mover || me.role === 'marketing')) { status = 'live'; if (!l.liveAt) stamps.liveAt = serverTimestamp(); }
  if (status !== cur) lines.push(`Status: ${LEAD_STATUS[status].label}.`);
  const stage = stageNumberOf(d), text = lines.join(' ');
  const h = entry(text);
  const prevSync = l.tmsSync || {};
  // Saved as "not sent" first, so a closed tab or lost connection still shows it; cleared once the task has it.
  const tmsSync = l.tmsTaskId ? { linked: prevSync.linked !== false, pending: true, pendingNote: [prevSync.pending ? prevSync.pendingNote : '', lines.join('\n')].filter(Boolean).join('\n'),
    error: prevSync.error || '', at: prevSync.at || '' } : null;
  const ref = doc(db, 'newOwnerListings', l.id);
  const b = writeBatch(db);
  b.update(ref, { ...clone(d), stage, ...(status !== cur ? { status, ...stamps } : {}), tmsSync, updatedAt: serverTimestamp(), updatedByUid: me.user.uid, updatedByName: me.name, history: arrayUnion(h) });
  if (contactChanged) b.set(doc(ref, 'private', 'main'), contact, { merge: true });
  audit(b, me, { action: 'newOwnerListing.update', entity: `newOwnerListings/${l.id}`, reason: text.slice(0, 1000),
    changes: [...(stage !== l.stage ? [{ field: 'stage', old: l.stage, new: stage }] : []), ...(status !== cur ? [{ field: 'status', old: l.status || null, new: status }] : []),
      ...SECTIONS.filter(k => JSON.stringify(before[k]) !== JSON.stringify(d[k])).map(k => ({ field: k, old: null, new: '(changed)' })),
      ...DETAILS.filter(([k]) => (before[k] || '') !== (d[k] || '')).map(([k]) => ({ field: k, old: before[k] || null, new: d[k] || null })),
      ...(contactChanged ? [{ field: 'ownerContact', old: null, new: '(changed)' }] : [])] });
  await b.commit();
  Object.assign(l, clone(d), { stage, tmsSync, updated: h.at }, status !== cur ? { status } : {});
  l.history = [...(l.history || []), h];
  return { contact, h, statusChanged: status !== cur ? status : null };
}

// One message to the linked task: the waiting note, the checklist, and completed when Live. Remembers the result on the
// listing. Resolves { sent, message }.
export async function pushListing(l, { completed } = {}) {
  const s = l.tmsSync || {};
  let next, linked = s.linked !== false, message;
  try {
    if (!linked) { await link(l.tmsTaskId, { type: LINK_TYPE, id: l.id }); linked = true; }
    await syncTask(l.tmsTaskId, { note: s.pendingNote || '', checklist: checklistOf(l), completed: completed ?? (l.live.live ? true : undefined),
      started: stageDoneOf(l, 'agreement'), departmentId: deptOf(l) });
    next = { linked: true, pending: false, pendingNote: '', error: '', at: nowIso() };
    message = `${l.id} saved and sent to the task system.`;
  } catch (e) {
    next = { ...s, linked, pending: true, error: e.message };
    message = `${l.id} saved here. Not sent to task system: ${e.message}`;
  }
  try { await updateDoc(doc(db, 'newOwnerListings', l.id), { tmsSync: next }); l.tmsSync = next; }
  catch (e) { throw stop(friendlyError(e, 'note the task system result')); }
  return { sent: !next.pending, message };
}

// A new listing (NL number from the counter, in one transaction). task = the TMS task it starts from, or null.
export async function createListing(fields, contact, task) {
  const me = useSession();
  const h = entry(task ? `Started from the task system task "${task.title}".` : 'Started the listing.');
  return runTransaction(db, async tx => {
    const cRef = doc(db, 'counters', 'newOwnerListings');
    const cs = await tx.get(cRef);
    const n = cs.exists() ? cs.data().next || 1 : 1, id = num('NL', n), ref = doc(db, 'newOwnerListings', id);
    if ((await tx.get(ref)).exists()) throw stop(`${id} already exists. Ask a Director to check counters/newOwnerListings.`);
    const data = { ...blank(), ...fields, stage: 1, status: 'progress', startedOn: nowIso().slice(0, 10),
      tmsTaskId: task?.id || null, tmsSync: task ? { linked: false, pending: true, pendingNote: '', error: '', at: '' } : null,
      createdByUid: me.user.uid, createdByName: me.name, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), history: [h] };
    tx.set(cRef, { next: n + 1 });
    tx.set(ref, data);
    if (contact.ownerPhone || contact.ownerEmail) tx.set(doc(ref, 'private', 'main'), contact);
    audit(tx, me, { action: 'newOwnerListing.create', entity: `newOwnerListings/${id}`, reason: h.text,
      changes: [{ field: 'status', old: null, new: 'progress' }, ...(task ? [{ field: 'tmsTaskId', old: null, new: task.id }] : [])] });
    return id;
  });
}

// Start listing from a TMS task: the listing, then the link back. If the TMS can't be reached, the listing shows
// "Not sent" and Send now links it. Resolves { id, message }.
// t = an Owner Leads card from ownerLeads() ({ taskId, title, ... }); fields = unit type, size, source, remarks.
// The card is linked, then moved to In Progress.
export async function startFromTask(t, fields = {}) {
  const task = { id: t.taskId || t.id, title: t.title };
  const id = await createListing({ title: t.title || '', description: t.description || '', dueDate: tmsDate(t.dueDate), leadCreatedAt: t.createdAt || '', ...fields }, {}, task);
  let tmsSync, message, tmsColumn = null;
  try {
    await link(task.id, { type: LINK_TYPE, id });
    tmsSync = { linked: true, pending: false, pendingNote: '', error: '', at: nowIso() };
    message = `${id} started and linked to the card.`;
    try { tmsColumn = (await moveOwnerLead(task.id, 'progress')).column; message = `${id} started; the card is in ${tmsColumn}.`; }
    catch (e) { tmsSync.pendingStatus = 'progress'; message = `${id} started and linked. The card could not be moved to In Progress yet: ${e.message}`; }
  } catch (e) { tmsSync = { linked: false, pending: true, pendingNote: '', error: e.message, at: '', pendingStatus: 'progress' }; message = `${id} started. Not linked in the task system yet: ${e.message}`; }
  await updateDoc(doc(db, 'newOwnerListings', id), { tmsSync, ...(tmsColumn ? { tmsColumn } : {}) }).catch(() => {});
  return { id, message };
}

export const listingLink = id => `/Procurement/listing-flow/${id}`;

// Same content, whatever the key order (Firestore can hand back map keys in another order than the screen made them).
const sorted = v => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v);
export const sameData = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

// The stage a listing is at, as "3 · Renovation" (its position among the stages it shows).
export const stageText = l => { const k = currentKeyOf(l); return `${stagesFor(l).indexOf(k) + 1} · ${STAGES[k].label}`; };
// At Live: the service fee to offer as the unit's fee in Portfolio (prefill only). null when the rent type isn't set.
export const serviceFeeOf = l => (l.services.rentType ? { rentType: l.services.rentType, label: rentLabel(l.services.rentType), pct: SERVICE_FEE[l.services.rentType] } : null);

// ===================== Phase 3: status, the TMS card, aging, migration =====================
export const msOf = t => (!t ? 0 : t.toMillis ? t.toMillis() : t.seconds ? t.seconds * 1000 : typeof t === 'string' ? Date.parse(t) || 0 : t instanceof Date ? t.getTime() : 0);
const days = (a, b) => Math.max(0, Math.floor((b - a) / 864e5));

// Aging: days from the lead's start to signed, then again from signed to live. "8 d", "12 d since signed",
// "Live in 24 d", "Stopped at 9 d". days = the number, for sorting.
export function agingOf(l, now = Date.now()) {
  const st = statusOf(l), start = msOf(l.leadCreatedAt) || msOf(l.createdAt), signed = msOf(l.signedAt);
  if (st === 'live') { const n = days(signed || start, msOf(l.liveAt) || now); return { days: n, text: `Live in ${n} d` }; }
  if (st === 'signed') { const n = days(signed || start, now); return { days: n, text: `${n} d since signed` }; }
  if (st === 'cancelled') { const n = days(l.prevStatus === 'signed' && signed ? signed : start, msOf(l.cancelledAt) || now); return { days: n, text: `Stopped at ${n} d` }; }
  const n = days(start, now); return { days: n, text: `${n} d` };
}
export const leadAging = (lead, now = Date.now()) => { const n = days(msOf(lead.createdAt), now); return { days: n, text: `${n} d` }; };

const listingRef = id => doc(db, 'newOwnerListings', id);
// Moves the listing's card on the Owner Leads board to its status. A card on another board (older listings started from a
// Procurement task) is left alone. When the TMS can't be reached, tmsSync.pendingStatus remembers it and the next
// poll or Send now tries again. Resolves { moved, message }.
export async function moveCard(l, status) {
  if (!l.tmsTaskId) return { moved: false, message: '' };
  const sync = { ...(l.tmsSync || {}) };
  try {
    const r = await moveOwnerLead(l.tmsTaskId, status);
    delete sync.pendingStatus;
    await updateDoc(listingRef(l.id), { tmsColumn: r.column, tmsSync: l.tmsSync ? sync : null });
    return { moved: true, message: ` The card is in ${r.column}.` };
  } catch (e) {
    if (/is not on the/i.test(e.message)) return { moved: false, message: '' };   // not an Owner Leads card
    sync.pendingStatus = status;
    await updateDoc(listingRef(l.id), { tmsSync: sync }).catch(() => {});
    return { moved: false, message: ` The card could not be moved yet (${e.message}); it is tried again by itself.` };
  }
}

// Not proceeding (reason required) and Reopen (Directors). Written straight away (not part of the Save bar), then the card moves.
export async function setNotProceeding(l, reason) {
  const me = useSession(), from = statusOf(l);
  if (!reason.trim()) throw stop('Write why the owner is not proceeding.');
  const h = entry(`Not proceeding: ${reason.trim()}`);
  const b = writeBatch(db);
  b.update(listingRef(l.id), { status: 'cancelled', prevStatus: from, cancelledAt: serverTimestamp(), cancelledBy: me.name, cancelledByUid: me.user.uid,
    cancelReason: reason.trim().slice(0, 500), updatedAt: serverTimestamp(), updatedByUid: me.user.uid, updatedByName: me.name, history: arrayUnion(h) });
  audit(b, me, { action: 'newOwnerListing.cancel', entity: `newOwnerListings/${l.id}`, reason: reason.trim().slice(0, 1000), changes: [{ field: 'status', old: l.status || null, new: 'cancelled' }] });
  await b.commit();
  return moveCard({ ...l, status: 'cancelled' }, 'cancelled');
}
export async function reopenListing(l) {
  const me = useSession(), to = ['progress', 'signed', 'live'].includes(l.prevStatus) ? l.prevStatus : 'progress';
  const h = entry(`Reopened by a Director: ${LEAD_STATUS[to].label} again.`);
  const b = writeBatch(db);
  b.update(listingRef(l.id), { status: to, prevStatus: deleteField(), cancelledAt: deleteField(), cancelledBy: deleteField(), cancelledByUid: deleteField(), cancelReason: deleteField(),
    updatedAt: serverTimestamp(), updatedByUid: me.user.uid, updatedByName: me.name, history: arrayUnion(h) });
  audit(b, me, { action: 'newOwnerListing.reopen', entity: `newOwnerListings/${l.id}`, reason: h.text, changes: [{ field: 'status', old: 'cancelled', new: to }] });
  await b.commit();
  return moveCard({ ...l, status: to }, to);
}

// ----- TMS -> PMS, as a backup to the TMS writing the listing itself (same rules as leadChanges in the TMS repo,
// api/_lib/ownerLeadStatus.js). A card's move counts only when its column differs from the last one seen (tmsColumn),
// so a card that simply hasn't caught up with a PMS change (pendingStatus) is moved again instead of undoing it.
const RANK = { progress: 0, signed: 1, live: 2 };
export function leadChanges(cur, want, column, me) {
  const from = statusOf(cur), changes = { tmsColumn: column };
  if (!want || want === from) return { changes, line: null };
  if (want === 'new') throw stop(`${cur.id}: its card is in New in the task system, but the listing has started. Move the card back.`);
  if (from === 'cancelled' && !me.isDirector) throw stop(`${cur.id} is Not proceeding; only a Director can reopen it.`);
  changes.status = want;
  if (want === 'cancelled') Object.assign(changes, { prevStatus: from, cancelledAt: serverTimestamp(), cancelledBy: me.name, cancelledByUid: me.uid, cancelReason: `Moved to ${column} in the task system` });
  else {
    if (from === 'cancelled') Object.assign(changes, { prevStatus: deleteField(), cancelledAt: deleteField(), cancelledBy: deleteField(), cancelledByUid: deleteField(), cancelReason: deleteField() });
    if (RANK[want] >= 1 && !cur.signedAt) changes.signedAt = serverTimestamp();
    if (RANK[want] >= 2 && !cur.liveAt) changes.liveAt = serverTimestamp();
    if (RANK[want] < 1 && cur.signedAt) changes.signedAt = deleteField();
    if (RANK[want] < 2 && cur.liveAt) changes.liveAt = deleteField();
  }
  return { changes, line: `The task system card is in ${column}, so the listing is ${LEAD_STATUS[want].label} (the task system wins).` };
}
// After each poll of ownerLeads() (Directors and Procurement only). listings = rows (toRow). Resolves [messages].
export async function reconcile(leads, listings) {
  const me = useSession();
  if (!STATUS_MOVERS.includes(me.role)) return [];
  const byId = new Map(listings.map(l => [l.id, l])), out = [];
  for (const lead of leads) {
    const l = lead.pmsLink?.type === LINK_TYPE ? byId.get(lead.pmsLink.id) : null;
    if (!l || !lead.status || l.tmsTaskId !== lead.taskId) continue;
    try {
      const pending = l.tmsSync?.pendingStatus;
      if (pending) {   // the PMS changed first: move the card again
        if (lead.status !== pending) { const r = await moveCard(l, pending); if (r.message) out.push(`${l.id}:${r.message}`); }
        else await moveCard(l, pending);
        continue;
      }
      if (lead.column === l.tmsColumn) continue;
      const { changes, line } = leadChanges(l, lead.status, lead.column, { name: me.name, uid: me.user.uid, isDirector: me.role === 'director' });
      const b = writeBatch(db);
      if (line) {
        const h = entry(line);
        b.update(listingRef(l.id), { ...changes, updatedAt: serverTimestamp(), updatedByUid: me.user.uid, updatedByName: me.name, history: arrayUnion(h) });
        audit(b, me, { action: 'newOwnerListing.tmsSync', entity: `newOwnerListings/${l.id}`, reason: line, changes: [{ field: 'status', old: l.status || null, new: changes.status }] });
        out.push(`${l.id}: ${line}`);
      } else b.update(listingRef(l.id), changes);
      await b.commit();
    } catch (e) { out.push(`${l.id}: ${errText(e, 'follow the task system card')}`); }
  }
  return out;
}

// ----- Migration (Director, once): older listings get the new statuses. agreement signed -> signed, live -> live,
// else in progress; signedAt / liveAt from the history. Preview first.
const tsOf = iso => { const t = Date.parse(iso || ''); return t ? Timestamp.fromMillis(t) : null; };
const histAt = (l, re) => (l.history || []).find(h => re.test(h.text || ''))?.at || '';
export function migrationPlan(listings) {
  return listings.map(l => {
    const raw = l.status || '';
    if (['progress', 'signed', 'cancelled'].includes(raw) || (raw === 'live' && l.liveAt && l.signedAt)) return null;
    const to = raw === 'live' || l.live.live ? 'live' : l.agreement.signed ? 'signed' : 'progress';
    const signedIso = to !== 'progress' && !l.signedAt ? histAt(l, /^Service agreement signed/) || (l.agreement.date ? `${l.agreement.date}T09:00:00` : '') : '';
    const liveIso = to === 'live' && !l.liveAt ? l.live.at || histAt(l, /^Marked as Live/) : '';
    if (to === raw && !signedIso && !liveIso) return null;
    return { id: l.id, place: placeOf(l), from: raw || '(none)', to, signedIso, liveIso, tmsTaskId: l.tmsTaskId || null, l };
  }).filter(Boolean);
}
export async function runMigration(plan, boardTaskIds = new Set()) {
  const me = useSession();
  for (let i = 0; i < plan.length; i += 200) {
    const b = writeBatch(db);
    for (const p of plan.slice(i, i + 200)) {
      const text = `Status set to ${LEAD_STATUS[p.to].label} by the Owner Leads migration.`;
      b.update(listingRef(p.id), { status: p.to, ...(p.signedIso && tsOf(p.signedIso) ? { signedAt: tsOf(p.signedIso) } : {}), ...(p.liveIso && tsOf(p.liveIso) ? { liveAt: tsOf(p.liveIso) } : {}),
        updatedAt: serverTimestamp(), updatedByUid: me.user.uid, updatedByName: me.name, history: arrayUnion(entry(text)) });
      audit(b, me, { action: 'newOwnerListing.migrate', entity: `newOwnerListings/${p.id}`, reason: text, changes: [{ field: 'status', old: p.from, new: p.to }] });
    }
    await b.commit();
  }
  // Cards on the Owner Leads board follow, so the task system doesn't move them back.
  const notes = [];
  for (const p of plan) if (p.tmsTaskId && boardTaskIds.has(p.tmsTaskId)) { const r = await moveCard({ ...p.l, status: p.to }, p.to); if (r.message && !r.moved) notes.push(`${p.id}:${r.message}`); }
  return notes;
}

// ----- Owner Leads overview rows: every listing, plus the TMS cards not started yet (New) -----
export function leadRows(listings, leads, now = Date.now()) {
  const byListing = new Map(leads.filter(x => x.pmsLink?.type === LINK_TYPE).map(x => [x.pmsLink.id, x]));
  const rows = listings.map(l => {
    const lead = byListing.get(l.id) || null;
    return { key: l.id, listingId: l.id, subject: lead?.title || l.tmsTitle || l.title || '', property: l.property, unit: l.unit, unitType: l.unitType,
      sizeSqft: l.sizeSqft, ownerName: l.ownerName, source: l.source, date: (lead?.createdAt ? tmsDate(lead.createdAt) : '') || (l.leadCreatedAt ? tmsDate(l.leadCreatedAt) : '') || l.startedOn,
      status: statusOf(l), remarks: l.remarks, aging: agingOf(l, now), lead };
  });
  for (const lead of leads) if (!lead.pmsLink) rows.push({ key: lead.taskId, listingId: null, subject: lead.title, property: '', unit: '', unitType: '', sizeSqft: '', ownerName: '',
    source: '', date: tmsDate(lead.createdAt), status: lead.status === 'cancelled' ? 'cancelled' : 'new', remarks: '', aging: leadAging(lead, now), lead });
  return rows;
}
