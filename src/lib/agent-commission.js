// Agent commission per booking (24 Nov 2026, Khairul). One line per booking: agentCommissions/{bookingId}.
// - Made when a booking with booking source Agent is saved on the booking form (or an Awaiting payment booking is finished).
// - The % is the agent's rate for the booking's Type of rent (Daily / Monthly / Yearly rental) that applies on the day the
//   booking is made (the commission history's "Effective from"). The % and the amount are SAVED on the line, so changing
//   the agent's % later never changes it.
// - Daily rental: % of the stay's total rental. Monthly and Yearly rental: % of ONE month's rent. Deposit and other fees never count.
// - Status: unpaid -> paid (Finance or a Director, with date, amount, bank ref and the pay slip) ; cancelled when the booking is
//   cancelled, deleted or no longer from an agent. Directors can undo a payment (with a reason).
// - Booking edited: an unpaid line is worked out again with its saved %. A paid line never changes; it is marked
//   "booking changed after payment" for Finance.
// Firestore rules Draft 1.10.
import { collection, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { audit } from '@/lib/finance-data.js';
import { sourcesForForms, isAgentSource } from '@/lib/booking-settings.js';
import { can, dirLike } from '@/lib/access.js';

// Who marks a commission paid: Accounting (finance edit ticks, as finEdit() in the rules) and Directors. Undo: Directors.
export const canPayCommission = me => dirLike(me) || ['ezeeUpload.edit', 'expenses.edit', 'monthEnd.edit', 'invoices.edit', 'offlinePayments.edit'].some(p => can(me, p));

export const COMM_TYPES = [
  { value: 'Daily', field: 'commDaily', hist: 'daily', label: 'Daily rental', base: 'total rental of the stay' },
  { value: 'Monthly', field: 'commMonthly', hist: 'monthly', label: 'Monthly rental', base: 'one month\'s rent' },
  { value: 'Yearly', field: 'commYearly', hist: 'yearly', label: 'Yearly rental', base: 'one month\'s rent' }
];
export const commType = rentType => COMM_TYPES.find(t => t.value === rentType) || COMM_TYPES[0];
export const STATUS_LABEL = { unpaid: 'Unpaid', paid: 'Paid', cancelled: 'Cancelled' };

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const r3 = n => Math.round((Number(n) || 0) * 1000) / 1000;
const pad = n => String(n).padStart(2, '0');
export const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const ymdOf = t => { const d = t?.toDate ? t.toDate() : t instanceof Date ? t : null; return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : ''; };

export const lineRef = bookingId => doc(db, 'agentCommissions', bookingId);

// What the % is taken from: Daily = the stay's total rental; Monthly / Yearly = one month's rent
export function commissionBase(b) {
  const t = commType(b.rentType);
  return t.value === 'Daily' ? r2(b.rental) : r2(b.monthlyRent || b.rental);
}

// The agent's % for a Type of rent on a date (YYYY-MM-DD), from the commission history (agents/{id}/commission).
// The newest line whose Effective from is on or before the date wins. A date before every line: the % before the first change.
// No history: the % on the agent now.
export function rateOn(agent, history, rentType, ymd) {
  const t = commType(rentType);
  const rows = [...(history || [])].sort((a, b) => (a.effectiveFrom || '').localeCompare(b.effectiveFrom || '') || (a.rev || 0) - (b.rev || 0));
  if (!rows.length) return { rate: agent?.[t.field] ?? null, rev: agent?.commRev || 0, from: '' };
  const hit = rows.filter(h => (h.effectiveFrom || '') <= ymd).pop();
  if (hit) return { rate: hit[t.hist] ?? null, rev: hit.rev || 0, from: hit.effectiveFrom || '' };
  const first = rows[0];
  return { rate: first['prev' + t.hist[0].toUpperCase() + t.hist.slice(1)] ?? null, rev: 0, from: '' };
}
export async function loadHistory(agentId) {
  const snap = await getDocs(collection(db, 'agents', agentId, 'commission'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function loadAgent(agentId) {
  const s = await getDoc(doc(db, 'agents', agentId));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

// The line's money fields for a booking b with a saved or new rate
function figures(b, rate) {
  const base = commissionBase(b);
  return { base, amount: rate == null ? 0 : r2(r3(base * rate / 100)) };
}

// A NEW line (booking form). b = the booking as saved (id, bookingNo, propertyId, unitId, unitCode, arrival, departure,
// rentType, rental, monthlyRent, agentId, agentName, agentCompany); agent and history = the agent and their commission history.
export function newLine(me, b, agent, history, ymd = todayYmd()) {
  const { rate, rev, from } = rateOn(agent, history, b.rentType, ymd);
  return {
    bookingId: b.id, bookingNo: b.bookingNo || '', propertyId: b.propertyId || '', propertyName: b.propertyName || '', unitId: b.unitId || '', unitCode: b.unitCode || '',
    arrival: b.arrival || '', departure: b.departure || '', rentType: commType(b.rentType).value,
    agentId: b.agentId, agentName: b.agentName || agent?.name || '', agentCompany: b.agentCompany || agent?.company || '',
    rate, rateRev: rev, rateFrom: from, rateDate: ymd, ...figures(b, rate),
    status: 'unpaid', cancelReason: '',
    createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name || '',
    updatedAt: serverTimestamp(), updatedBy: me.user.uid
  };
}

// What a booking change does to its line. line = the saved line (or null); b = the booking after the change.
// agentNow = the booking is (still) from an agent. Returns the fields to write, or null for no change.
export function lineChange(me, line, b, { agentNow = true, cancelled = false, deleted = false, reason = '' } = {}) {
  if (!line) return null;
  const stamp = { updatedAt: serverTimestamp(), updatedBy: me.user.uid };
  if (line.status === 'paid') {
    const moved = cancelled || !agentNow || commissionBase(b) !== line.base || (b.arrival || '') !== line.arrival || (b.departure || '') !== line.departure;
    return moved ? { bookingChanged: true, bookingChangedAt: serverTimestamp(), bookingChangeNote: String(reason || 'Booking changed after payment').slice(0, 300), ...stamp } : null;
  }
  if (deleted && line.status === 'cancelled') return { cancelReason: `${reason}${line.cancelReason ? ` (${line.cancelReason})` : ''}`.slice(0, 300), ...stamp };
  if (cancelled || !agentNow) return line.status === 'cancelled' ? null : { status: 'cancelled', cancelReason: String(reason || (cancelled ? 'Booking cancelled' : 'Booking source is no longer Agent')).slice(0, 300), ...stamp };
  const f = figures(b, line.rate);
  const next = { status: 'unpaid', cancelReason: '', ...f, arrival: b.arrival || '', departure: b.departure || '', unitCode: b.unitCode || line.unitCode || '' };
  const same = Object.keys(next).every(k => (line[k] ?? '') === next[k]);
  return same ? null : { ...next, ...stamp };
}

// Adds a booking change to a batch or transaction-like writer (set with merge). line read beforehand.
export function writeChange(w, me, line, b, opts) {
  const ch = lineChange(me, line, b, opts);
  if (!ch) return false;
  w.set(lineRef(line.bookingId || b.id), ch, { merge: true });
  audit(w, me, { action: 'agentCommission.bookingChange', entity: `agentCommissions/${line.bookingId || b.id}`, propertyId: b.propertyId || null,
    changes: Object.keys(ch).filter(k => !['updatedAt', 'updatedBy', 'bookingChangedAt'].includes(k)).map(k => ({ field: k, old: line[k] ?? '', new: ch[k] })), reason: opts?.reason || '' });
  return true;
}

// The saved line of a booking, or null (none, or no access)
export async function loadLine(bookingId) {
  try { const s = await getDoc(lineRef(bookingId)); return s.exists() ? { id: s.id, ...s.data() } : null; }
  catch { return null; }
}
// Is a booking source text an agent source? (Booking settings > Booking sources)
export async function agentSource(text) {
  return isAgentSource(await sourcesForForms(), text);
}

// ---- Agents page ----
export async function loadAllLines() {
  const snap = await getDocs(collection(db, 'agentCommissions'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function loadAgentLines(agentId) {
  const snap = await getDocs(query(collection(db, 'agentCommissions'), where('agentId', '==', agentId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.arrival || '').localeCompare(a.arrival || ''));
}
// Totals of lines: unpaid, paid (cancelled left out)
export function totals(lines) {
  const t = { unpaid: 0, paid: 0, nUnpaid: 0, nPaid: 0 };
  (lines || []).forEach(l => {
    if (l.status === 'unpaid') { t.unpaid = r2(t.unpaid + (l.amount || 0)); t.nUnpaid++; }
    if (l.status === 'paid') { t.paid = r2(t.paid + (l.paid?.amount ?? l.amount ?? 0)); t.nPaid++; }
  });
  return t;
}
// The (i) text for one line: how its amount was worked out
export function stepsOf(l) {
  const t = commType(l.rentType);
  const rm = n => `RM ${(Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const when = l.rateFrom ? `effective from ${l.rateFrom}` : 'the % set on the agent';
  return [
    `Type of rent: ${t.label}, so the ${t.label} % is used.`,
    `Taken from: ${t.base} = ${rm(l.base)} (deposit and other fees not counted).`,
    l.rate == null ? `No ${t.label} % was set for this agent on ${l.rateDate || 'the booking day'}, so the commission is RM 0.00.`
      : `Rate: ${l.rate}% (${when}; the % on ${l.rateDate || 'the booking day'}, kept on this line).`,
    l.rate == null ? 'Set the % on the agent; it applies to new bookings only.' : `Commission: ${rm(l.base)} × ${l.rate}% = ${rm(l.amount)}.`
  ];
}

// Finance or a Director: mark a line paid. p = { date, amount, bankRef, slip: { name, fileId, mimeType } }
export async function markPaid(me, line, p) {
  const b = writeBatch(db);
  const paid = { date: p.date, amount: r2(p.amount), bankRef: String(p.bankRef || '').trim().slice(0, 100), note: String(p.note || '').trim().slice(0, 300),
    slip: { name: String(p.slip.name || '').slice(0, 200), fileId: p.slip.fileId, mimeType: p.slip.mimeType || '' },
    at: serverTimestamp(), by: me.user.uid, byName: me.name || '' };
  b.update(lineRef(line.id), { status: 'paid', paid, updatedAt: serverTimestamp(), updatedBy: me.user.uid });
  audit(b, me, { action: 'agentCommission.paid', entity: `agentCommissions/${line.id}`, propertyId: line.propertyId || null,
    changes: [{ field: 'status', old: 'unpaid', new: 'paid' }, { field: 'paid.amount', old: line.amount, new: paid.amount }, { field: 'paid.bankRef', old: '', new: paid.bankRef }],
    reason: `${line.agentName} · ${line.bookingNo || line.bookingId}` });
  await b.commit();
}
// Directors: undo a payment (back to Unpaid), with a reason. The old payment is kept on the line as lastUndo.
export async function undoPaid(me, line, reason) {
  const b = writeBatch(db);
  const p = line.paid || {};
  b.update(lineRef(line.id), { status: 'unpaid', paid: deleteField(),
    lastUndo: { reason: String(reason).trim().slice(0, 300), date: p.date || '', amount: p.amount ?? 0, bankRef: p.bankRef || '', at: serverTimestamp(), by: me.user.uid, byName: me.name || '' },
    updatedAt: serverTimestamp(), updatedBy: me.user.uid });
  audit(b, me, { action: 'agentCommission.undoPaid', entity: `agentCommissions/${line.id}`, propertyId: line.propertyId || null,
    changes: [{ field: 'status', old: 'paid', new: 'unpaid' }], reason });
  await b.commit();
}
export { ymdOf };

// ---- Older agent bookings (24 Nov 2026, Khairul: "see the previous bookings that have agents selected") ----
// Directors: adds a line for every booking with an agent that has none yet (bookings saved before commission lines existed).
// Each takes the % that applied on the day that booking was made (its createdAt), as a new booking would. Cancelled bookings
// are skipped. Returns { added, skipped }.
export async function addOlderLines(me) {
  const { getScoped, scoped } = await import('@/lib/property-scope.js');
  const [snap, have] = await Promise.all([getScoped(scoped(query(collection(db, 'offlineBookings')))), loadAllLines()]);
  const done = new Set(have.map(l => l.id));
  const todo = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.agentId && !done.has(b.id) && b.status !== 'cancelled');
  const agents = {};
  for (const id of new Set(todo.map(b => b.agentId))) {
    const agent = await loadAgent(id).catch(() => null);
    agents[id] = agent ? { agent, history: await loadHistory(id).catch(() => []) } : null;
  }
  let added = 0, skipped = 0, b = writeBatch(db), n = 0;
  for (const bk of todo) {
    const a = agents[bk.agentId];
    if (!a) { skipped++; continue; }   // the agent was deleted
    b.set(lineRef(bk.id), newLine(me, bk, a.agent, a.history, ymdOf(bk.createdAt) || todayYmd()));
    audit(b, me, { action: 'agentCommission.addOlder', entity: `agentCommissions/${bk.id}`, propertyId: bk.propertyId || null, reason: `${bk.bookingNo || bk.id} · ${a.agent.name || ''}` });
    added++; n += 2;
    if (n >= 400) { await b.commit(); b = writeBatch(db); n = 0; }
  }
  if (n) await b.commit();
  return { added, skipped };
}
