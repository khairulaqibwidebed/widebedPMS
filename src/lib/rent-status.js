// Rent status (20 Nov 2026, Khairul): which units are Tenanted today, by the same rule as a property's Units tab
// (Portfolio > Properties > property > Units, "Rent status"): a unit is Tenanted when an eZee or offline booking
// covers today (arrival on or before today, departure after today); cancelled and removed-by-hand bookings are
// left out. Every other unit is Vacant. Reads eZee bookings by propertyId + departureMonth (this month and the
// next 29, no new index) and the property's offline bookings.
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { dayOffset } from '@/lib/format.js';

// Set of unit ids with a booking today, for one property. Throws if the bookings can't be read.
export async function tenantedUnitIds(propertyId, today = dayOffset(0)) {
  const months = []; let y = +today.slice(0, 4), m = +today.slice(5, 7);
  for (let i = 0; i < 30; i++) { months.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  const read = q => getDocs(q).then(s => s.docs.map(d => d.data()));
  const [ez, off] = await Promise.all([
    read(query(collection(db, 'bookings'), where('propertyId', '==', propertyId), where('departureMonth', 'in', months))),
    read(query(collection(db, 'offlineBookings'), where('propertyId', '==', propertyId)))]);
  const ids = new Set();
  for (const b of [...ez, ...off]) {
    if (!b.unitId || b.status === 'cancelled' || b.removedByHand || !b.arrival || !b.departure) continue;
    if (b.arrival <= today && b.departure > today) ids.add(b.unitId);
  }
  return ids;
}
