// Per-unit and per-property month summaries (scale work, 22 Oct 2026). Pure: no Firebase inside, so the
// summary-equality test can run it next to the engine. summary-data.js reads and writes them.
//
// unitMonths/{unitId}_{month}   one unit, one month: its Month-end row (no booking lines), the Dashboard's figures
//                               for it, and how fresh it is. Bookings with no unit have one pseudo unit per property,
//                               `${propertyId}__none`.
// months/{propertyId}_{month}   the existing month document; its `summary` field adds up the unit summaries for the
//                               Dashboard and the Portfolio list.
//
// Freshness (no extra reads: the property documents are read by every page anyway):
//   properties/{p}.summaryDirty[month]  +1 whenever an input of a unit-month of that property changes (bookings,
//                                       Ctrip amounts, expenses, completing / reopening). unitMonths.dirtyRev is the
//                                       same counter for the one unit.
//   properties/{p}.summaryMarks[key]    +1 for changes that apply from a month on: unit terms ('2026-08|unitId'),
//                                       a unit added or edited ('0000-00|unitId'), a property rate version ('2026-08').
//   A summary keeps the counters it was worked out from (cleanRev / rev). Different numbers = stale: the page works
//   it out again from the full data with the engine, for just those units, and writes it back (Finance/Director).
import { ARRANGEMENTS, effectiveRates, unitStatement, byUnit } from './engine.js';

// Raise when what a summary holds or how it is worked out changes: every summary is then worked out again once.
export const SUMMARY_VERSION = 1;
export const noneId = propertyId => `${propertyId}__none`;
export const isNone = unitId => /__none$/.test(unitId || '');
export const unitMonthId = (unitId, month) => `${unitId}_${month}`;
export const markKey = (from, unitId = null) => (unitId ? `${from}|${unitId}` : from);
export const ALL_MONTHS = '0000-00';   // a mark that applies to every month (unit added, owner or status changed)

// Sum of the marks that apply to this month: for one unit (property-wide marks plus its own), or for the
// whole property (unitId = null: every mark). Counters only go up, so a different sum means something changed.
export function marksFor(property, month, unitId = null) {
  let n = 0;
  for (const [k, v] of Object.entries(property?.summaryMarks || {})) {
    const [from, u] = k.split('|');
    if (from <= month && (!u || unitId == null || u === unitId)) n += Number(v) || 0;
  }
  return n;
}
export const dirtyFor = (property, month) => Number(property?.summaryDirty?.[month]) || 0;
// Units named by unit marks that apply to this month (a unit added on Portfolio has no summary yet).
export function markedUnits(property, month) {
  const out = new Set();
  for (const k of Object.keys(property?.summaryMarks || {})) { const [from, u] = k.split('|'); if (u && from <= month) out.add(u); }
  return [...out];
}

// One statement in the shape that is saved on completion (and shown on screen either way). Moved here from
// Month-end payout unchanged, so the page, the summaries and the test all use the same one.
export function statementRecord(s, u, month) {
  return {
    unitId: u.id, unitCode: u.unitCode, ownerId: u.ownerId || null, propertyId: u.propertyId, month,
    arrangement: s.rates.arrangement || 'notSetUp', arrangementLabel: ARRANGEMENTS[s.rates.arrangement]?.label || 'Not set up',
    fixed: s.fixed, status: s.status,
    rates: { serviceFeePct: s.rates.serviceFeePct, utilityFeePct: s.rates.utilityFeePct, sstOnFeePct: s.rates.sstOnFeePct,
      fixedRentAmount: s.rates.fixedRentAmount, versionId: s.rates.versionId },
    lines: s.lines.map(l => { const bk = { ...l.booking, ...(l.booking.edits || {}) }; return ({ id: l.booking.id || null, cleaning: l.cleaning || 0, cleaningIn: !!l.cleaningIn, reservationNo: bk.reservationNo, source: bk.source, otaKey: l.otaKey, arrival: bk.arrival,
      departure: bk.departure, nights: bk.nights, method: l.method, guestPaid: l.guestPaid, platform: l.platform,
      pto: l.pto, estimated: l.estimated, final: !!l.final, edited: l.edited, note: l.note, financeAmount: l.booking.financeAmount ?? null }); }),
    expenseLines: s.expenses.map(e => ({ expenseId: e.id, date: e.date, kind: e.kind, type: e.type, description: e.description, amount: e.signed })),
    totals: { nights: s.nights, totalReceivable: s.totalReceivable, serviceFee: s.serviceFee || 0, utilityFee: s.utilityFee || 0, sstOnFee: s.sstOnFee || 0,
      entitlement: s.entitlement ?? s.totalReceivable, totalExpenses: s.totalExpenses ?? (s.reimburse - s.deduction), netReceivable: s.netReceivable ?? s.payout,
      roundingAdjust: s.roundingAdjust || 0, payout: s.payout, deduction: s.deduction || 0, reimburse: s.reimburse || 0, bookingIncome: s.bookingIncome ?? null }
  };
}

// What the Month-end list needs of a statement: everything but the booking and expense lines.
const ROW_KEYS = ['unitId', 'unitCode', 'ownerId', 'propertyId', 'month', 'arrangement', 'arrangementLabel', 'fixed', 'status', 'rates', 'totals'];
export function listRow(rec) {
  const row = {};
  for (const k of ROW_KEYS) row[k] = rec[k] ?? null;
  row.bookingCount = (rec.lines || []).length;
  row.estimatedLines = (rec.lines || []).filter(l => l.estimated).map(l => l.reservationNo);   // the checklist names them
  return row;
}

// The engine's draft for one unit, exactly as Month-end payout worked it out (null = no row this month).
// unit: the active unit record with .terms for the month, or null when the bookings name a unit with no record.
export function draftRecord({ propertyId, month, unitId, unit, propertyRates, bookings, expenses }) {
  const active = bookings.filter(b => b.status !== 'cancelled');
  if (!unit && !active.length) return null;   // a unit with no record shows only when it has bookings
  const u = unit || { id: unitId, unitCode: active[0].unitCode, propertyId, terms: null, termHistory: [] };
  const rates = effectiveRates(propertyRates, u.terms);
  const ex = (expenses || []).filter(e => !e.deleted);
  if (!active.length && !ex.length && rates.arrangement !== 'fixedRent') return null;
  return statementRecord(unitStatement({ unit: u, rates, bookings: active, expenses: ex }), u, month);
}

const tsMs = t => (t?.toMillis ? t.toMillis() : (t?.seconds != null ? t.seconds * 1000 : null));
const n = v => Number(v) || 0;

// One unit summary. bookings / expenses: this unit's documents for the month in the order Firestore returns them
// (document id), all statuses; statement: statements/{unitId}_{month} or null.
export function unitSummary({ propertyId, month, unitId, unit, propertyRates, bookings, expenses, statement }) {
  const none = isNone(unitId);
  const active = bookings.filter(b => b.status !== 'cancelled');
  const live = (expenses || []).filter(e => !e.deleted);
  const completed = statement?.status === 'completed';
  let row = null;
  if (!none) {
    if (completed) row = listRow({ ...statement, status: 'completed' });
    else { const rec = draftRecord({ propertyId, month, unitId, unit, propertyRates, bookings, expenses }); row = rec && listRow(rec); }
  }
  // Dashboard figures (dashboard-data.js worked these out from every booking of the month)
  const code = none ? '(no unit)' : (unit ? unit.unitCode : unitId);
  const items = [];
  let ctripMissing = 0;
  for (const b of active) {
    if (none) items.push({ id: b.id, text: `${b.roomRaw || 'Room ?'} · no unit matched (${b.id})`, tag: 'No unit' });
    else if (b.otaKey === 'ctrip' && !(b.ctrip && b.ctrip.guestPaid) && !completed) items.push({ id: b.id, text: `${code} · Ctrip amount missing (${b.id})`, tag: 'Estimated' });
    if (Number(b.nights) === 0) items.push({ id: b.id, text: `${code} · 0 nights (${b.id})`, tag: 'Check' });
    if (b.otaKey === 'ctrip' && !(b.ctrip && b.ctrip.guestPaid) && !completed) ctripMissing++;
  }
  const payout = completed ? (statement.totals?.payout ?? statement.fixedRent?.paymentToOwner ?? 0) : null;
  const recent = [...live].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5)
    .map(e => ({ id: e.id, date: e.date || null, unitCode: code === '(no unit)' ? e.unitId : code, description: e.description ?? null, type: e.type ?? null,
      kind: e.kind ?? null, amount: e.amount ?? null }));
  return {
    propertyId, month, unitId, unitCode: row?.unitCode || unit?.unitCode || active[0]?.unitCode || null,
    engineVersion: SUMMARY_VERSION,
    inUnits: !!unit,                                   // an active unit record (counted on the Dashboard and Portfolio)
    hasTerms: !!unit?.terms, arrangement: unit?.terms?.arrangement || null, fixedRentAmount: unit?.terms?.fixedRentAmount ?? null,
    firstBookingId: active[0]?.id || null,             // where a unit with no record comes in Month-end's checklist
    row,
    // A list of the "room not recognised" bookings (pseudo unit only)
    noUnit: none ? active.map(b => ({ reservationNo: String(b.reservationNo), roomRaw: String(b.roomRaw) })) : null,   // as the checklist prints them
    dash: {
      bookings: active.length, income: active.reduce((s, b) => s + (Number(b.totalInclTax) || 0), 0),
      ctripMissing, items, expenses: live.length, recent,
      completed, payout, negText: completed && statement.totals?.payout < 0 ? `${code} · payout −${Math.abs(statement.totals.payout).toFixed(2)}, carries forward` : null,
      setupText: unit && !unit.terms && !completed ? `${unit.unitCode} · no fee % set up` : null
    },
    // So a saved copy of the statement can be checked against it (completed statements are read cache-first)
    statement: statement ? { status: statement.status || null, revision: statement.revision ?? null, completedAtMs: tsMs(statement.completedAt), reopenedAtMs: tsMs(statement.reopenedAt) } : null,
    stale: false
  };
}

// The fields a unit summary document holds (written with mergeFields, so dirtyRev is never overwritten).
export const UNIT_FIELDS = ['propertyId', 'month', 'unitId', 'unitCode', 'engineVersion', 'inUnits', 'hasTerms', 'arrangement', 'fixedRentAmount',
  'firstBookingId', 'row', 'noUnit', 'dash', 'statement', 'stale', 'cleanRev', 'marks', 'computedAt', 'computedBy'];

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const FIRST = 8;   // the Dashboard shows 8 items of Needs attention

// The property's month summary, added up from its unit summaries.
export function propertySummary(unitSums) {
  const s = unitSums.filter(Boolean);
  const inUnits = s.filter(u => u.inUnits);
  const items = s.flatMap(u => u.dash.items).sort(byId);
  const negs = s.filter(u => u.dash.negText).map(u => ({ id: `${u.unitId}_${u.month}`, text: u.dash.negText })).sort(byId);
  const setup = s.filter(u => u.dash.setupText).map(u => ({ id: u.unitId, text: u.dash.setupText })).sort(byId);
  const recent = s.flatMap(u => u.dash.recent).sort((a, b) => (b.date || '').localeCompare(a.date || '') || byId(a, b)).slice(0, 5);
  const done = s.filter(u => u.dash.completed);
  return {
    version: SUMMARY_VERSION,
    unitCount: inUnits.length,
    // Portfolio list: each unit's arrangement for the month
    units: inUnits.map(u => ({ id: u.unitId, unitCode: u.unitCode, hasTerms: u.hasTerms, arrangement: u.arrangement, fixedRentAmount: u.fixedRentAmount })).sort(byId),
    bookings: s.reduce((t, u) => t + u.dash.bookings, 0),
    income: s.reduce((t, u) => t + u.dash.income, 0),
    expenses: s.reduce((t, u) => t + u.dash.expenses, 0),
    statementsDone: done.length,
    balToPay: done.map(u => u.dash.payout).filter(p => p > 0).reduce((t, p) => t + p, 0),
    byStatus: {
      fixedRent: inUnits.filter(u => u.arrangement === 'fixedRent').length,
      draft: inUnits.filter(u => !u.dash.completed).length,
      negative: done.filter(u => u.dash.payout < 0).length,
      estimated: s.filter(u => !isNone(u.unitId) && u.dash.ctripMissing > 0).length,
      completed: done.length
    },
    noUnitCtrip: s.some(u => isNone(u.unitId) && u.dash.ctripMissing > 0),   // counts once as an "Estimated" unit, as before
    items: items.slice(0, FIRST), itemCount: items.length,
    negatives: negs.slice(0, FIRST), negativeCount: negs.length,
    setup,                                              // every unit not set up (the Director's "Waiting on Director" lists them all)
    recent,
    staleUnits: []
  };
}

// Several properties' summaries as one (Dashboard "All properties").
export function combine(sums) {
  const s = sums.filter(Boolean);
  const cat = k => s.flatMap(x => x[k]);
  const sum = k => s.reduce((t, x) => t + x[k], 0);
  return {
    unitCount: sum('unitCount'), bookings: sum('bookings'), income: sum('income'), expenses: sum('expenses'),
    statementsDone: sum('statementsDone'), balToPay: sum('balToPay'),
    byStatus: Object.fromEntries(['fixedRent', 'draft', 'negative', 'estimated', 'completed'].map(k => [k, s.reduce((t, x) => t + x.byStatus[k], 0)])),
    noUnitCtrip: s.some(x => x.noUnitCtrip),
    items: cat('items').sort(byId).slice(0, FIRST), itemCount: sum('itemCount'),
    negatives: cat('negatives').sort(byId).slice(0, FIRST), negativeCount: sum('negativeCount'),
    setup: cat('setup').sort(byId),
    recent: cat('recent').sort((a, b) => (b.date || '').localeCompare(a.date || '') || byId(a, b)).slice(0, 5)
  };
}

// Month-end rows and checklist from the unit summaries (same order and wording as before).
export function monthEndFromSummaries(unitSums, month) {
  const s = unitSums.filter(Boolean);
  const withRow = s.filter(u => u.row);
  const drafts = withRow.filter(u => u.row.status !== 'completed')
    // the order the drafts were made in: units with a record by unit code, then units seen only in bookings
    .sort((a, b) => (a.inUnits === b.inUnits ? 0 : a.inUnits ? -1 : 1) || (a.inUnits ? byUnit(a.unitCode, b.unitCode) || byId({ id: a.unitId }, { id: b.unitId }) : byId({ id: a.firstBookingId }, { id: b.firstBookingId })))
    .map(u => u.row);
  const done = withRow.filter(u => u.row.status === 'completed').map(u => u.row);
  const rows = [...drafts, ...done].sort((a, b) => byUnit(a.unitCode, b.unitCode));
  const activeCount = s.reduce((t, u) => t + u.dash.bookings, 0);
  const noUnit = s.filter(u => isNone(u.unitId)).flatMap(u => u.noUnit || []);
  return { rows, drafts, doneCount: done.length, activeCount, noUnit };
}

export const sortUnits = list => [...list].sort((a, b) => byUnit(a.unitCode, b.unitCode));
