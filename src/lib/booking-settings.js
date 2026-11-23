// Booking settings > Booking sources and Other fees (23 Nov 2026, Khairul). Firestore rules Draft 1.02.
//   config/bookingSources { list: [{ id, label, active, order, builtIn, was }], updatedAt, updatedByUid, updatedByName }
//   config/bookingFees    { fees: [{ id, label, kind, deposit, builtIn, order, defaultAmount, mode: { daily, monthly, yearly } }], ... }
// Firestore rules 1.02 check only the document (fields, who, when, at most 30 rows): checking each row went over the
// 1000-step limit. So every row is cleaned here when read (names cut to 40, unknown modes = show, bad amounts = none).
// A missing document (or a missing built-in row) means today's lists: Offline / Website / Agent / OTA, and the nine fees,
// all shown. Both are read once per visit through lib/cache.js (no live listeners); saving clears the copy.
// Bookings keep the source as text (bookingSource), so renaming a source changes new bookings only. 'was' keeps a source's
// older labels, so "Used on N bookings" still counts bookings saved under an old name.
// Fees: staff always type every fee on the booking form; the mode per rent type only decides how the TENANT sees it on the
// invoice: 'show' (own line), 'intoRent' (added into the rent shown, same total) or 'notUsed' (box hidden on new bookings).
// Built-in fees keep their booking keys (internetFee ...); custom fees are saved on the booking as customFees { <id>: amount }.
import { doc, getDoc, writeBatch, serverTimestamp, collection, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from './firebase.js';
import { cached, clearCache, TTL } from './cache.js';
import { useSession } from '@/stores/session.js';
import { audit } from './finance-data.js';
import { termOf } from './rent-term.js';

export const MAX_ITEMS = 30;
export const LABEL_MAX = 40;
export const AGENT_ID = 'agent';

// ---------- Booking sources ----------
export const SOURCE_DEFAULTS = [['offline', 'Offline'], ['website', 'Website'], [AGENT_ID, 'Agent'], ['ota', 'OTA']]
  .map(([id, label], order) => ({ id, label, active: true, order, builtIn: true, was: [] }));

// The saved list tidied: built-ins always there (a lost one comes back at the end), Agent always active and named Agent
export function normSources(list) {
  const out = (Array.isArray(list) ? list : []).filter(s => s && typeof s.id === 'string' && String(s.label || '').trim())
    .slice(0, MAX_ITEMS).map(s => ({ id: s.id, label: String(s.label).trim().slice(0, LABEL_MAX), active: s.active !== false, order: Number(s.order) || 0, builtIn: !!s.builtIn, was: Array.isArray(s.was) ? s.was.filter(Boolean) : [] }));
  SOURCE_DEFAULTS.forEach(d => { if (!out.some(s => s.id === d.id)) out.push({ ...d, order: 1000 + d.order }); });
  out.forEach(s => { if (SOURCE_DEFAULTS.some(d => d.id === s.id)) s.builtIn = true; if (s.id === AGENT_ID) { s.label = 'Agent'; s.active = true; } });
  return out.sort((a, b) => a.order - b.order).map((s, i) => ({ ...s, order: i }));
}

async function readDoc(id) {
  const s = await getDoc(doc(db, 'config', id));
  return s.exists() ? s.data() : null;
}
// fresh: read again now (the settings page); otherwise the copy kept for this visit
export async function loadBookingSources(fresh = false) {
  if (fresh) await clearCache('bookingSources');
  const d = await cached('bookingSources', TTL.mid, () => readDoc('bookingSources'));
  return { list: normSources(d?.list), saved: !!d, updatedByName: d?.updatedByName || '', updatedAt: d?.updatedAt || null };
}
// For the forms: never throws (the built-in list when it can't be read)
export async function sourcesForForms() {
  try { return (await loadBookingSources()).list; } catch { return normSources(null); }
}
// The source a booking's saved text belongs to (its label now or an older one)
export const sourceOf = (list, text) => {
  const t = String(text || '').trim().toLowerCase();
  return t ? (list || []).find(s => s.label.toLowerCase() === t || (s.was || []).some(w => w.toLowerCase() === t)) || null : null;
};
export const isAgentSource = (list, text) => sourceOf(list, text)?.id === AGENT_ID || (!sourceOf(list, text) && String(text || '').trim() === 'Agent');
// Drop-down options: active sources in order, plus the booking's own saved text when it is hidden, renamed or not in the list
export function sourceOptions(list, current = '') {
  const opts = (list || []).filter(s => s.active).map(s => ({ value: s.label, label: s.label }));
  const cur = String(current || '').trim();
  if (cur && !opts.some(o => o.value === cur)) opts.push({ value: cur, label: `${cur} (not in the list now)` });
  return opts;
}

export async function saveBookingSources(list, before = []) {
  const me = useSession();
  const clean = list.map((s, i) => ({ id: s.id, label: s.label.trim(), active: s.id === AGENT_ID ? true : !!s.active, order: i, builtIn: !!s.builtIn, was: (s.was || []).slice(-10) }));
  const changes = [];
  const old = new Map((before || []).map(s => [s.id, s]));
  clean.forEach(s => {
    const o = old.get(s.id);
    if (!o) { changes.push({ field: `source ${s.label}`, old: '', new: 'added' }); return; }
    if (o.label !== s.label) changes.push({ field: `source ${o.label}`, old: o.label, new: `renamed to ${s.label}` });
    if (o.active !== s.active) changes.push({ field: `source ${s.label}`, old: o.active ? 'active' : 'hidden', new: s.active ? 'active' : 'hidden' });
  });
  (before || []).forEach(o => { if (!clean.some(s => s.id === o.id)) changes.push({ field: `source ${o.label}`, old: o.label, new: 'removed' }); });
  const kept = (before || []).filter(o => clean.some(s => s.id === o.id)).map(o => o.id), now = clean.filter(s => kept.includes(s.id)).map(s => s.id);
  if (kept.join() !== now.join()) changes.push({ field: 'order', old: '', new: clean.map(s => s.label).join(', ') });
  const batch = writeBatch(db);
  batch.set(doc(db, 'config', 'bookingSources'), { list: clean, updatedAt: serverTimestamp(), updatedByUid: me.user.uid, updatedByName: me.name || '' });
  audit(batch, me, { action: 'bookingSources.update', entity: 'config/bookingSources', reason: 'Booking sources changed', changes });
  await batch.commit();
  await clearCache('bookingSources');
}

// How many bookings carry this source (its label now or an older one). Bulk Upload and older bookings are counted too.
export async function countSourceUse(s) {
  const names = [...new Set([s.label, ...(s.was || [])].filter(Boolean))].slice(0, 30);
  const r = await getCountFromServer(query(collection(db, 'offlineBookings'), where('bookingSource', 'in', names)));
  return r.data().count;
}

// ---------- Other fees ----------
export const MODES = [{ value: 'show', label: 'Show' }, { value: 'intoRent', label: 'Add into rent' }, { value: 'notUsed', label: 'Not used' }];
export const RENT_COLS = [{ key: 'daily', label: 'Short term', term: 'Daily Lease' }, { key: 'monthly', label: 'Monthly', term: 'Monthly Lease' }, { key: 'yearly', label: 'Yearly', term: 'Yearly Lease' }];
const TERM_COL = { short: 'daily', mid: 'monthly', long: 'yearly' };
// The mode column of a booking: its Type of rent (Daily / Monthly / Yearly), else its nights (lib/rent-term.js)
export const feeColOf = b => TERM_COL[termOf(b)] || 'daily';

// Built-in fees (the booking keys used since before 23 Nov 2026), with the labels on the booking form
export const BUILTIN_FEES = [
  ['utilityDeposit', 'Utility deposit', 'oneOff', true], ['internetFee', 'Internet fees', 'monthly'], ['carparkFee', 'Carpark fees', 'monthly'],
  ['cleaningFee', 'Cleaning fees', 'monthly'], ['taFee', 'Tenancy agreement fees', 'oneOff'], ['taStampFee', 'Tenancy agreement stamping fees', 'oneOff'],
  ['gatewayFee', 'Payment gateway charges', 'oneOff'], ['cardFee', 'Credit card charges', 'oneOff'], ['othersFee', 'Others', 'oneOff']
].map(([id, label, kind, deposit], order) => ({ id, label, kind, deposit: !!deposit, builtIn: true, order, defaultAmount: null, mode: { daily: 'show', monthly: 'show', yearly: 'show' } }));
export const BUILTIN_IDS = BUILTIN_FEES.map(f => f.id);
// The shorter names the booking form used for some built-ins (only while the label is not changed)
const SHORT = { taFee: 'Tenancy agreement', taStampFee: 'TA stamping', gatewayFee: 'Payment gateway' };
export const feeShort = f => (SHORT[f.id] && BUILTIN_FEES.find(x => x.id === f.id)?.label === f.label ? SHORT[f.id] : f.label);

const modeOk = v => MODES.some(m => m.value === v);
const amt = v => (v === '' || v == null || !(Number(v) >= 0) ? null : Math.round(Number(v) * 1000) / 1000);
// defaultAmount: null, one number, or { daily, monthly, yearly } (each a number or null)
export function cleanDefault(d) {
  if (d && typeof d === 'object') {
    const o = { daily: amt(d.daily), monthly: amt(d.monthly), yearly: amt(d.yearly) };
    return Object.values(o).some(v => v != null) ? o : null;
  }
  return amt(d);
}
export const defaultFor = (f, col) => { const d = f?.defaultAmount; return d && typeof d === 'object' ? d[col] ?? null : d ?? null; };

export function normFees(list) {
  const out = (Array.isArray(list) ? list : []).filter(f => f && typeof f.id === 'string' && String(f.label || '').trim()).slice(0, MAX_ITEMS).map(f => ({
    id: f.id, label: String(f.label).trim().slice(0, LABEL_MAX), kind: f.kind === 'monthly' ? 'monthly' : 'oneOff', deposit: !!f.deposit, builtIn: !!f.builtIn,
    order: Number(f.order) || 0, defaultAmount: cleanDefault(f.defaultAmount),
    mode: Object.fromEntries(RENT_COLS.map(c => [c.key, modeOk(f.mode?.[c.key]) ? f.mode[c.key] : 'show']))
  }));
  BUILTIN_FEES.forEach(d => { if (!out.some(f => f.id === d.id)) out.push({ ...d, mode: { ...d.mode }, order: 1000 + d.order }); });
  out.forEach(f => { if (BUILTIN_IDS.includes(f.id)) f.builtIn = true; });
  return out.sort((a, b) => a.order - b.order).map((f, i) => ({ ...f, order: i }));
}
export async function loadBookingFees(fresh = false) {
  if (fresh) await clearCache('bookingFees');
  const d = await cached('bookingFees', TTL.mid, () => readDoc('bookingFees'));
  return { fees: normFees(d?.fees), saved: !!d, updatedByName: d?.updatedByName || '', updatedAt: d?.updatedAt || null };
}
export async function feesForForms() {
  try { return (await loadBookingFees()).fees; } catch { return normFees(null); }
}
// The fee's mode for a booking ('show' when the key is not a setting, e.g. the security deposit)
export const feeModeOf = (fees, key, col) => (fees || []).find(f => f.id === key)?.mode?.[col] || 'show';
export const newFeeId = () => 'fee_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const modeName = v => MODES.find(m => m.value === v)?.label || v;
const defText = d => (d == null ? 'none' : typeof d === 'object' ? RENT_COLS.map(c => `${c.label} ${d[c.key] ?? '-'}`).join(', ') : String(d));
export async function saveBookingFees(fees, before = []) {
  const me = useSession();
  const clean = fees.map((f, i) => ({ id: f.id, label: f.label.trim(), kind: f.kind === 'monthly' ? 'monthly' : 'oneOff', deposit: !!f.deposit, builtIn: !!f.builtIn,
    order: i, defaultAmount: cleanDefault(f.defaultAmount), mode: { daily: f.mode.daily, monthly: f.mode.monthly, yearly: f.mode.yearly } }));
  const changes = [], old = new Map((before || []).map(f => [f.id, f]));
  clean.forEach(f => {
    const o = old.get(f.id);
    if (!o) { changes.push({ field: `fee ${f.label}`, old: '', new: 'added' }); return; }
    if (o.label !== f.label) changes.push({ field: `fee ${o.label}`, old: o.label, new: `renamed to ${f.label}` });
    if (o.kind !== f.kind) changes.push({ field: `fee ${f.label} kind`, old: o.kind === 'monthly' ? 'Monthly' : 'One-off', new: f.kind === 'monthly' ? 'Monthly' : 'One-off' });
    if (o.deposit !== f.deposit) changes.push({ field: `fee ${f.label} deposit`, old: o.deposit ? 'yes' : 'no', new: f.deposit ? 'yes' : 'no' });
    if (JSON.stringify(o.defaultAmount) !== JSON.stringify(f.defaultAmount)) changes.push({ field: `fee ${f.label} default`, old: defText(o.defaultAmount), new: defText(f.defaultAmount) });
    RENT_COLS.forEach(c => { if (o.mode[c.key] !== f.mode[c.key]) changes.push({ field: `fee ${f.label} ${c.label}`, old: modeName(o.mode[c.key]), new: modeName(f.mode[c.key]) }); });
  });
  (before || []).forEach(o => { if (!clean.some(f => f.id === o.id)) changes.push({ field: `fee ${o.label}`, old: o.label, new: 'removed' }); });
  const kept = (before || []).filter(o => clean.some(f => f.id === o.id)).map(o => o.id), now = clean.filter(f => kept.includes(f.id)).map(f => f.id);
  if (kept.join() !== now.join()) changes.push({ field: 'order', old: '', new: clean.map(f => f.label).join(', ') });
  const batch = writeBatch(db);
  batch.set(doc(db, 'config', 'bookingFees'), { fees: clean, updatedAt: serverTimestamp(), updatedByUid: me.user.uid, updatedByName: me.name || '' });
  audit(batch, me, { action: 'bookingFees.update', entity: 'config/bookingFees', reason: 'Other fees changed', changes });
  await batch.commit();
  await clearCache('bookingFees');
}
// How many bookings have an amount in a custom fee (customFees.<id> > 0)
export async function countFeeUse(id) {
  const r = await getCountFromServer(query(collection(db, 'offlineBookings'), where(`customFees.${id}`, '>', 0)));
  return r.data().count;
}
