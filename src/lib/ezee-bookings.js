// lib/ezee-bookings.js (24 Nov 2026): eZee bookings (the `bookings` collection, the one Month-end pays from) for
// Portfolio > Bookings > eZee bookings. Read only here: they are added, changed and cancelled by Upload eZee report and
// Bulk Upload (New bookings / Cancel bookings / Monthly check). Bookings are kept under their check-out month
// (departureMonth), so they are read by month.
import { collection, doc, getDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { scoped, getScoped, myProperties } from '@/lib/property-scope.js';
import { monthOffset } from '@/lib/format.js';

const chunks = (list, n) => { const out = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; };

// The months read when none is picked: two before this month to three after (6 check-out months)
export const defaultEzeeMonths = () => [-2, -1, 0, 1, 2, 3].map(monthOffset);

// propertyId: one property id or 'all'. months: 'YYYY-MM' check-out months (at most 60).
export async function loadEzeeBookings(propertyId, months) {
  const col = collection(db, 'bookings'), list = [...new Set(months)].slice(0, 60);
  const found = new Map();
  if (propertyId !== 'all') {
    for (const m of chunks(list, 30)) {
      const snap = await getScoped(query(col, where('propertyId', '==', propertyId), where('departureMonth', 'in', m)));
      snap.docs.forEach(d => found.set(d.id, { id: d.id, ...d.data() }));
    }
  } else {
    // Staff see only their own properties: 30 combinations per query, so 10 months x 3 properties at a time
    const step = myProperties() ? 10 : 30;
    for (const m of chunks(list, step)) {
      const snap = await getScoped(scoped(query(col, where('departureMonth', 'in', m)), 'propertyId', { per: Math.floor(30 / m.length) }));
      snap.docs.forEach(d => found.set(d.id, { id: d.id, ...d.data() }));
    }
  }
  // Rows retired when a reservation was split into one booking per room are not real bookings
  return [...found.values()].filter(b => b.supersededBy !== 'split rows')
    .sort((a, b) => (b.arrival || '').localeCompare(a.arrival || '') || String(a.unitCode || '').localeCompare(String(b.unitCode || '')));
}

// The guest's name (bookings/{id}/private/main). '' when it can't be read (Accounting, Directors and Bookings Full can).
export async function loadEzeeGuest(id) {
  try { const s = await getDoc(doc(db, 'bookings', id, 'private', 'main')); return s.exists() ? s.data().guestName || '' : ''; } catch { return ''; }
}

// Where a booking came from, for the list: the last upload that wrote it
export function viaLabel(b) {
  return { daily: 'Daily upload', month: 'Monthly check', report: 'Upload eZee report' }[b.uploadedVia] || (b.importBatchId ? 'eZee upload' : '—');
}

const overlap = (a1, d1, a2, d2) => !!(a1 && d1 && a2 && d2 && a1 < d2 && a2 < d1);
// Clashes in what is on screen: two active bookings in the same room on the same night (eZee with eZee, or eZee with an
// offline booking). Returns Map(eZee booking id -> [{ kind, ref }]).
export function findClashes(ezee, offline = []) {
  const live = ezee.filter(b => b.status !== 'cancelled' && !b.removedByHand && b.unitId);
  const off = offline.filter(o => o.status !== 'cancelled' && o.unitId);
  const out = new Map(), add = (id, w) => { if (!out.has(id)) out.set(id, []); out.get(id).push(w); };
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j];
      if (a.unitId === b.unitId && a.reservationNo !== b.reservationNo && overlap(a.arrival, a.departure, b.arrival, b.departure)) {
        add(a.id, { kind: 'eZee', ref: b.reservationNo || b.id }); add(b.id, { kind: 'eZee', ref: a.reservationNo || a.id });
      }
    }
    for (const o of off) {
      const same = o.ezeeReservationNo && o.ezeeReservationNo === a.reservationNo;
      if (!same && o.unitId === a.unitId && overlap(a.arrival, a.departure, o.arrival, o.departure)) add(a.id, { kind: 'offline', ref: o.bookingNo || o.id });
    }
  }
  return out;
}
