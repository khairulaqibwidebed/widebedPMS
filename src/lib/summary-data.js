// Reads and writes the month summaries (summaries.js explains them). Every page that changes an input of the payout
// engine calls markDirty / markFrom in the SAME batch as the change, so a summary can never look fresh after a change.
import { db } from './firebase.js';
import { collection, doc, getDoc, getDocFromCache, getDocs, query, where, increment, serverTimestamp, writeBatch } from 'firebase/firestore';
import { loadSetup, latestVersion } from './finance-data.js';
import { SUMMARY_VERSION, unitSummary, propertySummary, marksFor, dirtyFor, markedUnits, noneId, isNone, unitMonthId, markKey, UNIT_FIELDS }
  from './summaries.js';
import { byUnit } from './engine.js';

// ---------- marking (inside the caller's batch) ----------
// One or more unit-months of one property changed (a booking, a Ctrip amount, an expense, a statement).
// unitId null = a booking with no unit (the property's pseudo unit).
export function markDirty(batch, propertyId, month, unitIds) {
  const ids = [...new Set(unitIds.map(u => u || noneId(propertyId)))];
  if (!propertyId || !month || !ids.length) return;
  for (const u of ids)
    batch.set(doc(db, 'unitMonths', unitMonthId(u, month)), { propertyId, month, unitId: u, dirtyRev: increment(1), stale: true }, { merge: true });
  batch.set(doc(db, 'properties', propertyId), { summaryDirty: { [month]: increment(ids.length) } }, { merge: true });
}
// A change that applies from a month on: unit terms (unitId given) or a property rate version (unitId null).
// from = ALL_MONTHS for a unit added or edited (owner, unit code, switched on/off).
export function markFrom(batch, propertyId, from, unitId = null) {
  if (!propertyId || !from) return;
  batch.set(doc(db, 'properties', propertyId), { summaryMarks: { [markKey(from, unitId)]: increment(1) } }, { merge: true });
}

// ---------- reading ----------
const data = s => (s.exists() ? s.data() : null);
const valid = (sum, property, month) => !!sum && sum.version === SUMMARY_VERSION
  && sum.rev?.dirty === dirtyFor(property, month) && sum.rev?.marks === marksFor(property, month);

// The month document, from this browser's saved copy when its summary is still the current one (no read),
// otherwise from the server. The counters on the property document say whether the copy is current: any change
// to the month (a unit completed or reopened, a booking, an expense...) moves them, so an old copy is never used.
export async function readMonthDoc(property, month) {
  const ref = doc(db, 'months', `${property.id}_${month}`);
  try {
    const c = await getDocFromCache(ref);
    if (c.exists() && valid(c.data().summary, property, month)) return { data: c.data(), cached: true };
  } catch (_) { /* not in this browser yet */ }
  return { data: data(await getDoc(ref)), cached: false };
}

export async function loadUnitMonths(propertyId, month) {
  const snap = await getDocs(query(collection(db, 'unitMonths'), where('propertyId', '==', propertyId), where('month', '==', month)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Is this unit summary the current one? 'data' = work it out again, 'marks' = a completed unit whose statement
// can't have changed (only a terms or rate change came in): just note the new counters.
function unitState(um, property, month) {
  if (!um || um.engineVersion !== SUMMARY_VERSION || !um.dash) return 'data';
  if ((um.dirtyRev || 0) !== (um.cleanRev || 0)) return 'data';
  if ((um.marks || 0) !== marksFor(property, month, um.unitId)) return um.row?.status === 'completed' && um.statement?.status === 'completed' ? 'marks' : 'data';
  return 'ok';
}

const group = (list, key) => { const m = new Map(); for (const x of list) { const k = x[key] || null; if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
const docs = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));

// The full data of a whole property-month, as Month-end payout used to read it.
async function readProperty(propertyId, month) {
  const [setup, bk, ex, st] = await Promise.all([
    loadSetup(propertyId, month),
    getDocs(query(collection(db, 'bookings'), where('propertyId', '==', propertyId), where('departureMonth', '==', month))),
    getDocs(query(collection(db, 'expenses'), where('propertyId', '==', propertyId), where('month', '==', month))),
    getDocs(query(collection(db, 'statements'), where('propertyId', '==', propertyId), where('month', '==', month)))
  ]);
  return { setup, bookings: docs(bk), expenses: docs(ex), statements: docs(st) };
}

// One unit's data for the month (a few reads), for a stale summary or an opened statement.
// getStatement: how to read the statement (Month-end passes a cache-first read for a completed one).
export async function readUnit(propertyId, month, unitId, rateVersions, getStatement = null) {
  const none = isNone(unitId);
  const [u, terms, bk, ex, st, rv] = await Promise.all([
    none ? null : getDoc(doc(db, 'units', unitId)),
    none ? null : getDocs(collection(db, 'units', unitId, 'terms')),
    getDocs(none ? query(collection(db, 'bookings'), where('propertyId', '==', propertyId), where('departureMonth', '==', month), where('unitId', '==', null))
      : query(collection(db, 'bookings'), where('unitId', '==', unitId), where('departureMonth', '==', month))),
    none ? { docs: [] } : getDocs(query(collection(db, 'expenses'), where('unitId', '==', unitId), where('month', '==', month))),
    none ? null : (getStatement || getDoc)(doc(db, 'statements', `${unitId}_${month}`)),
    rateVersions ? null : getDocs(collection(db, 'properties', propertyId, 'rateVersions'))
  ]);
  let unit = u && u.exists() ? { id: unitId, ...u.data() } : null;
  // Same unit list as loadUnits: this property's units that are switched on
  if (unit && (unit.propertyId !== propertyId || unit.active === false)) unit = null;
  if (unit) { unit.termHistory = docs(terms); unit.terms = latestVersion(unit.termHistory, month); }
  const versions = rateVersions || docs(rv);
  return { unit, rateVersions: versions, propertyRates: latestVersion(versions, month),
    bookings: docs(bk).filter(b => b.propertyId === propertyId), expenses: docs(ex).filter(e => e.propertyId === propertyId), statement: st && st.exists() ? { id: st.id, ...st.data() } : null };
}

function stamp(sum, um, property, month, me) {
  return { ...sum, cleanRev: um?.dirtyRev || 0, marks: marksFor(property, month, sum.unitId), stale: false,
    computedAt: serverTimestamp(), computedBy: me?.user?.uid || null };
}
const same = (a, b) => !!b && UNIT_FIELDS.every(k => k === 'computedAt' || k === 'computedBy' || JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));

// The property's month: its summary, and (unitSummaries: true) every unit summary. Stale or missing summaries are
// worked out again from the full data with the engine, for just those units (or the whole property when many are),
// and written back when the person may (Finance / Director); anyone else gets the fresh figures without the write.
export async function propertyMonth(property, month, { me = null, canWrite = false, unitSummaries = false } = {}) {
  const { data: m } = await readMonthDoc(property, month);
  const fresh = valid(m?.summary, property, month);
  if (fresh && !unitSummaries) return { month: m || {}, summary: m.summary, units: null };
  const ums = await loadUnitMonths(property.id, month);
  if (fresh) return { month: m || {}, summary: m.summary, units: ums };

  const byIdUm = new Map(ums.map(u => [u.unitId, u]));
  const states = new Map(ums.map(u => [u.unitId, unitState(u, property, month)]));
  for (const u of markedUnits(property, month)) if (!byIdUm.has(u)) states.set(u, 'data');   // e.g. a unit added on Portfolio
  const needData = [...states].filter(([, s]) => s === 'data').map(([u]) => u);
  const whole = !m?.summary || m.summary.version !== SUMMARY_VERSION || needData.length > Math.max(6, ums.length / 2);

  const out = new Map();   // unitId -> summary to keep (fresh or unchanged)
  if (whole) {
    const all = await readProperty(property.id, month);
    const units = new Map(all.setup.units.map(u => [u.id, u]));
    const bk = group(all.bookings, 'unitId'), ex = group(all.expenses, 'unitId');
    const st = new Map(all.statements.map(s => [s.unitId, s]));
    const ids = new Set([...units.keys(), ...bk.keys(), ...ex.keys(), ...st.keys(), ...byIdUm.keys()]);
    ids.delete(null); ids.delete(undefined);
    if (bk.has(null) || byIdUm.has(noneId(property.id))) ids.add(noneId(property.id));
    for (const id of ids) {
      out.set(id, unitSummary({ propertyId: property.id, month, unitId: id, unit: units.get(id) || null, propertyRates: all.setup.rates,
        bookings: isNone(id) ? (bk.get(null) || []) : (bk.get(id) || []), expenses: ex.get(id) || [], statement: st.get(id) || null }));
    }
  } else {
    let versions = null;
    for (const [u, s] of states) {
      if (s === 'ok') out.set(u, byIdUm.get(u));
      else if (s === 'marks') out.set(u, { ...byIdUm.get(u), _bump: true });
    }
    for (const u of needData) {
      const d = await readUnit(property.id, month, u, versions);
      versions = d.rateVersions;
      out.set(u, unitSummary({ propertyId: property.id, month, unitId: u, unit: d.unit, propertyRates: d.propertyRates,
        bookings: d.bookings, expenses: d.expenses, statement: d.statement }));
    }
  }

  // Write back what changed, then the property summary that adds them up
  const final = [];
  const writes = [];
  for (const [u, s] of out) {
    const um = byIdUm.get(u);
    const isOld = s === um;
    if (isOld) { final.push(s); continue; }
    const { _bump, ...clean } = s;
    const next = stamp(_bump ? Object.fromEntries(UNIT_FIELDS.map(k => [k, clean[k] ?? null])) : clean, um, property, month, me);
    final.push(next);
    if (!same(next, um)) writes.push(next);
  }
  const summary = { ...propertySummary(final), rev: { dirty: dirtyFor(property, month), marks: marksFor(property, month) }, computedAt: serverTimestamp() };
  if (canWrite) {
    const all = [...writes.map(s => [doc(db, 'unitMonths', unitMonthId(s.unitId, month)), s, UNIT_FIELDS]),
      [doc(db, 'months', `${property.id}_${month}`), { propertyId: property.id, month, summary }, ['propertyId', 'month', 'summary']]];
    for (let i = 0; i < all.length; i += 400) {
      const b = writeBatch(db);
      for (const [ref, d, fields] of all.slice(i, i + 400)) b.set(ref, d, { mergeFields: fields });
      await b.commit();
    }
  }
  const units = final.filter(Boolean).sort((a, b) => byUnit(a.unitCode || '', b.unitCode || ''));
  return { month: { ...(m || {}), propertyId: property.id, month, summary }, summary, units };
}

// The person can write summaries back (the rules say the same).
export const canWriteSummaries = me => ['director', 'finance'].includes(me?.role);
