// Every offline booking this person may see, for the booking search on the Utility Lodgment Form and the offline payment
// form (23 Nov 2026, Khairul): past, current, upcoming, Awaiting payment and cancelled, with no 300 cut-off. Only the
// person's properties (lib/property-scope.js). Read once and kept for 5 minutes on this page visit; the guest names
// (private) are read in the background and kept for the visit, so typing a name finds the booking once they are in.
import { reactive } from 'vue';
import { collection, query } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { scoped, getScoped } from '@/lib/property-scope.js';
import { loadGuestName } from '@/lib/portfolio-data.js';

export const guestNames = reactive({});   // bookingId -> name ('' when none / not allowed)
let kept = null, keptAt = 0, inflight = null;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function stayStatus(b, day = today()) {
  if (b.status === 'cancelled') return 'Cancelled';
  if (b.status === 'pending') return 'Awaiting payment';
  if ((b.departure || '') < day) return 'Past';
  if ((b.arrival || '') > day) return 'Upcoming';
  return 'Current';
}
const ORDER = { Current: 0, Upcoming: 1, 'Awaiting payment': 2, Past: 3, Cancelled: 4 };

export async function loadAllBookings(force = false) {
  if (!force && kept && Date.now() - keptAt < 5 * 60 * 1000) return kept;
  if (inflight) return inflight;
  inflight = (async () => {
    const snap = await getScoped(scoped(query(collection(db, 'offlineBookings'))));
    const day = today();
    kept = snap.docs.map(d => ({ id: d.id, ...d.data() })).map(b => ({ ...b, stay: stayStatus(b, day) }))
      .sort((a, b) => ORDER[a.stay] - ORDER[b.stay] || String(b.arrival || '').localeCompare(String(a.arrival || '')));
    keptAt = Date.now();
    fillNames(kept);
    return kept;
  })().finally(() => { inflight = null; });
  return inflight;
}
// Names in groups of 25 so the list fills in quickly
async function fillNames(list) {
  const need = list.filter(b => !(b.id in guestNames));
  for (let i = 0; i < need.length; i += 25) {
    await Promise.all(need.slice(i, i + 25).map(async b => { guestNames[b.id] = await loadGuestName(b); }));
  }
}
export const forgetBookings = () => { kept = null; };
// Search text: name, booking no., unit, property
export const bookingText = b => [guestNames[b.id], b.bookingNo, b.unitCode || b.unitId, b.propertyName, b.id].filter(Boolean).join(' ').toLowerCase();
