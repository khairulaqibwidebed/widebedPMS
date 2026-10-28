// Firestore reads and writes shared by Upload eZee report, Expenses and Month-end payout.
import { db } from './firebase.js';
import { collection, doc, getDoc, getDocs, query, where, serverTimestamp }
  from 'firebase/firestore';
import { byUnit } from './engine.js';
import { cached, TTL } from './cache.js';
import { noteQuotaError, resetTime } from './quota.js';

// Properties and units are kept for a while (lib/cache.js). Whatever page saves one calls clearCache().
export function loadProperties() {
  return cached('properties', TTL.long, async () => {
    const snap = await getDocs(collection(db, 'properties'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

// Latest version whose effectiveFrom is on or before the month. Several versions in the same
// month: the newest one wins, so a same-month correction is just another document.
export function latestVersion(versions, month) {
  return versions
    .filter(v => (v.effectiveFrom || '') <= month)
    .sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || '') || stampMs(b.createdAt) - stampMs(a.createdAt))[0] || null;
}
const stampMs = t => (t?.toMillis ? t.toMillis() : 0);

export function loadUnits(propertyId) {
  return cached(`units:${propertyId}`, TTL.mid, async () => {
    const snap = await getDocs(query(collection(db, 'units'), where('propertyId', '==', propertyId)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active !== false).sort((a, b) => byUnit(a.unitCode, b.unitCode));
  });
}

// Units with every terms version (so the settings panel can show history), plus the property rate version for the month.
export async function loadSetup(propertyId, month) {
  const [units, rateSnap] = await Promise.all([
    loadUnits(propertyId).then(list => list.map(u => ({ ...u }))),   // copies: terms are added below, and the saved list is shared
    getDocs(collection(db, 'properties', propertyId, 'rateVersions'))
  ]);
  const termSnaps = await Promise.all(units.map(u => getDocs(collection(db, 'units', u.id, 'terms'))));
  units.forEach((u, i) => {
    u.termHistory = termSnaps[i].docs.map(d => ({ id: d.id, ...d.data() }));
    u.terms = latestVersion(u.termHistory, month);
  });
  const rates = latestVersion(rateSnap.docs.map(d => ({ id: d.id, ...d.data() })), month);
  return { units, rates };
}

export async function monthDoc(propertyId, month) {
  const m = await getDoc(doc(db, 'months', `${propertyId}_${month}`));
  return m.exists() ? m.data() : { status: 'open' };
}

// Completion is per unit (Khairul, Oct 2026): statements/{unitId}_{month} with status 'completed'.
// The months/{propertyId}_{month} document is only a summary: 'open', 'partial' or 'completed' (every unit done).
export const statementId = (unitId, month) => `${unitId}_${month}`;
// Units whose statement can't change this month: completed, or sent to the Director and frozen until they decide.
export async function completedUnitIds(propertyId, month) {
  const [snap, sent] = await Promise.all([
    getDocs(query(collection(db, 'statements'), where('propertyId', '==', propertyId), where('month', '==', month))),
    getDocs(query(collection(db, 'approvals'), where('propertyId', '==', propertyId), where('month', '==', month)))
  ]);
  const ids = snap.docs.map(d => d.data()).filter(s => s.status === 'completed').map(s => s.unitId);
  for (const d of sent.docs) if (d.data().status === 'submitted') ids.push(d.data().unitId);
  return new Set(ids);
}
// Summary status for the month document, from the units that have a statement this month.
export function monthSummary(unitIds, doneIds) {
  const done = unitIds.filter(id => doneIds.has(id));
  return { status: !done.length ? 'open' : done.length === unitIds.length ? 'completed' : 'partial',
    completedUnits: done.length, unitCount: unitIds.length, completedUnitIds: done };
}

export async function loadExpenses(propertyId, month) {
  const snap = await getDocs(query(collection(db, 'expenses'), where('propertyId', '==', propertyId), where('month', '==', month)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function loadBookings(propertyId, month) {
  const snap = await getDocs(query(collection(db, 'bookings'), where('propertyId', '==', propertyId), where('departureMonth', '==', month)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Every change goes in the audit log (SEC-03).
export function audit(batch, me, { action, entity, propertyId = null, month = null, changes = [], reason = '' }) {
  batch.set(doc(collection(db, 'auditLog')), {
    at: serverTimestamp(), uid: me.user.uid, userName: me.name, role: me.role,
    action, entity, propertyId, month, changes, reason
  });
}

export function friendlyError(e, what) {
  console.error(e);
  if (noteQuotaError(e)) return `The free daily Firestore limit is used up, so nothing can load or save until it resets at about ${resetTime()}.`;
  if (e.code === 'permission-denied') return 'Firestore refused this. Check the latest security rules are deployed and your role is set.';
  if (e.code === 'failed-precondition') return 'Firestore needs an index for this. Open the browser console (F12) and click the link it gives.';
  if (e.code === 'unavailable') return 'No connection to Firestore. Check the internet and try again.';
  return `Could not ${what}: ${e.message || e}`;
}

// Plain file download (works on the real site; blocked only inside preview frames).
export function download(filename, data, type = 'text/csv') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export function toCSV(aoa) {
  return '﻿' + aoa.map(r => r.map(v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
}

// SheetJS (with cell styles), loaded only when a page needs to read or write xlsx.
export async function loadXlsxLib() {
  try { const m = await import('xlsx-js-style'); return m.default || m; }
  catch { throw new Error('Could not load the spreadsheet reader. Refresh the page and try again.'); }
}
