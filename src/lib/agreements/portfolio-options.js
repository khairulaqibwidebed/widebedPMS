// lib/agreements/portfolio-options.js — property and unit lists for the Agreements "pick from Portfolio" field types.
// Read-only: reuses the same `properties`/`units` collections Finance and Portfolio already read from,
// so an agreement's property/unit answer always matches a real Portfolio record instead of being free-typed.
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';

let propCache = null, unitCache = null;

// [{ value: 'D\'Majestic Suites' }, ...] — sorted by name.
export async function loadPropertyOptions() {
  if (propCache) return propCache;
  const snap = await getDocs(collection(db, 'properties'));
  propCache = snap.docs.map(d => ({ value: d.data().name || d.id }))
    .sort((a, b) => a.value.localeCompare(b.value));
  return propCache;
}

// [{ value: 'DM-1507', hint: 'D\'Majestic Suites' }, ...] — sorted by unit code, with the property name as the hint.
export async function loadUnitOptions() {
  if (unitCache) return unitCache;
  const [propSnap, unitSnap] = await Promise.all([getDocs(collection(db, 'properties')), getDocs(collection(db, 'units'))]);
  const nameOf = Object.fromEntries(propSnap.docs.map(d => [d.id, d.data().name || d.id]));
  unitCache = unitSnap.docs.map(d => ({ value: d.data().unitCode || d.id, hint: nameOf[d.data().propertyId] || '' }))
    .sort((a, b) => a.value.localeCompare(b.value));
  return unitCache;
}
