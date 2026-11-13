// Shared by Operations > Offline Inquiries (pages/Operations/SalesLeads.vue) and the Reservation Lodgment Form
// (pages/Operations/booking-forms/ReservationForm.vue). Moved here unchanged from SalesLeads.vue on 4 Nov 2026.
import { collectionGroup, doc, getDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';

export const STATUS = { new: ['New', 'blue'], interested: ['Interested (Pending payment)', 'green'], considering: ['Considering', 'amber'], uninterested: ['Uninterested', 'grey'],
  booked: ['Paid · Booked', 'accent'] };
export const CONTACT_ALL = ['director', 'finance'];
export const DIRECT_BOOKERS = ['director', 'finance', 'operations'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const localIso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
export const nowIso = () => localIso(new Date());
export const isoOf = t => (t?.toDate ? localIso(t.toDate()) : typeof t === 'string' ? t : '');
export const num = (prefix, n) => `${prefix}-${String(n).padStart(4, '0')}`;
export const phoneKey = p => { const n = String(p || '').replace(/\D/g, ''); return n.startsWith('0') ? '6' + n : n; };
export const searchWords = name => [...new Set(String(name || '').toLowerCase().split(/\s+/).filter(Boolean)
  .flatMap(w => Array.from({ length: Math.max(0, w.length - 1) }, (_, i) => w.slice(0, i + 2))))];

// A returning tenant is found by their phone number (phoneKey on tenants/{id}/private/main)
export async function findTenant(phone) {
  const k = phoneKey(phone);
  if (k.length < 9) return null;
  const snap = await getDocs(query(collectionGroup(db, 'private'), where('kind', '==', 'tenant'), where('phoneKey', '==', k), limit(5)));
  const hit = snap.docs.find(d => d.ref.path.startsWith('tenants/'));
  return hit ? { id: hit.ref.path.split('/')[1], ...hit.data() } : null;
}
// Tenants whose name starts with what was typed (13 Nov 2026, Reservation form). One query on the first word's
// searchWords prefix (needs the private kind + searchWords index), then every typed word must match a name word.
export async function findTenantsByName(text, max = 8) {
  const words = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length || words[0].length < 2) return [];
  const snap = await getDocs(query(collectionGroup(db, 'private'), where('kind', '==', 'tenant'), where('searchWords', 'array-contains', words[0].slice(0, 20)), limit(20)));
  return snap.docs.filter(d => d.ref.path.startsWith('tenants/'))
    .map(d => ({ id: d.ref.path.split('/')[1], ...d.data() }))
    .filter(t => { const have = String(t.name || '').toLowerCase().split(/\s+/); return words.every(w => have.some(h => h.startsWith(w))); })
    .slice(0, max);
}
export const privateOf = async ref => { const s = await getDoc(doc(ref, 'private', 'main')); return s.exists() ? s.data() : {}; };
