// Utility bills (23 Nov 2026, Khairul): a booking holds MANY bills, utilityBills/{autoId}.
//   { bookingId, bookingNo, propertyId, propertyName, unitCode, tenantId, lines: [{ kind, from, to, amount }], total,
//     lodgedAt, lodgedByUid, lodgedByName, lodgedFrom: 'lodgment' | 'payment', driveFolder, emailedAt, emailedByName,
//     paid, status: 'unpaid' | 'partly' | 'paid', paymentIds: [], lastPaymentId, createdAt, createdBy, createdByName, state }
// A bill is known by its lines' dates (no month field). A bill saved before this (utilityBills/{bookingId}, one per booking,
// electricity / water / sewerage fields with their own periods) is read as one bill by billOf(); nothing is moved.
// paid / status / paymentIds change only in the same batch as the offline payment that pays the bill (linkBills below),
// which also stamps lastPaymentId so the rules (Draft 1.03) can check that payment.
// Offline payments: parts [{ type: 'rental', amount, forMonth }, { type: 'utilities', amount, bills: [{ billId, amount }] }],
// billIds (the bills in the utilities part, for the rules and for finding a bill's payments) and billsAt (when they changed).
import { collection, doc, getDoc, getDocs, query, where, serverTimestamp, arrayUnion, arrayRemove, writeBatch, updateDoc } from 'firebase/firestore';
import { audit } from '@/lib/finance-data.js';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';

export const KINDS = [{ key: 'electricity', label: 'Electricity' }, { key: 'water', label: 'Water' }, { key: 'sewerage', label: 'Sewerage' }];
export const kindLabel = k => KINDS.find(x => x.key === k)?.label || k;
const r3 = v => Math.round((Number(v) || 0) * 1000) / 1000;   // sums keep 3 decimals; screens show 2
export const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
export const money = n => `RM ${Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const statusOf = (paid, total) => (paid > 0 && paid >= total - 0.005 ? 'paid' : paid > 0.004 ? 'partly' : 'unpaid');
export const STATUS_TEXT = { unpaid: 'Unpaid', partly: 'Partly paid', paid: 'Paid' };
export const statusPill = b => (b.status === 'partly' ? `Partly paid · ${money(b.left)} left` : STATUS_TEXT[b.status] || 'Unpaid');

// A saved bill (new or old shape) as { id, lines, total, paid, left, status, paymentIds, ... }
export function billOf(id, d) {
  let lines = Array.isArray(d.lines) ? d.lines.map(l => ({ kind: l.kind, from: l.from || '', to: l.to || '', amount: r2(l.amount) })) : null;
  if (!lines) {   // one bill per booking (before 23 Nov 2026): each kind with its own period, or the one shared period
    lines = KINDS.filter(k => Number(d[k.key]) > 0).map(k => ({ kind: k.key, from: d[k.key + 'From'] || d.periodFrom || '', to: d[k.key + 'To'] || d.periodTo || '', amount: r2(d[k.key]) }));
  }
  const total = r2(d.total ?? lines.reduce((a, l) => a + l.amount, 0)), paid = r2(d.paid);
  return { ...d, id, lines, total, paid, left: r2(Math.max(0, total - paid)), status: statusOf(paid, total), paymentIds: Array.isArray(d.paymentIds) ? d.paymentIds : [],
    legacy: !Array.isArray(d.lines), driveFolder: d.driveFolder || d.invoiceLink || '' };
}

const ddmm = d => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
const dmyShort = d => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : '');
// "29/09–29/10" when every line has the same dates, else earliest–latest (with years when they differ)
export function datesText(b) {
  const ls = (b.lines || []).filter(l => l.from && l.to);
  if (!ls.length) return 'No dates';
  const from = ls.map(l => l.from).sort()[0], to = ls.map(l => l.to).sort().slice(-1)[0];
  return from.slice(0, 4) === to.slice(0, 4) && to.slice(0, 4) === String(new Date().getFullYear()) ? `${ddmm(from)}–${ddmm(to)}` : `${dmyShort(from)}–${dmyShort(to)}`;
}
export const linesText = b => (b.lines || []).map(l => `${kindLabel(l.kind)} ${ddmm(l.from)}–${ddmm(l.to)} ${money(l.amount)}`).join(' · ');
// Oldest first (by its earliest date, then when it was lodged)
const firstDate = b => (b.lines || []).map(l => l.from).filter(Boolean).sort()[0] || '';
const lodgedMs = b => b.lodgedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
export const oldestFirst = (a, b) => firstDate(a).localeCompare(firstDate(b)) || lodgedMs(a) - lodgedMs(b);
export const newestFirst = (a, b) => -oldestFirst(a, b);

// A booking's bills. Staff other than Directors read only their properties' bills (rules Draft 1.03), so the query names
// the booking's property too. Returns null when they can't be read.
export async function loadBills(booking) {
  const me = useSession(), col = collection(db, 'utilityBills');
  const q = me.role === 'director' ? query(col, where('bookingId', '==', booking.id))
    : query(col, where('bookingId', '==', booking.id), where('propertyId', '==', booking.propertyId || ''));
  try { return (await getDocs(q)).docs.map(d => billOf(d.id, d.data())).sort(newestFirst); }
  catch (e) { console.warn('Utility bills not readable', e.code || e.message); return null; }
}

// The fields of a new bill (the caller adds withState and sets it in its batch)
export function newBill(b, lines, from, me, extra = {}) {
  const clean = lines.filter(l => r2(l.amount) > 0).map(l => ({ kind: l.kind, from: l.from, to: l.to, amount: r2(l.amount) }));
  return { bookingId: b.id, bookingNo: b.bookingNo || '', propertyId: b.propertyId || '', propertyName: b.propertyName || '', unitCode: b.unitCode || b.unitId || '',
    tenantId: b.tenantId || '', lines: clean, total: r2(clean.reduce((a, l) => a + l.amount, 0)), lodgedAt: serverTimestamp(), lodgedByUid: me.user.uid, lodgedByName: me.name || '',
    lodgedFrom: from, driveFolder: '', paid: 0, status: 'unpaid', paymentIds: [], createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name || '', ...extra };
}
// Lines typed on a form: [{ kind, from, to, amount }] -> what is wrong, or ''
export function linesProblem(lines) {
  const on = lines.filter(l => r2(l.amount) > 0);
  if (!on.length) return 'Add at least one utility amount.';
  for (const l of on) {
    if (!l.from || !l.to) return `Choose the ${kindLabel(l.kind).toLowerCase()} dates (from and to).`;
    if (l.to < l.from) return `The ${kindLabel(l.kind).toLowerCase()} dates end before they start.`;
  }
  if (lines.some(l => Number(l.amount) < 0)) return 'Amounts can\'t be below 0.';
  return '';
}

// Share an amount over bills, oldest first, up to what each has left: [{ billId, amount }]
export function spread(amount, bills) {
  let rest = r2(amount); const out = [];
  for (const b of [...bills].sort(oldestFirst)) { if (rest <= 0.004) break; const a = r2(Math.min(rest, b.left)); if (a > 0) { out.push({ billId: b.id, amount: a }); rest = r2(rest - a); } }
  return out;
}

// What a payment pays: { rental, utilities, bills: { billId: amount } }. A payment with no parts is all Rental.
export function partsOf(p) {
  if (!Array.isArray(p?.parts) || !p.parts.length) return { rental: r2(p?.amount), utilities: 0, bills: {}, forMonth: p?.forMonth || '' };
  const r = p.parts.find(x => x.type === 'rental'), u = p.parts.find(x => x.type === 'utilities'), bills = {};
  (u?.bills || []).forEach(x => { bills[x.billId] = r3((bills[x.billId] || 0) + (Number(x.amount) || 0)); });
  return { rental: r2(r?.amount), utilities: r2(u?.amount), bills, forMonth: r?.forMonth || '' };
}

// Change the bills a payment pays, in the caller's batch. was / now: { billId: amount } (before / after this save; {} for a
// new or deleted payment). Each bill is read fresh. Every changed bill gets paid, status, paymentIds and lastPaymentId;
// a bill created in the same batch is passed in `fresh` ({ billId: { total } }) instead of being read.
export async function linkBills(batch, paymentId, was, now, fresh = {}) {
  const ids = [...new Set([...Object.keys(was || {}), ...Object.keys(now || {})])];
  const out = [];
  for (const id of ids) {
    const a = r2(was?.[id]), z = r2(now?.[id]);
    if (a === z && (id in (was || {})) === (id in (now || {}))) continue;
    let total, paid;
    if (fresh[id]) { total = r2(fresh[id].total); paid = 0; }
    else {
      const s = await getDoc(doc(db, 'utilityBills', id));
      if (!s.exists()) continue;   // removed already: nothing to update
      const d = billOf(id, s.data()); total = d.total; paid = d.paid;
    }
    const nextPaid = r2(Math.max(0, paid - a + z)), status = statusOf(nextPaid, total), linked = id in (now || {});
    const upd = { paid: nextPaid, status, lastPaymentId: paymentId, updatedAt: serverTimestamp() };
    if (fresh[id]) Object.assign(fresh[id].data, { paid: nextPaid, status, paymentIds: [paymentId], lastPaymentId: paymentId });   // set once, in the create
    else batch.update(doc(db, 'utilityBills', id), { ...upd, paymentIds: linked ? arrayUnion(paymentId) : arrayRemove(paymentId) });
    out.push({ id, paid: nextPaid, status, total });
  }
  return out;
}

// "Rental Nov 2026 · Utilities 29/09–29/10 · Total RM 3,211.73"
// 23 Nov 2026 (Khairul): each line of the bills paid, numbered, with its dates:
//   Rental Nov 2026 · RM 1,000.00
//   Utilities RM 94.00:
//   1. Electricity 23/11/2026 - 13/12/2026 · RM 41.00
//   2. Water 23/11/2026 - 23/12/2026 · RM 41.00
//   Total RM 1,094.00
export function purposeText({ rental, forMonth, bills, utilities }) {
  const out = [];
  const mon = m => { const [y, n] = m.split('-'); return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+n - 1] || ''} ${y}`; };
  const dmy = d => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '?');
  if (r2(rental) > 0) out.push(`Rental${/^\d{4}-\d{2}$/.test(forMonth || '') ? ' ' + mon(forMonth) : ''} · ${money(rental)}`);
  if (r2(utilities) > 0) {
    out.push(`Utilities ${money(utilities)}:`);
    const lines = (bills || []).flatMap(b => (b.lines || []).filter(l => r2(l.amount) > 0));
    lines.forEach((l, i) => out.push(`${i + 1}. ${kindLabel(l.kind)} ${dmy(l.from)} - ${dmy(l.to)} · ${money(l.amount)}`));
  }
  if (r2(rental) > 0 && r2(utilities) > 0) out.push(`Total ${money(r2(rental) + r2(utilities))}`);
  return out.join('\n').slice(0, 1000);
}

// Gmail compose link for a bill (they check it and press send themselves)
export function billMailLink(bill, place, tenant) {
  const body = `Dear ${tenant.name || 'Tenant'},\n\nPlease find your utility bill for ${place.unitCode || 'your unit'}${place.propertyName ? ', ' + place.propertyName : ''}:\n\n`
    + bill.lines.filter(l => l.amount > 0).map(l => `- ${kindLabel(l.kind)} (${l.from} to ${l.to}): ${money(l.amount)}\n`).join('')
    + `\nTotal: ${money(bill.total)}\n` + (bill.driveFolder ? `\nBill: ${bill.driveFolder}\n` : '') + '\nThank you.\nWidebed';
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(tenant.email)}&su=${encodeURIComponent(`Utility bill - ${place.unitCode || ''}`.trim())}&body=${encodeURIComponent(body)}`;
}
export const PILL = { unpaid: 'red', partly: 'amber', paid: 'green' };
export const PAY_MODES = ['Bank transfer', 'Cash', 'Card', 'Online banking / QR', 'Cheque', 'Other'];

// ---------- the Utilities part of an offline payment (OfflinePayments.vue, components/UtilityPart.vue) ----------
// u = { bills, ticks: { billId: true }, amount, touched, was: { billId: amount this payment already pays }, add: { on, id, <kind>, <kind>From, <kind>To, driveFolder } }
export function blankUtil(was = {}) {
  const add = { on: false, id: doc(collection(db, 'utilityBills')).id, driveFolder: '' };
  KINDS.forEach(k => { add[k.key] = ''; add[k.key + 'From'] = ''; add[k.key + 'To'] = ''; });
  return { bills: null, ticks: Object.fromEntries(Object.keys(was).map(id => [id, true])), amount: '', touched: false, was: { ...was }, add };
}
// What a bill still takes from this payment: what is left plus what this payment already pays on it
export const availOf = (u, b) => r2(b.left + r2(u.was?.[b.id]));
export const addLines = u => KINDS.map(k => ({ kind: k.key, from: u.add[k.key + 'From'], to: u.add[k.key + 'To'], amount: u.add[k.key] }));
export const addTotal = u => (u.add.on ? r2(addLines(u).reduce((a, l) => a + r2(l.amount), 0)) : 0);
export const tickedBills = u => (u.bills || []).filter(b => u.ticks[b.id]);
export const utilMax = u => r2(tickedBills(u).reduce((a, b) => a + availOf(u, b), 0) + addTotal(u));
// The bills this payment pays and how much each, oldest first: [{ billId, amount }]
export function utilPool(u) {
  const pool = tickedBills(u).map(b => ({ ...b, left: availOf(u, b) }));
  const t = addTotal(u);
  if (t > 0) pool.push({ id: u.add.id, lines: addLines(u).filter(l => r2(l.amount) > 0), left: t, total: t, isNew: true });
  return pool;
}
export const utilAlloc = u => spread(u.amount, utilPool(u));
// Fill the amount from the ticked bills unless it was typed
export function refillUtil(u) { if (!u.touched) { const m = utilMax(u); u.amount = m > 0 ? m.toFixed(2) : ''; } }

// ---------- edit / delete a bill (booking drawer) ----------
// Lines, dates and amounts, with a reason (audit utilityBill.update). The status follows the new total; the total can't
// go below what is already paid (unlink payments first).
export async function saveBillEdit(me, bill, lines, reason) {
  const clean = lines.filter(l => r2(l.amount) > 0).map(l => ({ kind: l.kind, from: l.from, to: l.to, amount: r2(l.amount) }));
  const total = r2(clean.reduce((a, l) => a + l.amount, 0));
  if (total < bill.paid - 0.005) throw new Error(`The new total is less than what is already paid (${money(bill.paid)}). Change or unlink the payments first.`);
  const batch = writeBatch(db);
  const status = statusOf(bill.paid, total);
  batch.update(doc(db, 'utilityBills', bill.id), { lines: clean, total, status, updatedAt: serverTimestamp(), updatedBy: me.user.uid, updatedByName: me.name || '' });
  audit(batch, me, { action: 'utilityBill.update', entity: `utilityBills/${bill.id}`, propertyId: bill.propertyId || null, reason,
    changes: [{ field: 'lines', old: linesText(bill), new: linesText({ lines: clean }) }, ...(total !== bill.total ? [{ field: 'total', old: bill.total, new: total }] : [])] });
  await batch.commit();
  return { lines: clean, total, status, left: r2(Math.max(0, total - bill.paid)) };
}
export async function deleteBill(me, bill, reason) {
  if (bill.paymentIds.length) throw new Error('Payments are linked to this bill. Unlink them (edit or delete the payments) before deleting it.');
  const batch = writeBatch(db);
  batch.delete(doc(db, 'utilityBills', bill.id));
  audit(batch, me, { action: 'utilityBill.delete', entity: `utilityBills/${bill.id}`, propertyId: bill.propertyId || null, reason,
    changes: [{ field: 'bill', old: `${bill.bookingNo || bill.bookingId} · ${linesText(bill)} · ${money(bill.total)}`, new: null }] });
  await batch.commit();
}
export async function noteEmailed(me, bill) {
  await updateDoc(doc(db, 'utilityBills', bill.id), { emailedAt: serverTimestamp(), emailedByName: me.name || '' });
}
