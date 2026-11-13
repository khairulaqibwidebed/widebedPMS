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
// Stages are keyed by name (agreement, services, renovation, furniture, payment, setup, marketing, live). stagesFor(listing)
// gives the stages a listing shows: Renovation only when Renovation is ticked in Types of service, Furniture & Amenities
// when Renovation or "Purchase Short Term Amenities" is (never for Long-term). The stored `stage` number is the position
// of the current stage in the full list (nothing reads it but the audit log; screens work it out from the data).
//
// 13 Nov 2026 (Khairul): Furniture renamed Furniture & Amenities; Types of service is a table (Service | Amount | Select,
// RM amounts, a discount line); the rental type is an arrangement from Portfolio > Fees & Rates; new stage Operations Setup
// (after Payment, before Marketing, done by Operations); the Agreement stage holds the property and owners, and marking it
// Signed creates the property, owner and unit in Portfolio (createInPortfolio). Operations work listings like Procurement.
import { doc, getDoc, writeBatch, updateDoc, runTransaction, arrayUnion, serverTimestamp, deleteField, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { audit, friendlyError } from '@/lib/finance-data.js';
import { link, syncTask, moveOwnerLead, commentOwnerLead, deleteOwnerLead } from '@/lib/tms.js';
import { loadSharedVersions, sharedList } from '@/lib/shared-rates.js';
import { DEFAULT_ARRANGEMENTS, feeType } from '@/lib/fee-types.js';
import { createProperty, saveOwner, saveUnit, freshOwnerCode, forgetProperties, forgetUnits } from '@/lib/portfolio-data.js';
import { newPropertyId, clashIn, stateOf } from '@/lib/states.js';
import { unitIdOf } from '@/lib/engine.js';

export const LINK_TYPE = 'newOwnerListing';
export const LIST_LIMIT = 300;
export const FEE_PCT = 20;   // Procurement fee on renovation item costs

// Who may create properties, units and owners in Portfolio (the rules: Directors and Finance, and Operations, Marketing and,
// from rules Draft 0.66, Procurement create-only: no terms or bank details).
export const PORTFOLIO_ADDERS = ['director', 'finance', 'operations', 'marketing', 'procurement'];
// Who sees and edits the listing's private part (owner phone, email, IC, joint owners, Wifi password): Directors,
// Procurement and (13 Nov 2026, rules Draft 0.66) Operations.
export const CONTACT_READERS = ['director', 'procurement', 'operations'];

// ---- Lead status (Phase 3, 11 Nov 2026). The TMS board "Owner Leads" has one column per status, both ways. ----
// new = a TMS card nobody started in the PMS (no listing yet); the others are on the listing as `status`.
// Older listings say 'inProgress' (= progress) until the Director runs the migration on the Owner Leads page.
export const LEAD_STATUS = {
  new: { label: 'New', pill: 'grey' }, progress: { label: 'In progress', pill: 'blue' }, signed: { label: 'Signed', pill: 'amber' },
  live: { label: 'Live', pill: 'green' }, cancelled: { label: 'Not proceeding', pill: 'red' }
};
export const LEAD_KEYS = ['new', 'progress', 'signed', 'live', 'cancelled'];
export const statusOf = l => (!l.status || l.status === 'inProgress' ? 'progress' : l.status);
// Who changes a lead's status (Not proceeding, signed, moving the card): Directors, Procurement and (13 Nov 2026)
// Operations. Marketing may only take it to Live (Go Live is theirs). Only Directors reopen a Not proceeding one.
// The rules say the same (listingMover, Draft 0.66).
export const STATUS_MOVERS = ['director', 'procurement', 'operations'];
// Who reads the Owner Leads board in the TMS (api/pms-task.js there)
export const LEAD_READERS = ['director', 'procurement', 'marketing', 'operations'];
export const UNIT_TYPES = ['Studio', '1 bedroom', '2 bedroom', '3 bedroom', '4+ bedroom'];
// Same list as Tenant Leads (Operations/SalesLeads.vue)
export const SOURCES = ['Walk-in', 'Phone call', 'WhatsApp', 'Referral', 'Agent', 'Other'];

export const STAGES = {
  agreement: { label: 'Service Agreement Signed', short: 'Agreement' },
  services: { label: 'Types of service', short: 'Services' },
  renovation: { label: 'Renovation', short: 'Renovation' },
  furniture: { label: 'Furniture & Amenities', short: 'Furniture & Amenities' },
  payment: { label: 'Final quotation & payment', short: 'Payment' },
  setup: { label: 'Operations Setup', short: 'Ops Setup' },
  marketing: { label: 'Marketing', short: 'Marketing' },
  live: { label: 'Live', short: 'Live' }
};
// The full order (Khairul 6 Nov; Operations Setup added 13 Nov). The stored stage number is the position here + 1.
export const STAGE_KEYS = ['agreement', 'services', 'renovation', 'furniture', 'payment', 'setup', 'marketing', 'live'];
// party = the property and owners (Agreement stage), not a stage of its own
export const SECTIONS = [...STAGE_KEYS, 'party'];

// ---- Rental type (13 Nov 2026): the three groups of Portfolio > Fees & Rates. The keys stay daily / monthly / yearly
// (older listings). An arrangement of that group is picked by name; anyone may type a custom %. ----
export const RENT_TYPES = [
  { key: 'daily', label: 'Short-term', unit: 'daily', section: 'short', hint: 'Daily stays' },
  { key: 'monthly', label: 'Mid-term', unit: 'monthly', section: 'mid', hint: 'Monthly tenants' },
  { key: 'yearly', label: 'Long-term', unit: 'yearly', section: 'long', hint: 'Yearly tenancy' }
];
export const rentLabel = k => { const r = RENT_TYPES.find(x => x.key === k); return r ? `${r.label} (${r.unit})` : 'Not set'; };
// Before 13 Nov a listing had only a rent type and these fixed fees (kept for older listings with no arrangement).
export const SERVICE_FEE = { daily: 25, monthly: 20, yearly: 10 };
// Types of service (Khairul 13 Nov, in this order). Amounts are RM, typed per listing (blank to start).
// stages = the stages the service adds; notFor = rent types it is not offered for (hidden and unticked);
// total = the row shows that stage's total instead of an amount box; pkg = the maintenance package row.
export const SERVICES = [
  { key: 'vacantInspection', label: 'Vacant Position & Defect Inspection' },
  { key: 'keyManagement', label: 'Key Management' },
  { key: 'renovation', label: 'Renovation', hint: 'Adds the Renovation and Furniture & Amenities stages', stages: ['renovation', 'furniture'], total: true },
  { key: 'amenities', label: 'Purchase Short Term Amenities', hint: 'Adds the Furniture & Amenities stage', stages: ['furniture'], notFor: ['yearly'], total: true },
  { key: 'advertising', label: 'Marketing & Advertising' },
  { key: 'contract', label: 'Tenant Filtering & Preparing Tenancy Agreement' },
  { key: 'rentalCollection', label: 'Rental Collection' },
  { key: 'billPayment', label: 'Bill Payment' },
  { key: 'cleaning', label: 'Cleaning', hint: { daily: 'On every check-out', monthly: 'Once a month; extra cleaning from RM80', yearly: 'On request, from RM80', '': '' } },
  { key: 'maintenance', label: 'Maintenance Package', hint: 'Yearly package', pkg: true }
];
// Older listings may have "Market check" ticked: kept in the data, no longer offered.
const OLD_SERVICES = { marketCheck: 'Market check' };
export const serviceLabel = k => SERVICES.find(x => x.key === k)?.label || OLD_SERVICES[k] || k;
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
// Is a stage shown (Khairul 11 Nov): Renovation with Renovation & interior design; Furniture with either service
export const stageOn = (l, stage) => SERVICES.some(x => (x.stages || []).includes(stage) && serviceOn(l, x.key));
export const STAGE_LABEL = { renovation: 'Renovation', furniture: 'Furniture & Amenities' };

// ---- Rental type: the arrangements of Fees & Rates for this month (the shared set; the built-in four until one is
// built or when the rules refuse the read). [{ id, name, type, section, servicePct, utilityPct, sstPct }] ----
const thisMonth = () => nowIso().slice(0, 7);
export async function loadArrangements(month = thisMonth()) {
  const versions = await loadSharedVersions();
  // The newest version in force this month (loadSharedVersions is oldest first)
  const v = versions.filter(x => (x.effectiveFrom || '') <= month).pop() || null;
  const list = v ? sharedList(v) : DEFAULT_ARRANGEMENTS;
  return Object.entries(list).map(([id, a]) => ({ id, name: a.name || id, type: a.type || 'revenue', section: a.section || 'short',
    servicePct: Number(a.servicePct || 0), utilityPct: Number(a.utilityPct || 0), sstPct: Number(a.sstPct || 0) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
}
const pct3 = v => Math.round(v * 100000) / 1000;   // 0.2 -> 20 (3 decimals)
export const isFixedArr = a => feeType(a?.type).id === 'fixed';
// "Revenue share 40% · 20% + 20% = 40%", "Long-term tenant · 10% + SST 8%", "Fixed rent · RM a month"
export function arrangementText(a) {
  if (!a) return '';
  if (isFixedArr(a)) return `${a.name} · fixed RM a month`;
  const s = pct3(a.servicePct), u = pct3(a.utilityPct);
  return `${a.name} · ${u ? `${s}% + ${u}% = ${pct3(a.servicePct + a.utilityPct)}%` : `${s}%`}${a.sstPct ? ` + SST ${pct3(a.sstPct)}%` : ''}`;
}
// The fee the listing quotes: the custom % when typed, else the arrangement's total (service + utility). null = none.
export function feePctOf(l) {
  const sv = l.services, c = String(sv.customPct ?? '').trim();
  if (c !== '' && !isNaN(Number(c))) return Number(c);
  if (sv.arrangement && !isFixedArr(sv.arrangement)) return pct3(sv.arrangement.servicePct + sv.arrangement.utilityPct);
  if (sv.older && !sv.arrangementId && sv.rentType) return SERVICE_FEE[sv.rentType];   // older listing
  return null;
}
// One line for the Summary, Live stage and PDF: "Revenue share 40% · 40%", "Custom 35%", "Fixed rent RM 2,000.00 a month"
export function feeText(l) {
  const sv = l.services, a = sv.arrangement;
  if (!sv.rentType) return 'Not set';
  if (a && isFixedArr(a)) return `${a.name}${money(sv.fixedRent) ? ` ${rm(sv.fixedRent)} a month` : ''}`;
  const p = feePctOf(l), custom = String(sv.customPct ?? '').trim() !== '';
  if (a) return `${a.name} · ${p}%${custom ? ' (custom)' : ''}`;
  if (sv.arrangementId === 'custom') return p != null ? `Custom ${p}%` : 'Custom % not typed';
  return sv.older && p != null ? `Service fee ${p}% (older listing)` : 'Arrangement not picked';
}
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
// Payment type (11 Nov 2026): Full payment, or Deposit + balance. Each part of a deposit payment has its own proof link
// and its own "received" (who, when). payment.confirmed stays the "paid in full" flag (for Deposit + balance it is set
// when the balance is received). Marketing starts once the money is in: Full payment confirmed, or for Deposit + balance
// the deposit received (Khairul 11 Nov). mkReadyOf is that check; stage done, the task moving to Marketing and the
// dashboards read it. Older listings have no type: Full.
export const PAY_TYPES = [
  { key: 'full', label: 'Full payment', hint: 'The owner pays the final amount at once' },
  { key: 'deposit', label: 'Deposit + balance', hint: 'A deposit first, the balance later' }
];
export const payTypeLabel = k => PAY_TYPES.find(t => t.key === k)?.label || 'Full payment';
const PART = () => ({ proofUrl: '', received: false, receivedByUid: null, receivedByName: '', receivedAt: '' });
const MK_DEFAULT = ['Logo & Branding', 'Website', 'IG', 'FB', 'TikTok', 'Google Business', 'Flyer', 'Social media content'];
// Operations Setup (13 Nov 2026): Operations tick each row; rows can be added and removed like Marketing. kind 'wifi' keeps
// the Wifi name in note and the password in the private part (wifiPassword); kind 'link' keeps an https link.
export const SETUP_DEFAULT = [
  { key: 'deepCleaning', title: 'Deep Cleaning' },
  { key: 'wifi', title: 'Wifi', kind: 'wifi' },
  { key: 'houseRules', title: 'House Rules' },
  { key: 'drive', title: 'Owner\'s Google Drive', kind: 'link' },
  { key: 'whatsapp', title: 'Owner\'s WhatsApp Group' }
];
const setupRow = x => ({ key: x.key || lineId(), title: x.title, kind: x.kind || '', on: false, note: '', link: '' });
export const DETAILS = [['property', 'property'], ['unit', 'unit'], ['ownerName', 'owner name'], ['title', 'title'], ['description', 'description'], ['dueDate', 'due date'],
  ['unitType', 'unit type'], ['sizeSqft', 'size'], ['source', 'source'], ['remarks', 'remarks'], ['state', 'state']];
// The listing's private part (newOwnerListings/{id}/private/main): Directors, Procurement and Operations.
// coOwners = joint owners [{ fullName, ic, phone, email }] (the same fields as Portfolio's joint owners).
export const blankContact = () => ({ ownerPhone: '', ownerEmail: '', ownerIc: '', coOwners: [], wifiPassword: '' });

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
    // New listings start with no service ticked (Khairul 11 Nov); tick what the owner takes.
    // arrangementId: an arrangement of Fees & Rates ('custom' = only a typed %); arrangement = a copy of it as picked.
    services: { rentType: '', arrangementId: '', arrangement: null, customPct: '', fixedRent: '', items: allItems(false), amounts: {}, maintenance: 'none',
      discount: '', discountNote: '', notes: '', legacy: false },
    renovation: { items: RENO_DEFAULT.map(([group, title]) => ({ id: lineId(), group, title, status: 'notStarted', cost: '' })), links: [], internalNotes: '', ownerNotes: '' },
    furniture: { big: [], electrical: [], essential: [] },
    payment: { type: 'full', quotationUrl: '', invoiceUrl: '', proofUrl: '', amount: '', confirmed: false, confirmedByUid: null, confirmedByName: '', confirmedAt: '',
      deposit: { amount: '', ...PART() }, balance: PART() },
    setup: { items: SETUP_DEFAULT.map(setupRow), legacy: false, doneAt: '', doneByName: '' },
    marketing: { items: MK_DEFAULT.map(title => ({ title, on: false })), taskId: null, sentAt: '', sentByName: '', notifiedAt: '', notifiedByName: '' },
    live: { live: false, at: '', byName: '', overrideReason: '', opsGroup: false },
    // The property and owners (Agreement stage). propertyId / ownerId = an existing one picked; else new ones are made
    // from the listing's property name + propertyCode + state, and ownerName + the private part, when it is Signed.
    party: { propertyId: '', propertyCode: '', ownerId: '' }
  };
}
const paidData = d => !!d.payment?.confirmed || (d.payment?.type === 'deposit' && !!d.payment?.deposit?.received);
// Older or partial documents get every field (missing sections from blank()).
export function withDefaults(data) {
  const b = blank(), out = { ...data };
  for (const k of SECTIONS) out[k] = { ...b[k], ...(data[k] || {}) };
  out.furniture = { ...b.furniture, ...(data.furniture || {}) };
  const p = data.payment || {};
  out.payment.type = p.type === 'deposit' ? 'deposit' : 'full';
  out.payment.deposit = { ...b.payment.deposit, ...(p.deposit || {}) };
  out.payment.balance = { ...b.payment.balance, ...(p.balance || {}) };
  // Listings made before Types of service: renovation and amenities ticked (both stages show, as before), the rest
  // unticked, rent type Not set. legacy = the stage counts as done so they don't jump back to it.
  out.services = data.services
    ? { ...b.services, ...data.services, items: { ...allItems(false), ...(data.services.items || {}) }, amounts: { ...(data.services.amounts || {}) } }
    : { ...b.services, items: { ...allItems(false), renovation: true, amenities: true }, legacy: true };
  // older = made before the Fees & Rates arrangements (13 Nov 2026): the rent type alone still counts, with its old fee.
  if (data.services && (data.services.older || !('arrangementId' in data.services))) out.services.older = true;
  // Before 13 Nov the maintenance package was a drop-down of its own: it becomes the Maintenance Package row.
  if (data.services && !('maintenance' in (data.services.items || {}))) {
    const pk = packageOf(out.services.maintenance);
    out.services.items.maintenance = pk.key !== 'none';
    if (pk.price && out.services.amounts.maintenance == null) out.services.amounts.maintenance = String(pk.price);
  }
  // Listings already paid, in Marketing or Live before Operations Setup existed: the stage counts as done (legacy).
  if (!data.setup) out.setup = { ...b.setup, legacy: paidData(data) || !!data.marketing?.notifiedAt || !!data.marketing?.taskId || !!data.live?.live };
  out.setup.items = (out.setup.items || []).map(x => ({ ...setupRow(x), ...x }));
  for (const [k] of DETAILS) out[k] = data[k] == null ? '' : String(data[k]);
  out.remarksLog = remarksLogOf(data);
  return out;
}
// Remarks as comments (11 Nov 2026): each comment is { text, byUid, byName, at }, oldest first, shown like the TMS
// comments. remarks keeps the latest one (lists, overview, search). An older listing with only remarks: one entry.
export const remarkEntry = text => { const me = useSession(); return { text: String(text).trim(), byUid: me.user?.uid || null, byName: me.name || '', at: nowIso() }; };
function remarksLogOf(data) {
  if (Array.isArray(data.remarksLog)) return data.remarksLog.map(x => ({ text: String(x?.text || ''), byUid: x?.byUid || null, byName: x?.byName || '', at: x?.at || '' }));
  const old = String(data.remarks || '').trim();
  return old ? [{ text: old, byUid: null, byName: '', at: '' }] : [];
}
// A Firestore row (from use-live.js: { id, ...data }) as the screens use it.
export function toRow(data) {
  const l = withDefaults(data);
  return { ...l, id: data.id, history: data.history || [], stage: data.stage || stageNumberOf(l), status: data.status || 'inProgress',
    startedOn: (data.startedOn || isoOf(data.createdAt)).slice(0, 10), updated: isoOf(data.updatedAt) };
}
// The editable part of a listing (details and every stage), compared to find unsaved changes.
export const draftOf = l => clone(Object.fromEntries([...DETAILS.map(x => x[0]), 'remarksLog', ...SECTIONS].map(k => [k, l[k]])));

// ---- stages ----
export const subDoneOf = (l, k) => l.furniture[k].length > 0 && l.furniture[k].every(x => x.done);
// Furniture groups that have lines; an empty group (e.g. no electrical items for this unit) is not counted.
export const furnUsed = l => FURN.filter(f => l.furniture[f.key].length > 0);
// Marketing checklist: every line ticked (Khairul 27 Oct: no Go Live before it is 100%).
export const mkDoneOf = l => l.marketing.items.length > 0 && l.marketing.items.every(m => m.on);
// Operations Setup: every row ticked (or an older listing past it)
export const setupDoneOf = l => !!l.setup.legacy || (l.setup.items.length > 0 && l.setup.items.every(x => x.on));
// The TMS department that holds the listing's task: Procurement, then Operations once paid (Operations Setup), then
// Marketing once Operations Setup is done (mkReadyOf), then Operations again once it is Live.
export const deptOf = l => (l.live.live ? 'operation' : mkReadyOf(l) ? 'marketing' : paidOf(l) ? 'operation' : 'procurement');

// ---- payment parts ----
export const isDeposit = l => l.payment.type === 'deposit';
// The money is in: paid in full, or the deposit received on a Deposit + balance listing. Operations Setup starts.
export const paidOf = l => !!l.payment.confirmed || (isDeposit(l) && !!l.payment.deposit.received);
// Marketing can start (13 Nov 2026): paid and Operations Setup done
export const mkReadyOf = l => paidOf(l) && setupDoneOf(l);
// Deposit in, balance not yet
export const balanceDueOf = l => isDeposit(l) && !!l.payment.deposit.received && !l.payment.confirmed;
export const depositOf = l => money(l.payment.deposit.amount);
export const balanceOf = l => money(money(l.payment.amount) - depositOf(l));
// The proof links of the payment type in use: [[path, label]] (path 'proofUrl' or 'deposit.proofUrl' / 'balance.proofUrl')
export const proofLinksOf = l => (isDeposit(l) ? [['deposit.proofUrl', 'Deposit proof'], ['balance.proofUrl', 'Balance proof']] : [['proofUrl', 'Payment proof']]);
export const linkAt = (l, path) => path.split('.').reduce((o, k) => o?.[k], l.payment) || '';

// The stages this listing shows, in order. All six for now (Phase 2: Renovation / Furniture only when chosen).
export function stagesFor(l) {
  return STAGE_KEYS.filter(k => !STAGE_LABEL[k] || stageOn(l, k));
}

// Each stage counts as done when: agreement signed or skipped for now (with a note); every renovation line Done; every
// furniture line ticked in each sub-stage that has lines (empty ones are not needed); payment confirmed (or the deposit
// received on a Deposit + balance listing: the balance is still shown as due); Operations Setup every row ticked; Marketing
// notified and every checklist line ticked (or an older Marketing task sent); Live.
// Types of service: the rental type and an arrangement (or a custom %) picked; older listings only needed the rent type.
export function stageDoneOf(l, key) {
  if (key === 'agreement') return l.agreement.signed || (l.agreement.skipped && !!l.agreement.skipNote.trim());
  if (key === 'services') return !!l.services.legacy || (!!l.services.rentType && (!!l.services.older || !!l.services.arrangementId));
  if (key === 'renovation') return l.renovation.items.length > 0 && l.renovation.items.every(x => x.status === 'done');
  if (key === 'furniture') return furnUsed(l).length > 0 && furnUsed(l).every(f => subDoneOf(l, f.key));
  if (key === 'payment') return paidOf(l);
  if (key === 'setup') return setupDoneOf(l);
  if (key === 'marketing') return !!l.marketing.taskId || (!!l.marketing.notifiedAt && mkDoneOf(l));
  return l.live.live;
}
// Started but not finished (yellow dash on the stage bar, Khairul 27 Oct): some work in the stage, not all of it.
export function stagePartOf(l, key) {
  if (stageDoneOf(l, key)) return false;
  if (key === 'agreement') return l.agreement.skipped;   // skipped, the reason not written yet
  if (key === 'services') return !!l.services.rentType || SERVICES.some(x => serviceOn(l, x.key)) || !!l.services.notes.trim();
  if (key === 'renovation') return l.renovation.items.some(x => x.status !== 'notStarted');
  if (key === 'furniture') return FURN.some(f => l.furniture[f.key].some(x => x.done));
  if (key === 'payment') return PAY_LINKS.some(([k]) => !!l.payment[k]) || money(l.payment.amount) > 0 || l.payment.deposit.received || !!l.payment.deposit.proofUrl;
  if (key === 'setup') return l.setup.items.some(x => x.on);
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
  if (key === 'services') return l.services.rentType ? rentLabel(l.services.rentType) : l.services.legacy ? 'Not set (older)' : 'Not set';
  if (key === 'setup') return l.setup.legacy && !l.setup.items.some(x => x.on) ? 'Done before (older)' : `${l.setup.items.filter(x => x.on).length}/${l.setup.items.length} done`;
  if (key === 'renovation') return `${l.renovation.items.filter(x => x.status === 'done').length}/${l.renovation.items.length} done`;
  if (key === 'furniture') return furnUsed(l).length ? `${furnUsed(l).filter(f => subDoneOf(l, f.key)).length}/${furnUsed(l).length} completed` : 'No items yet';
  if (key === 'payment') return l.payment.confirmed ? (isDeposit(l) ? 'Paid in full' : 'Confirmed') : balanceDueOf(l) ? 'Balance due' : 'Waiting';
  if (key === 'marketing') return l.marketing.taskId ? 'Sent' : !l.marketing.notifiedAt ? 'Waiting' : `${l.marketing.items.filter(m => m.on).length}/${l.marketing.items.length} done`;
  return l.live.live ? 'Live' : 'Not yet';
}

// ---- money ----
export const renoCost = l => money(l.renovation.items.reduce((t, x) => t + money(x.cost), 0));
export const renoFee = l => money(renoCost(l) * FEE_PCT / 100);
export const sumLines = lines => money(lines.reduce((t, x) => t + money(x.cost), 0));
export const furnTotal = l => money(FURN.reduce((t, f) => t + sumLines(l.furniture[f.key]), 0));
// ---- Types of service money (13 Nov 2026) ----
// Renovation and Purchase Short Term Amenities rows show their stage's total (not typed, so nothing counts twice):
// Renovation = the Renovation stage (incl. the procurement fee), plus Furniture & Amenities when Amenities is not ticked;
// Amenities = the Furniture & Amenities stage.
export const renoWithFee = l => money(renoCost(l) + renoFee(l));
export function rowAmount(l, key) {
  if (key === 'renovation') return stageOn(l, 'renovation') ? money(renoWithFee(l) + (serviceOn(l, 'amenities') ? 0 : furnTotal(l))) : 0;
  if (key === 'amenities') return serviceOn(l, 'amenities') ? furnTotal(l) : 0;
  return money(l.services.amounts?.[key]);
}
// Typed service rows that are ticked (not the two stage rows)
export const typedRows = l => SERVICES.filter(x => !x.total && serviceOn(l, x.key));
export const servicesSubtotal = l => money(typedRows(l).reduce((t, x) => t + rowAmount(l, x.key), 0));
export const discountOf = l => money(l.services.discount);
export const servicesTotal = l => money(Math.max(0, servicesSubtotal(l) - discountOf(l)));
// Renovation & Furniture: only the stages in use (items of a stage that was unticked are kept but left out)
export const renoFurnTotal = l => money((stageOn(l, 'renovation') ? renoWithFee(l) : 0) + (stageOn(l, 'furniture') ? furnTotal(l) : 0));
// Grand total = Services (after discount) + Renovation & Furniture (Khairul 13 Nov: shown split)
export const quoteTotal = l => money(servicesTotal(l) + renoFurnTotal(l));
// The quotation lines [[label, amount]] (Payment stage and the PDF): each typed service, the discount, renovation, furniture.
export function quoteParts(l) {
  const pkg = packageOf(l.services.maintenance);
  return [
    ...typedRows(l).map(x => [x.pkg ? `Maintenance ${pkg.key !== 'none' ? pkg.label : 'Package'} (a year)` : x.label, rowAmount(l, x.key)]),
    ...(discountOf(l) ? [[`Discount${l.services.discountNote?.trim() ? ` (${l.services.discountNote.trim()})` : ''}`, -discountOf(l)]] : []),
    ...(stageOn(l, 'renovation') ? [[`Renovation (incl. ${FEE_PCT}% procurement fee)`, renoWithFee(l)]] : []),
    ...(stageOn(l, 'furniture') ? [['Furniture & Amenities', furnTotal(l)]] : [])
  ];
}
export const renoGroupsOf = l => [...RENO_GROUPS, ...new Set(l.renovation.items.map(x => x.group).filter(g => !RENO_GROUPS.includes(g)))];

// ---- lists ----
export const placeOf = l => [l.property, l.unit].filter(Boolean).join(' · ') || l.title || 'Property not set';
export const tmsState = l => (!l.tmsTaskId ? ['Not linked', 'grey'] : l.tmsSync?.pending ? ['Not sent', 'amber'] : ['Linked', 'green']);
export const matches = (x, s) => !s || [x.id, x.property, x.unit, x.ownerName, x.title, x.tmsTitle, x.remarks].some(v => String(v || '').toLowerCase().includes(s));

// The task's checklist: the stages, with each renovation line and furniture sub-stage on its own.
export function checklistOf(l) {
  return [
    { title: 'Service agreement signed', done: l.agreement.signed },
    { title: `Types of service${l.services.rentType ? `: ${rentLabel(l.services.rentType)}` : ''}`, done: stageDoneOf(l, 'services') },
    ...(stageOn(l, 'renovation') ? l.renovation.items.filter(x => x.title.trim()).map(x => ({ title: `Renovation: ${x.title.trim()}`, done: x.status === 'done' })) : []),
    ...(stageOn(l, 'furniture') ? FURN.map(f => ({ title: `Furniture & Amenities: ${f.label}`, done: subDoneOf(l, f.key) || (!l.furniture[f.key].length && stageDoneOf(l, 'furniture')) })) : []),
    ...(isDeposit(l) ? [{ title: 'Deposit received', done: l.payment.deposit.received }] : []),
    { title: isDeposit(l) ? 'Balance received (paid in full)' : 'Final quotation & payment confirmed', done: l.payment.confirmed },
    ...(l.setup.legacy && !l.setup.items.some(x => x.on) ? [] : l.setup.items.filter(x => x.title.trim()).map(x => ({ title: `Operations setup: ${x.title.trim()}`, done: !!x.on }))),
    { title: 'Marketing notified', done: !!(l.marketing.taskId || l.marketing.notifiedAt) },
    { title: 'Live', done: l.live.live }
  ];
}

// Comments added in b since a (their text)
const newRemarks = (a, b) => (b.remarksLog || []).slice((a.remarksLog || []).length).map(x => x.text).filter(Boolean);

// What changed between two versions of a listing, as short lines (history, audit reason and the task note).
export function summarize(a, b, contactChanged) {
  const out = [];
  const det = DETAILS.filter(([k]) => k !== 'remarks' && (a[k] || '') !== (b[k] || '')).map(x => x[1]);
  if (det.length) out.push(`Details updated (${det.join(', ')}).`);
  const added = newRemarks(a, b).length;
  if (added) out.push(added > 1 ? `${added} comments added.` : 'Comment added.');
  if (contactChanged) out.push('Private details updated (owner contact, IC, joint owners or Wifi password).');
  const g0 = a.agreement, g = b.agreement;
  if (g.signed && !g0.signed) out.push(`Service agreement signed${g.date ? ` on ${g.date}` : ''}${g.signedDuringStage ? ` (signed during ${g.signedDuringStage})` : ''}.`);
  else if (g.signed && g.date !== g0.date) out.push(`Agreement date changed to ${g.date}.`);
  if (!g.signed && g0.signed) out.push('Service agreement no longer ticked as signed.');
  if (!g.signed && g.skipped && (!g0.skipped || g.skipNote !== g0.skipNote)) out.push(`Service agreement skipped for now: ${g.skipNote.trim()}`);
  if (!g.signed && !g.skipped && g0.skipped) out.push('Service agreement no longer skipped.');

  const v0 = a.services, v = b.services;
  if (v0.rentType !== v.rentType) out.push(`Rental type: ${rentLabel(v.rentType)}.`);
  if ((v0.arrangementId || '') !== (v.arrangementId || '') || String(v0.customPct ?? '') !== String(v.customPct ?? '') || money(v0.fixedRent) !== money(v.fixedRent))
    out.push(`Arrangement: ${feeText(b)}.`);
  const on = SERVICES.filter(x => serviceOn(b, x.key) && !serviceOn(a, x.key)).map(x => x.label), off = SERVICES.filter(x => !serviceOn(b, x.key) && serviceOn(a, x.key)).map(x => x.label);
  if (on.length) out.push(`Services ticked: ${on.join(', ')}.`);
  if (off.length) out.push(`Services unticked: ${off.join(', ')}.`);
  if (v0.maintenance !== v.maintenance) out.push(`Maintenance: ${packageOf(v.maintenance).label}.`);
  const amt0 = v0.amounts || {}, amt1 = v.amounts || {};
  const moved = SERVICES.filter(x => !x.total && money(amt0[x.key]) !== money(amt1[x.key])).map(x => `${x.label} ${rm(amt1[x.key])}`);
  if (moved.length) out.push(`Amounts: ${moved.join(', ')}.`);
  if (money(v0.discount) !== money(v.discount) || (v0.discountNote || '') !== (v.discountNote || '')) out.push(`Discount ${rm(v.discount)}${(v.discountNote || '').trim() ? ` (${v.discountNote.trim()})` : ''}.`);
  if (v0.notes !== v.notes) out.push('Types of service notes updated.');

  // Operations Setup
  const st0 = Object.fromEntries((a.setup?.items || []).map(x => [x.key, x])), st1 = b.setup.items;
  for (const x of st1) {
    const o = st0[x.key];
    if (!o) { out.push(`Operations setup: added ${x.title.trim()}${x.on ? ' (ticked)' : ''}.`); continue; }
    if (o.on !== x.on) out.push(`Operations setup: ${x.title.trim()} ${x.on ? 'ticked' : 'unticked'}.`);
    if ((o.note || '') !== (x.note || '') && x.kind !== 'wifi') out.push(`Operations setup: ${x.title.trim()} note updated.`);
    if ((o.note || '') !== (x.note || '') && x.kind === 'wifi') out.push('Operations setup: Wifi name updated.');
    if ((o.link || '') !== (x.link || '')) out.push(`Operations setup: ${x.title.trim()} link ${x.link ? (o.link ? 'changed' : 'added') : 'removed'}.`);
  }
  const keys1 = new Set(st1.map(x => x.key));
  for (const o of a.setup?.items || []) if (!keys1.has(o.key)) out.push(`Operations setup: removed ${o.title}.`);
  if (setupDoneOf(b) && !setupDoneOf(a) && !b.setup.legacy) out.push('Operations Setup done.');

  // Property and owners (Agreement)
  const pa0 = a.party || {}, pa1 = b.party;
  if ((pa0.propertyId || '') !== (pa1.propertyId || '')) out.push(pa1.propertyId ? `Existing property picked: ${b.property}.` : 'A new property will be made.');
  if ((pa0.propertyCode || '') !== (pa1.propertyCode || '')) out.push(`Property code: ${pa1.propertyCode || '(none)'}.`);
  if ((pa0.ownerId || '') !== (pa1.ownerId || '')) out.push(pa1.ownerId ? `Existing owner picked: ${b.ownerName} (${pa1.ownerId}).` : 'A new owner will be made.');

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
  const p0 = a.payment, p1 = b.payment;
  if ((p0.type || 'full') !== p1.type) out.push(`Payment type: ${payTypeLabel(p1.type)}.`);
  if (isDeposit(b)) {
    if (money(p0.deposit?.amount) !== money(p1.deposit.amount)) out.push(`Deposit ${rm(p1.deposit.amount)} (balance ${rm(balanceOf(b))}).`);
    for (const k of ['deposit', 'balance']) {
      const was = p0[k]?.proofUrl || '', now = p1[k].proofUrl || '', label = k === 'deposit' ? 'Deposit' : 'Balance';
      if (was !== now) out.push(`${label} proof link ${now ? (was ? 'changed' : 'added') : 'removed'}.`);
    }
    if (p1.deposit.received && !p0.deposit?.received) out.push(`Deposit ${rm(p1.deposit.amount)} received, confirmed by ${p1.deposit.receivedByName}.`);
    if (p1.balance.received && !p0.balance?.received) out.push(`Balance ${rm(balanceOf(b))} received, confirmed by ${p1.balance.receivedByName}. Paid in full.`);
  } else if (p1.confirmed && !p0.confirmed) out.push(`Payment confirmed by ${p1.confirmedByName}.`);
  if (b.marketing.notifiedAt && !a.marketing.notifiedAt) out.push('Marketing team notified.');

  const mk = x => x.marketing.items.filter(m => m.on).map(m => m.title).join(', ');
  const t0 = a.marketing.items.map(m => m.title), t1 = b.marketing.items.map(m => m.title);
  for (const t of t1) if (!t0.includes(t)) out.push(`Marketing: added ${t}.`);
  for (const t of t0) if (!t1.includes(t)) out.push(`Marketing: removed ${t}.`);
  if (mk(a) !== mk(b)) out.push(`Marketing items: ${mk(b) || 'none'}.`);
  if (b.marketing.taskId && !a.marketing.taskId) out.push(`Sent to Marketing as a task (${b.marketing.items.filter(m => m.on).length} items).`);

  if (b.live.live && !a.live.live) out.push(`Marked as Live${b.live.overrideReason ? ` before Marketing was done: ${b.live.overrideReason}` : ''}.`);

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
  if (isDeposit(d)) {
    for (const [path, label] of proofLinksOf(d)) if (linkAt(d, path) && !httpsOk(linkAt(d, path))) return `The ${label} link must be a Google Drive link starting with https://.`;
    const dep = String(d.payment.deposit.amount ?? '').trim();
    if (dep && isNaN(Number(dep.replace(/,/g, '')))) return 'The deposit is a number in RM, e.g. 2000.';
    if (dep && money(d.payment.amount) > 0 && depositOf(d) >= money(d.payment.amount)) return 'The deposit must be less than the final amount.';
  }
  if (!emailOk((contact?.ownerEmail || '').trim())) return 'That owner email doesn\'t look right.';
  const sv = d.services, isNum = v => !String(v ?? '').trim() || !isNaN(Number(String(v).replace(/,/g, '')));
  if (SERVICES.some(x => !x.total && !isNum(sv.amounts?.[x.key]))) return 'Service amounts are numbers in RM, e.g. 500.';
  if (!isNum(sv.discount)) return 'The discount is a number in RM, e.g. 100.';
  if (discountOf(d) > servicesSubtotal(d)) return 'The discount can\'t be more than the services total.';
  if (serviceOn(d, 'maintenance') && packageOf(sv.maintenance).key === 'none') return 'Pick the maintenance package, or untick Maintenance Package.';
  const cp = String(sv.customPct ?? '').trim();
  if (cp && (isNaN(Number(cp)) || Number(cp) < 0 || Number(cp) > 100)) return 'The custom % is a number from 0 to 100, e.g. 35.';
  if (sv.arrangementId === 'custom' && !cp) return 'Type the custom %, or pick an arrangement.';
  if (!isNum(sv.fixedRent)) return 'The fixed rent is a number in RM, e.g. 2000.';
  if (d.setup.items.some(x => !x.title.trim())) return 'Give each Operations Setup row a name, or remove it.';
  for (const x of d.setup.items) if (x.link && !httpsOk(x.link)) return `The ${x.title.trim() || 'Operations Setup'} link must start with https://.`;
  for (const co of contact?.coOwners || []) if (co.email && !emailOk(co.email.trim())) return 'One of the joint owners\' emails doesn\'t look right.';
  return '';
}

// ---- Property and owners (Agreement stage, 13 Nov 2026) ----
// What is still missing before the agreement can be marked Signed: [] when ready. Skip for now needs none of it.
// c = the private part (owner IC, phone, email, joint owners).
export function partyMissing(d, c) {
  const out = [], p = d.party;
  if (!p.propertyId) {
    if (!d.property.trim()) out.push('the property name (or pick an existing property)');
    if (!String(p.propertyCode || '').trim()) out.push('the property code');
  }
  if (!d.state) out.push('the state');
  if (!/\d/.test(d.unit)) out.push('the unit code, with its number (e.g. DM 12-03)');
  if (!p.ownerId) {
    if (!d.ownerName.trim()) out.push('the owner\'s full name (or pick an existing owner)');
    if (!String(c?.ownerIc || '').trim()) out.push('the owner\'s IC');
    if (!String(c?.ownerPhone || '').trim()) out.push('the owner\'s phone');
    if ((c?.coOwners || []).some(x => !String(x.fullName || '').trim())) out.push('a full name for every joint owner');
  }
  return out;
}
// The listing's Portfolio records: { propertyId, ownerId, unitId } (some may be missing on older listings)
export const portfolioOf = l => l.portfolio || {};
export const inPortfolioOf = l => { const p = portfolioOf(l); return !!(p.propertyId && p.ownerId && p.unitId); };
const yymm = () => nowIso().slice(0, 7);
const unitInfo = d => ({ type: d.unitType || '', ...(String(d.sizeSqft || '').trim() && !isNaN(Number(d.sizeSqft)) ? { sizeSqft: Number(d.sizeSqft) } : {}) });
// Creates what is missing in Portfolio, in order: the property (unless one was picked), the owner (unless one was picked),
// then the unit linked to the owner. Each id is noted on the listing (portfolio.*) as soon as it is made, so pressing it
// again after a failure carries on where it stopped. properties / owners = the lists the page has (for clashes and codes).
// Uses the same Portfolio functions as the Properties and Owners pages (state, propertyIds, audit lines).
// Resolves the portfolio ids. Needs Portfolio add rights (PORTFOLIO_ADDERS; Procurement from rules Draft 0.66).
export async function createInPortfolio(l, d, c, { properties = [], owners = [] } = {}) {
  const me = useSession(), ref = doc(db, 'newOwnerListings', l.id), pf = { ...portfolioOf(l) };
  const note = async (key, id, text) => {
    pf[key] = id;
    await updateDoc(ref, { [`portfolio.${key}`]: id, updatedAt: serverTimestamp(), updatedByUid: me.user.uid, updatedByName: me.name, history: arrayUnion(entry(text)) });
  };
  const reason = `New owner listing ${l.id}`;
  // 1. Property
  if (!pf.propertyId) {
    if (d.party.propertyId) await note('propertyId', d.party.propertyId, `Linked to property ${d.party.propertyId} in Portfolio.`);
    else {
      const name = d.property.trim(), code = String(d.party.propertyCode || '').trim().toUpperCase();
      const clash = clashIn(properties, { name, code, state: d.state });
      if (clash) throw stop(clash);
      const id = await newPropertyId(name, d.state);
      await createProperty(me, id, { name, code, info: { state: d.state } });
      await forgetProperties();
      await note('propertyId', id, `Created in Portfolio: property ${id}.`);
    }
  }
  // 2. Owner
  if (!pf.ownerId) {
    if (d.party.ownerId) await note('ownerId', d.party.ownerId, `Linked to owner ${d.party.ownerId} in Portfolio.`);
    else {
      const id = await freshOwnerCode(owners);
      const co = (c.coOwners || []).map(x => ({ fullName: String(x.fullName || '').trim(), ic: String(x.ic || '').trim(), email: String(x.email || '').trim(), phone: String(x.phone || '').trim() }))
        .filter(x => x.fullName);
      const priv = { fullName: d.ownerName.trim(), ic: String(c.ownerIc || '').trim(), phone: String(c.ownerPhone || '').trim(), email: String(c.ownerEmail || '').trim(), ...(co.length ? { coOwners: co } : {}) };
      await saveOwner(me, { id, isNew: true, active: true, bankLast4: null, priv, changed: Object.keys(priv), reason, propertyId: pf.propertyId });
      await note('ownerId', id, `Created in Portfolio: owner ${id}.`);
    }
  }
  // 3. Unit (no fee arrangement: Accounting or a Director puts it on the unit)
  if (!pf.unitId) {
    const code = d.unit.trim().replace(/\s+/g, ' '), id = unitIdOf(pf.propertyId, code);
    const there = await getDoc(doc(db, 'units', id)).then(s => s.exists()).catch(() => false);
    if (there) throw stop(`${code} already exists in this property in Portfolio. Check the unit code (or ask a Director to link it).`);
    await saveUnit(me, { id, isNew: true, propertyId: pf.propertyId, code, aliases: [], ownerId: pf.ownerId, info: unitInfo(d), active: true,
      terms: null, termsChanged: false, effectiveFrom: yymm(), reason, changes: [] });
    await forgetUnits(pf.propertyId);
    await note('unitId', id, `Created in Portfolio: unit ${code}.`);
  }
  l.portfolio = pf;
  return pf;
}

// ---- Firestore ----
// The owner's phone and email (private part). Empty when not allowed or not there.
export async function loadContact(id) {
  const p = await getDoc(doc(db, 'newOwnerListings', id, 'private', 'main')).catch(() => null);
  return cleanContact(p?.exists() ? p.data() : {});
}
// The private part as saved: trimmed text, joint owners with a name or any detail.
export function cleanContact(c = {}) {
  const t = v => String(v ?? '').trim();
  return { ownerPhone: t(c.ownerPhone), ownerEmail: t(c.ownerEmail), ownerIc: t(c.ownerIc), wifiPassword: String(c.wifiPassword ?? ''),
    coOwners: (Array.isArray(c.coOwners) ? c.coOwners : []).map(x => ({ fullName: t(x?.fullName), ic: t(x?.ic), phone: t(x?.phone), email: t(x?.email) }))
      .filter(x => x.fullName || x.ic || x.phone || x.email) };
}

// Saves the whole listing (one batch: listing, private part if changed, audit entry). The caller then sends it to the
// linked task with pushListing(). Throws stop('Nothing changed yet.') when there is nothing to save.
// l = the row as loaded, before = its draft, d = the edited draft, c / c0 = owner contact now / as loaded.
export async function saveListing({ l, before, d, c, c0, live = false }) {
  const me = useSession();
  d.renovation.items.forEach(x => { x.title = x.title.trim(); delete x.custom; });
  if (d.agreement.signed && !before.agreement.signed) d.agreement.signedDuringStage = before.agreement.skipped ? STAGES[currentKeyOf(before)].label : null;
  // The private part (phone, email, IC, joint owners, Wifi password): written only when something in it changed
  const contact = cleanContact(c || c0 || {});
  const contactChanged = !!c && JSON.stringify(contact) !== JSON.stringify(cleanContact(c0 || {}));
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
  // New comments (Remarks): only the new text is sent to the card as a comment by pushListing (kept in pendingRemarks
  // until it goes; one not sent yet is kept in front).
  const added = newRemarks(before, d);
  const pendingRemarks = added.length ? [prevSync.pendingRemarks || '', ...added].filter(Boolean).join('\n') : '';
  // Description changed here: the next send replaces the card's description (pendingDescription until it goes)
  const descChanged = (before.description || '').trim() !== (d.description || '').trim();
  const tmsSync = l.tmsTaskId ? { ...prevSync, ...(pendingRemarks ? { pendingRemarks } : {}), ...(descChanged ? { pendingDescription: true } : {}), linked: prevSync.linked !== false, pending: true, pendingNote: [prevSync.pending ? prevSync.pendingNote : '', lines.join('\n')].filter(Boolean).join('\n'),
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
      started: stageDoneOf(l, 'agreement'), departmentId: deptOf(l), ...(s.pendingDescription ? { description: (l.description || '').trim() } : {}) });
    next = { ...(s.pendingStatus ? { pendingStatus: s.pendingStatus } : {}), linked: true, pending: false, pendingNote: '', error: '', at: nowIso() };
    message = `${l.id} saved and sent to the task system.`;
    if (s.pendingRemarks) {
      const r = await sendRemarks(l.tmsTaskId, s.pendingRemarks);
      if (r.error) { next = { ...next, pending: true, pendingRemarks: s.pendingRemarks, error: r.error }; message = `${l.id} saved and sent. The remarks did not reach the card yet: ${r.error}`; }
      else if (r.sent) message = `${l.id} saved and sent to the task system, remarks added as a comment.`;
    }
  } catch (e) {
    next = { ...s, linked, pending: true, error: e.message };
    message = `${l.id} saved here. Not sent to task system: ${e.message}`;
  }
  try { await updateDoc(doc(db, 'newOwnerListings', l.id), { tmsSync: next }); l.tmsSync = next; }
  catch (e) { throw stop(friendlyError(e, 'note the task system result')); }
  return { sent: !next.pending, message };
}

// The listing's Remarks as a comment on its Owner Leads card. A card on another board is left alone (not an error).
// Resolves { sent, error }.
async function sendRemarks(taskId, remarks) {
  try { await commentOwnerLead(taskId, `Remarks (from the PMS): ${remarks}`); return { sent: true, error: '' }; }
  catch (e) { return /is not on the/i.test(e.message) ? { sent: false, error: '' } : { sent: false, error: e.message }; }
}

// A new listing (NL number from the counter, in one transaction). task = the TMS task it starts from, or null.
export async function createListing(fields, contact, task) {
  const me = useSession();
  // State security (12 Nov 2026): every new listing is for one state; only staff in that state see it
  if (!fields.state) throw stop('Choose the state the listing is for.');
  const h = entry(task ? `Started from the task system task "${task.title}".` : 'Started the listing.');
  return runTransaction(db, async tx => {
    const cRef = doc(db, 'counters', 'newOwnerListings');
    const cs = await tx.get(cRef);
    const n = cs.exists() ? cs.data().next || 1 : 1, id = num('NL', n), ref = doc(db, 'newOwnerListings', id);
    if ((await tx.get(ref)).exists()) throw stop(`${id} already exists. Ask a Director to check counters/newOwnerListings.`);
    const first = String(fields.remarks || '').trim();
    const data = { ...blank(), ...fields, ...(first ? { remarks: first, remarksLog: [remarkEntry(first)] } : {}), stage: 1, status: 'progress', startedOn: nowIso().slice(0, 10),
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
    const remarks = (fields.remarks || '').trim();
    if (remarks) {
      const r = await sendRemarks(task.id, remarks);
      if (r.error) { Object.assign(tmsSync, { pending: true, pendingRemarks: remarks, error: r.error }); message += ` The remarks did not reach the card yet: ${r.error}`; }
    }
  } catch (e) { tmsSync = { linked: false, pending: true, pendingNote: '', error: e.message, at: '', pendingStatus: 'progress', ...((fields.remarks || '').trim() ? { pendingRemarks: fields.remarks.trim() } : {}) }; message = `${id} started. Not linked in the task system yet: ${e.message}`; }
  await updateDoc(doc(db, 'newOwnerListings', id), { tmsSync, ...(tmsColumn ? { tmsColumn } : {}) }).catch(() => {});
  return { id, message };
}

export const listingLink = id => `/Procurement/listing-flow/${id}`;

// Director only (13 Nov 2026), for mistakes and tests: deletes a listing for good: its private part (owner contact),
// then the listing, with an audit line. Property, owner and unit already made in Portfolio stay. Then its task system
// card is deleted for good too (TMS action deleteOwnerLead, which checks the listing is gone first). If that fails,
// the TMS lets a Director delete the card by hand, as its listing no longer exists.
// Resolves { message }.
export async function deleteListing(l, reason = '') {
  const me = useSession();
  if (me.role !== 'director') throw Object.assign(new Error('Only Directors can delete a listing.'), { plain: true });
  const ref = listingRef(l.id), why = reason.trim();
  const b = writeBatch(db);
  b.delete(doc(ref, 'private', 'main'));
  b.delete(ref);
  audit(b, me, { action: 'newOwnerListing.delete', entity: `newOwnerListings/${l.id}`, reason: why || `Deleted ${l.id}`,
    changes: [{ field: 'listing', old: `${l.id} · ${placeOf(l)} · ${LEAD_STATUS[statusOf(l)]?.label || ''}`, new: null }] });
  await b.commit();
  if (!l.tmsTaskId) return { message: '' };
  try {
    const r = await deleteOwnerLead(l.tmsTaskId);
    return { message: r.deleted === false ? '' : ' Its card in the task system is deleted too.' };
  } catch (e) {
    return { message: ` Its card in the task system was not deleted (${e.message}); a Director can delete it there now.` };
  }
}

// Same content, whatever the key order (Firestore can hand back map keys in another order than the screen made them).
const sorted = v => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v);
export const sameData = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

// The stage a listing is at, as "3 · Renovation" (its position among the stages it shows).
export const stageText = l => { const k = currentKeyOf(l); return `${stagesFor(l).indexOf(k) + 1} · ${STAGES[k].label}`; };
// The arrangement for the unit in Portfolio (Live stage, and the prefill on Create unit for older listings).
// pct = the unit's own service fee % to prefill: the custom % when typed, else the arrangement's service part.
// null when nothing is picked.
export function serviceFeeOf(l) {
  const sv = l.services, a = sv.arrangement;
  if (!sv.rentType) return null;
  const custom = String(sv.customPct ?? '').trim();
  const pct = custom !== '' ? Number(custom) : a && !isFixedArr(a) ? pct3(a.servicePct) : feePctOf(l);
  if (pct == null && !a) return null;
  return { rentType: sv.rentType, label: a ? a.name : rentLabel(sv.rentType), pct, arrangementId: a ? sv.arrangementId : '', text: feeText(l) };
}

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
