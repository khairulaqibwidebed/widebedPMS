// lib/property-scope.js (12 Nov 2026, data access Phase 3, by PROPERTY): staff see only the properties on their staff
// record (users/{uid}.properties, a list of property ids set on Settings > Staff). Directors see everything.
//
//   myProperties()             null for a Director (no filter), else the list of ids (['__none__'] when empty, so lists
//                              come back empty instead of failing: Firestore refuses an empty `in`).
//   scoped(q, field, opts)     the query with "only my properties" added. Returns a LIST of queries: Firestore takes at
//                              most 30 values in one `in`, so a person with more properties gets one query per 30.
//                              field: 'propertyId' (default), 'propertyIds' (a list on the record: owners, tenants,
//                              eZee uploads) or '__id' (the document id, for properties themselves).
//                              opts.per: values per query when the query already has another `in` of n values
//                              (Firestore allows 30 combinations in all): per = Math.floor(30 / n).
//   getScoped(qs, opts)        getDocs for that list, merged into one snapshot-like { docs, size, empty, forEach }.
//                              opts.order = ['createdAt', 'desc'] and opts.limit re-sort and cut after merging.
//   countScoped(qs)            getCountFromServer for that list, added up.
//   mine(rows, field)          keep only my properties' rows (for lists read some other way).
//   canSee(propertyId)         is this property one of mine?
//
// Dev only (npm run dev): guard(q) warns in the console when a non-Director runs a list query on a property-linked
// collection without a propertyId / propertyIds / id filter. use-live listen() calls it; so do getScoped and docsOf.
import { query, where, documentId, getDocs, getCountFromServer, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';

export const NO_PROPERTY = '__none__';
const LIMIT = 30;

const session = () => { try { return useSession(); } catch (_) { return null; } };
export const isDirectorMe = (me = session()) => me?.role === 'director';

export function myProperties(me = session()) {
  if (!me || me.role === 'director') return null;
  const list = [...new Set((Array.isArray(me.properties) ? me.properties : []).filter(Boolean))];
  return list.length ? list : [NO_PROPERTY];
}
export const canSee = (propertyId, me = session()) => { const m = myProperties(me); return !m || m.includes(propertyId); };
export const mine = (rows, field = 'propertyId', me = session()) => {
  const m = myProperties(me); if (!m) return rows || [];
  const set = new Set(m);
  return (rows || []).filter(r => (Array.isArray(r?.[field]) ? r[field].some(id => set.has(id)) : set.has(r?.[field])));
};

// Someone (not a Director) who adds a property gets it on their own list straight away (Khairul 12 Nov 2026), so it
// doesn't vanish after saving. This session sees it at once; the staff record is updated too, which the rules allow
// from Draft 0.59 (until then the save is refused quietly and a Director adds it on Settings > Staff).
export async function giveMeProperties(ids, me = session()) {
  const add = [...new Set((ids || []).filter(Boolean))];
  if (!me || me.role === 'director' || !add.length) return;
  me.properties = [...new Set([...(me.properties || []), ...add])];
  try { await updateDoc(doc(db, 'users', me.user.uid), { properties: arrayUnion(...add) }); }
  catch (e) { console.warn('Could not add the new property to your staff record (rules Draft 0.59 needed):', e.code || e.message); }
}

const chunks = (list, n) => { const out = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; };

export function scoped(q, field = 'propertyId', { per = LIMIT, me = session() } = {}) {
  const m = myProperties(me);
  if (!m) return [q];
  const path = field === '__id' ? documentId() : field;
  const op = field === 'propertyIds' ? 'array-contains-any' : 'in';
  return chunks(m, Math.max(1, Math.min(LIMIT, per))).map(ids => query(q, where(path, op, ids)));
}

// scoped() plus the records with no property yet (propertyId == ''), e.g. offline payments marked Unknown that someone
// still has to assign. Staff see those too, so they can fill them in.
export function scopedOrBlank(q, opts = {}) {
  const list = scoped(q, 'propertyId', opts);
  return myProperties(opts.me || session()) ? [...list, query(q, where('propertyId', '==', ''))] : list;
}

const toMs = v => (v?.toMillis ? v.toMillis() : v instanceof Date ? v.getTime() : v);
const cmp = (a, b) => (a == null ? (b == null ? 0 : -1) : b == null ? 1 : a < b ? -1 : a > b ? 1 : 0);
// Sort rows (or snapshots) by one field after merging several queries: order = ['createdAt', 'desc']
export function sortMerged(list, order, get = (x, f) => x?.[f]) {
  if (!order) return list;
  const [f, dir] = order, s = dir === 'desc' ? -1 : 1;
  return [...list].sort((a, b) => s * cmp(toMs(get(a, f)), toMs(get(b, f))));
}

// getDocs for a list of queries (from scoped). Looks like a QuerySnapshot to the code that reads it.
export async function getScoped(qs, { order = null, limit = 0 } = {}) {
  const list = Array.isArray(qs) ? qs : [qs];
  list.forEach(guard);
  const snaps = await Promise.all(list.map(q => getDocs(q)));
  if (snaps.length === 1 && !order && !limit) return snaps[0];
  const seen = new Set(); let docs = [];
  for (const s of snaps) for (const d of s.docs) if (!seen.has(d.id)) { seen.add(d.id); docs.push(d); }
  if (snaps.length > 1) docs = sortMerged(docs, order, (d, f) => d.get(f));
  if (limit) docs = docs.slice(0, limit);
  return { docs, size: docs.length, empty: !docs.length, forEach: fn => docs.forEach(fn) };
}
// getCountFromServer for a list of queries, added up. (array-contains-any groups can count a record twice when it
// lists properties from two groups: only for people with more than 30 properties; good enough for a dashboard count.)
export async function countScoped(qs) {
  const list = Array.isArray(qs) ? qs : [qs];
  list.forEach(guard);
  const counts = await Promise.all(list.map(q => getCountFromServer(q)));
  return counts.reduce((s, c) => s + (c.data().count || 0), 0);
}
// A plain getDocs with the dev guard (for queries that are already limited to one of my properties)
export function docsOf(q) { guard(q); return getDocs(q); }

// ---------- dev guard ----------
// Collections whose records belong to a property. A list query on one of these by a non-Director must filter on
// propertyId, propertyIds or the id. Child collections (terms, replies...) are read per parent and are not listed.
export const PROPERTY_LINKED = new Set(['properties', 'units', 'owners', 'bookings', 'offlineBookings', 'offlinePayments', 'utilityBills',
  'statements', 'approvals', 'months', 'unitMonths', 'expenses', 'payoutHistory', 'importBatches', 'issueQuotes', 'tenants']);
const SCOPE_FIELDS = new Set(['propertyId', 'propertyIds', '__name__']);
const warned = new Set();
function filterFields(f, out = []) {
  if (!f) return out;
  if (f.field?.segments) out.push(f.field.segments.join('.'));
  (f.filters || []).forEach(x => filterFields(x, out));
  return out;
}
export function guard(q) {
  if (!import.meta.env.DEV || !q || q.type === 'document' || isDirectorMe()) return;
  try {
    const inner = q._query; if (!inner) return;
    const coll = inner.collectionGroup || inner.path?.segments?.[inner.path.segments.length - 1];
    if (!PROPERTY_LINKED.has(coll)) return;
    const fields = (inner.filters || []).flatMap(f => filterFields(f));
    if (fields.some(f => SCOPE_FIELDS.has(f))) return;
    const where = new Error().stack?.split('\n').slice(2, 4).join(' | ') || '';
    const key = coll + where;
    if (warned.has(key)) return; warned.add(key);
    console.warn(`[property-scope] Not scoped: a list query on "${coll}" has no propertyId filter. Use scoped().`, where);
  } catch (_) { /* never break a page over a dev check */ }
}
