// Portfolio (Owners, Properties, Bookings): every Firestore read and write the Portfolio pages make, plus the
// constants and small helpers they share. The pages and drawers keep only screen logic and form checks.
// Moved out of the old single pages/Portfolio/Portfolio.vue on 4 Nov 2026; the reads and writes are unchanged.
import { markRaw } from 'vue';
import { setDoc, collection, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter, writeBatch, updateDoc, arrayUnion, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { ARRANGEMENTS, DEFAULT_OTA, DM_STARTER } from '@/lib/engine.js';
import { loadUnits, loadSetup, latestVersion, audit, friendlyError } from '@/lib/finance-data.js';
import { propertyMonth, markFrom, canWriteSummaries } from '@/lib/summary-data.js';
import { ALL_MONTHS } from '@/lib/summaries.js';
import { monthName } from '@/lib/format.js';
import { cached, clearCache, patchCache, TTL } from '@/lib/cache.js';

// ---------- constants ----------
export const MONTH_PAY = { paid: { label: 'Paid', cls: 'green' }, part: { label: 'Part paid', cls: 'amber' }, unpaid: { label: 'Unpaid', cls: 'red' } };
export const PRIVATE = ['fullName', 'ic', 'email', 'phone', 'dob', 'whatsapp', 'wechat', 'address', 'bankName', 'accountHolder', 'bankAccount'];
export const BANK = ['bankName', 'accountHolder', 'bankAccount'];
export const PROP_INFO = ['address', 'city', 'state', 'ezeeAccount', 'ezeeName'];
export const UNIT_INFO = ['type', 'bedrooms', 'bathrooms', 'sizeSqft', 'carParks', 'tnb', 'water', 'wifi', 'sewerage', 'jmb'];
export const STATES = ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
  'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya'];
export const UNIT_TYPES = ['Studio', '1 bedroom', '2 bedrooms', '3 bedrooms', 'Dual key', 'Penthouse', 'Other'];
export const UNIT_FILTERS = [{ key: 'all', label: 'All' }, { key: 'none', label: 'Not set up' }, { key: 'share', label: 'Profit share' }, { key: 'fixed', label: 'Fixed rent' }, { key: 'long', label: 'Long-term' }];
const AUDIT_PAGE = 30;
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------- small helpers ----------
export const pctIn = v => (v === '' || v == null ? null : Number(v) / 100);
export const pctOut = v => (v == null ? '' : +(v * 100).toFixed(4));
export const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
export const msOf = t => (t?.toMillis ? t.toMillis() : 0);
export const dateOnly = t => { if (!t) return ''; const d = t.toDate ? t.toDate() : new Date(t); return `${d.getDate()} ${MON3[d.getMonth()]} ${d.getFullYear()}`; };
export const prevMonth = ym => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const shortName = m => (m ? `${MON3[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}` : '');
export const monthOnly = m => monthName(m).split(' ')[0];
export const arrLabel = a => ARRANGEMENTS[a]?.label || (a ? a : 'Not set up');
export const arrangementOptions = () => [{ value: '', label: 'Not set up' }, ...Object.entries(ARRANGEMENTS).map(([k, a]) => ({ value: k, label: a.label }))];
// "3 fixed · 2 profit share · 1 not set up"
export function mixText(list) {
  const n = k => list.filter(x => x.terms?.arrangement === k).length;
  const share = list.filter(x => /profitShare/.test(x.terms?.arrangement || '')).length, none = list.filter(x => !x.terms).length;
  return [n('fixedRent') && `${n('fixedRent')} fixed`, share && `${share} profit share`, n('longTermTenant') && `${n('longTermTenant')} LT`, none && `${none} not set up`].filter(Boolean).join(' · ');
}
// View-only: "3 Studio · 2 1 bedroom" from each unit's type (no arrangement, it is in the terms).
export function typeText(list) {
  const n = {}; list.forEach(x => { const t = x.info?.type || 'Type not set'; n[t] = (n[t] || 0) + 1; });
  return Object.entries(n).map(([t, c]) => `${c} ${t}`).join(' · ');
}
// Units filter pills on a property's Units tab.
export function matchArrangement(x, key) {
  const a = x.terms?.arrangement;
  return key === 'all' || (key === 'none' && !a) || (key === 'share' && /profitShare/.test(a || '')) || (key === 'fixed' && a === 'fixedRent') || (key === 'long' && a === 'longTermTenant');
}
// Audit log: one line per changed field. Personal fields are logged as "(changed)" only, so they read "Bank name updated".
export function changeList(a) {
  const v = x => (x == null || x === '' ? '—' : Array.isArray(x) ? (x.join(', ') || '—') : ARRANGEMENTS[x]?.label || String(x));
  const names = { ownerId: 'Owner', aliases: 'eZee names', active: 'Active', arrangement: 'Arrangement', units: 'Units', status: 'Status',
    fullName: 'Full name', coOwners: 'Co-owners', dob: 'Date of birth', bankName: 'Bank name', accountHolder: 'Account holder', bankAccount: 'Bank account',
    ic: 'IC / Passport', email: 'Email', phone: 'Phone', address: 'Address', whatsapp: 'WhatsApp', wechat: 'WeChat ID' };
  const nice = f => names[f] || f.replace(/([A-Z])/g, ' $1').replace(/^./, m => m.toUpperCase());
  const out = (a.changes || []).map(c => c.new === '(changed)' ? `${nice(c.field)} updated` : `${nice(c.field)}: ${v(c.old)} → ${v(c.new)}`);
  return out.length ? out : ['—'];
}
export function actionText(a) {
  const label = ({ 'unit.create': 'Unit added', 'unit.update': 'Unit changed', 'unitTerms.starter': 'Starter settings', 'rates.create': 'Fees & rates', 'property.create': 'Property added',
    'property.update': 'Property changed', 'month.complete': 'Month completed', 'month.reopen': 'Month reopened', 'statement.complete': 'Statement completed', 'statement.reopen': 'Statement reopened', 'statement.send': 'Statement sent', 'statement.pullback': 'Statement pulled back', 'statement.return': 'Statement sent back',
    'owner.create': 'Owner added', 'owner.update': 'Owner changed', 'owner.deactivate': 'Owner deactivated', 'owner.reactivate': 'Owner reactivated', 'owner.delete': 'Owner deleted',
    'unit.delete': 'Unit deleted', 'ezee.upload': 'eZee report uploaded', 'unitTerms.create': 'Unit settings changed', 'expense.create': 'Expense added',
    'expense.update': 'Expense changed', 'expense.remove': 'Expense removed' })[a.action]
    // Anything else: "offlineBooking.create" -> "Offline booking create"
    || String(a.action || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._]/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
  // Every word starts with a capital (eZee keeps its own spelling)
  return label.replace(/(^|\s)([a-z])/g, (m, sp, c) => sp + c.toUpperCase()).replace(/\bEzee\b/g, 'eZee');
}

// ---------- owners: names, units, brought forward ----------
// Joint owners: the first name is fullName, the others are private.coOwners [{ fullName, ic, email, phone }]. Shown "A & B".
export const CO_OWNER_FIELDS = ['fullName', 'ic', 'email', 'phone'];
export const jointName = (first, coOwners) => [first, ...(coOwners || []).map(c => c?.fullName)].map(n => String(n || '').trim()).filter(Boolean).join(' & ');
export const ownerName = (owners, id) => { const x = owners.find(y => y.id === id); return x ? jointName(x.private?.fullName || x.name || '', x.private?.coOwners) : ''; };
// Owner codes (OWN-001) are for the system only; screens show the name. Roles that can't read names (PDPA) see "Owner linked".
export const ownerLabel = (owners, id, viewOnly) => { const x = owners.find(y => y.id === id); if (!x) return ''; return ownerName(owners, id) || (viewOnly ? 'Owner linked' : 'No name saved'); };
export const ownerUnits = (units, id) => units.filter(x => x.ownerId === id);
// Carried forward: the month's automatic brought-forward expense lines on the owner's units, as a positive balance.
export const carried = (units, bfLines, id) => { const ids = ownerUnits(units, id).map(x => x.id); return -bfLines.filter(e => ids.includes(e.unitId)).reduce((s, e) => s + (Number(e.amount) || 0), 0); };
export const nextOwnerCode = owners => `OWN-${String(Math.max(0, ...owners.map(x => Number(String(x.code || x.id).replace(/\D/g, '')) || 0)) + 1).padStart(3, '0')}`;

// ---------- reads ----------
const ownersKey = (viewOnly, canEdit) => `owners:${viewOnly}:${canEdit}`;
// Every owner, by name. Names live in private/main (PDPA); older owners kept the name on the main record.
// View-only roles (except Marketing) don't read the private part.
export async function loadOwners(viewOnly, canEdit) {
  const list = await cached(ownersKey(viewOnly, canEdit), TTL.mid, async () => {
    const rows = (await getDocs(collection(db, 'owners'))).docs.map(d => ({ id: d.id, ...d.data() }));
    const privs = viewOnly && !canEdit ? [] : await Promise.all(rows.map(x => getDoc(doc(db, 'owners', x.id, 'private', 'main')).catch(() => null)));
    rows.forEach((x, i) => { x.private = privs[i]?.exists?.() ? privs[i].data() : {}; });
    return rows;
  });
  return [...list].sort((a, b) => (a.private?.fullName || a.name || a.code || a.id).localeCompare(b.private?.fullName || b.name || b.code || b.id));
}
// Units (with their terms and history, or without terms for view-only roles) of the given properties.
export async function loadUnitsOf(properties, asOf, viewOnly) {
  const sets = await Promise.all(properties.map(p => cached(`set:${p.id}:${viewOnly ? 'v' : asOf}`, TTL.mid,
    () => (viewOnly ? loadUnits(p.id).then(units => ({ units })) : loadSetup(p.id, asOf)))));
  return sets.flatMap(s => s.units);
}
// The month document of each property: { [propertyId]: { status, completedUnits, ... } }, 'open' when there is none.
export async function loadMonthDocs(properties, asOf) {
  const snaps = await Promise.all(properties.map(p => getDoc(doc(db, 'months', `${p.id}_${asOf}`))));
  return Object.fromEntries(properties.map((p, i) => [p.id, snaps[i].exists() ? snaps[i].data() : { status: 'open' }]));
}
// The month's automatic brought-forward lines (owners' carried forward balances), for one property or every one.
export async function loadBroughtForward(propertyId, asOf) {
  const col = collection(db, 'expenses');
  const snap = await getDocs(propertyId ? query(col, where('month', '==', asOf), where('propertyId', '==', propertyId)) : query(col, where('month', '==', asOf)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.auto && e.kind === 'broughtForward' && !e.deleted);
}
// Properties list (Director / Accounting): the month summaries hold each property's units and arrangements, so the
// units, their terms, owners and expenses are not read for it.
export async function loadPropertiesSummary(properties, asOf, me) {
  const pms = await Promise.all(properties.map(p => propertyMonth(p, asOf, { me, canWrite: canWriteSummaries(me) })));
  return {
    monthDocs: Object.fromEntries(properties.map((p, i) => [p.id, pms[i]?.month || { status: 'open' }])),
    units: pms.flatMap((pm, i) => pm.summary.units.map(x => ({ id: x.id, unitCode: x.unitCode, propertyId: properties[i].id,
      terms: x.hasTerms ? { arrangement: x.arrangement, fixedRentAmount: x.fixedRentAmount } : null })))
  };
}
// A property's change history, 30 at a time, newest first (index: auditLog propertyId + at).
// If that index isn't deployed yet, fall back to a capped read so the page still works.
export async function loadAuditPage(propertyId, after = null) {
  const col = collection(db, 'auditLog');
  const base = [where('propertyId', '==', propertyId)];
  try {
    const snap = await getDocs(query(col, ...base, orderBy('at', 'desc'), ...(after ? [startAfter(after)] : []), limit(AUDIT_PAGE)));
    return { rows: snap.docs.map(d => ({ id: d.id, ...d.data() })), last: snap.docs.length ? markRaw(snap.docs[snap.docs.length - 1]) : after, more: snap.docs.length === AUDIT_PAGE, all: false };
  } catch (e) {
    if (e.code !== 'failed-precondition') throw e;
    console.warn('auditLog index (propertyId, at) is missing; showing the latest 100 only. Create it here:', (e.message.match(/https:\/\/\S+/) || [''])[0]);
    const snap = await getDocs(query(col, ...base, limit(100)));
    return { rows: snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => msOf(b.at) - msOf(a.at)), last: null, more: false, all: true };
  }
}
// Unit types people added with "+ Add type" (shared by everyone)
export async function loadUnitTypes() {
  try { const s = await getDoc(doc(db, 'config', 'unitTypes')); return s.exists() ? s.data().list || [] : []; } catch { return []; }
}
export async function addUnitType(t) {
  try { await setDoc(doc(db, 'config', 'unitTypes'), { list: arrayUnion(t) }, { merge: true }); }
  catch { /* kept on this unit; it still appears for the next unit through the units already saved */ }
}
// Fees & rates / OTA commissions: the rate version in force for the month, as a form.
export async function loadRates(propertyId, asOf) {
  const snap = await getDocs(collection(db, 'properties', propertyId, 'rateVersions'));
  const cur = latestVersion(snap.docs.map(d => ({ id: d.id, ...d.data() })), asOf);
  const form = {};
  for (const [k, d] of Object.entries(DEFAULT_OTA)) {
    const v = { ...d, ...(cur?.ota?.[k] || {}) };
    form[k] = { label: d.label, payout: v.payout, commission: +(v.commissionPct * 100).toFixed(4), paymentFee: +((v.paymentFeePct || 0) * 100).toFixed(4), sstPct: v.sstPct ?? 0.08 };
  }
  return { form, effectiveFrom: asOf, reason: '', earlyToOwner: cur?.earlyCheckInToOwner !== false, tourismTax: cur?.tourismTaxPerNight ?? 10, current: cur };
}
// Payout history of an owner's units, newest month first.
export async function loadPayouts(unitIds) {
  const snaps = await Promise.all(unitIds.map(id => getDocs(query(collection(db, 'payoutHistory'), where('unitId', '==', id))).catch(() => ({ docs: [] }))));
  return snaps.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).sort((a, b) => (b.month || '').localeCompare(a.month || ''));
}
// Safe delete: the first collection that still refers to the record, or ''.
export async function hasRefs(list, id) {
  for (const [coll, field] of list) {
    const snap = await getDocs(query(collection(db, coll), where(field, '==', id), limit(1)));
    if (!snap.empty) return coll;
  }
  return '';
}

// ---------- offline bookings (made from Offline inquiries, the Booking Form or the Willow upload) ----------
// Kept in offlineBookings, never in bookings, so month-end (which pays from eZee) can't count them.
// What was paid comes from Accounting's Offline Payments only; without access to them paid / pays are null.
export async function loadOfflineBookings(propertyId) {
  const col = collection(db, 'offlineBookings');
  const snap = await getDocs(propertyId === 'all' ? query(col, orderBy('createdAt', 'desc'), limit(300))
    : query(col, where('propertyId', '==', propertyId), limit(300)));
  // Cancelled bookings come back too: the page hides them unless the Cancelled filter is picked.
  const bookings = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.arrival || '').localeCompare(a.arrival || ''));
  let paid = null, pays = null;
  try {
    const pc = collection(db, 'offlinePayments');
    const ps = await getDocs(propertyId === 'all' ? query(pc, orderBy('createdAt', 'desc'), limit(500)) : query(pc, where('propertyId', '==', propertyId), limit(500)));
    paid = {}; pays = {};
    ps.docs.forEach(d => { const x = d.data(); if (x.bookingId) { paid[x.bookingId] = (paid[x.bookingId] || 0) + (Number(x.amount) || 0); (pays[x.bookingId] ||= []).push({ date: x.date || '', amount: Number(x.amount) || 0 }); } });
  } catch (e) { paid = null; pays = null; /* no access to payments: the amount shows a dash */ }
  return { bookings, paid, pays };
}
// The guest's name for the Tenant column (private data): from the tenant record, or the booking's private part.
export async function loadGuestName(r) {
  try {
    const snap = await getDoc(r.tenantId ? doc(db, 'tenants', r.tenantId, 'private', 'main') : doc(db, 'offlineBookings', r.id, 'private', 'main'));
    return snap.exists() ? snap.data().name || snap.data().fullName || '' : '';
  } catch (e) { return ''; /* no access: the tenant id is shown instead */ }
}
// One booking's private part (passcodes, guest on imported bookings), utility bill, payments and tenant's details.
export async function loadBookingDetails(r) {
  const [p, u, pay] = await Promise.all([getDoc(doc(db, 'offlineBookings', r.id, 'private', 'main')).catch(() => null), getDoc(doc(db, 'utilityBills', r.id)).catch(() => null),
    getDocs(query(collection(db, 'offlinePayments'), where('bookingId', '==', r.id))).catch(() => null)]);
  const out = {
    payments: pay ? pay.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.date).localeCompare(String(b.date))) : null,
    hasPrivate: !!p, privateData: p?.exists() ? p.data() : {}, guest: null, guestOk: false,
    bill: u?.exists?.() ? u.data() : null
  };
  // Bookings made from an inquiry or the Booking Form keep the guest's details on the tenant record; the passcodes stay on the booking
  if (r.tenantId) {
    const t = await getDoc(doc(db, 'tenants', r.tenantId, 'private', 'main')).catch(() => null);
    if (t?.exists()) { const d = t.data(); out.guest = { name: d.name || '', phone: d.phone || '', email: d.email || '', icPassport: d.icPassport || '' }; out.guestOk = true; }
  } else out.guestOk = !!p;
  return out;
}
// Save an offline booking: the main record, its private part, and guest details on the tenant record.
// The audit log names the fields changed, never the personal values.
export async function saveOfflineBooking(me, b, main, changes, privData, guestData) {
  const batch = writeBatch(db), ref = doc(db, 'offlineBookings', b.id);
  batch.update(ref, { ...main, updatedAt: serverTimestamp(), updatedBy: me.user.uid });
  if (privData) batch.set(doc(ref, 'private', 'main'), privData, { merge: true });
  if (guestData) batch.set(doc(db, 'tenants', b.tenantId, 'private', 'main'), guestData, { merge: true });
  audit(batch, me, { action: 'offlineBooking.update', entity: `offlineBookings/${b.id}`, propertyId: b.propertyId || null,
    changes: [...changes, ...Object.keys({ ...(privData || {}), ...(guestData || {}) }).map(k => ({ field: `private.${k}`, old: null, new: null }))], reason: b.reason.trim() });
  await batch.commit();
}

// Cancel (status 'cancelled', with the reason) or restore an offline booking. Cancelled bookings drop out of every list,
// the Dashboard, the Reservation form's clash check and the Utility form.
export async function setBookingCancelled(me, b, cancel, reason) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'offlineBookings', b.id), cancel
    ? { status: 'cancelled', cancelledReason: reason, cancelledAt: serverTimestamp(), cancelledBy: me.user.uid, updatedAt: serverTimestamp(), updatedBy: me.user.uid }
    : { status: deleteField(), cancelledReason: deleteField(), cancelledAt: deleteField(), cancelledBy: deleteField(), updatedAt: serverTimestamp(), updatedBy: me.user.uid });
  audit(batch, me, { action: cancel ? 'offlineBooking.cancel' : 'offlineBooking.restore', entity: `offlineBookings/${b.id}`, propertyId: b.propertyId || null,
    changes: [{ field: 'status', old: cancel ? 'active' : 'cancelled', new: cancel ? 'cancelled' : 'active' }], reason });
  await batch.commit();
}
// Delete a cancelled booking for good: the booking, its private part and its utility bill. The page only offers it when
// no payment is recorded. The audit entry keeps the booking no., unit and dates, never the guest's details.
export async function deleteOfflineBooking(me, b, reason) {
  const batch = writeBatch(db), ref = doc(db, 'offlineBookings', b.id);
  batch.delete(doc(ref, 'private', 'main'));
  batch.delete(doc(db, 'utilityBills', b.id));
  batch.delete(ref);
  audit(batch, me, { action: 'offlineBooking.delete', entity: `offlineBookings/${b.id}`, propertyId: b.propertyId || null,
    changes: [{ field: 'booking', old: `${b.bookingNo || b.id} · ${b.unitCode || b.unitId || ''} · ${b.arrival || ''} to ${b.departure || ''}`, new: null }], reason });
  await batch.commit();
}

// ---------- cache after a save ----------
// After a save only what changed is read again (not every owner and unit): one owner is patched in the saved list,
// and a property's units, terms and fees are dropped so this one property is read fresh.
export async function refreshOwner(id, viewOnly, canEdit, removed = false) {
  let owner = null;
  if (!removed) {
    const [m, pr] = await Promise.all([getDoc(doc(db, 'owners', id)), getDoc(doc(db, 'owners', id, 'private', 'main')).catch(() => null)]);
    if (m.exists()) owner = { id, ...m.data(), private: pr?.exists?.() ? pr.data() : {} };
  }
  const ok = await patchCache(ownersKey(viewOnly, canEdit), list => [...list.filter(x => x.id !== id), ...(owner ? [owner] : [])]);
  if (!ok) await clearCache('owners:');
}
export const forgetUnits = propertyId => Promise.all([clearCache(`set:${propertyId}:`), clearCache(`units:${propertyId}`)]);
export const forgetProperties = () => clearCache('properties');

// ---------- writes: new owner listing ----------
// After a save from a listing: note the new id on it (Directors; Procurement and Directors edit listings, and
// Procurement don't add in Portfolio). Returns a sentence for the message.
export async function noteOnListing(me, h, key, id, what) {
  if (!h?.recordBack) return '';
  try {
    const ref = doc(db, 'newOwnerListings', h.listingId);
    const snap = await getDoc(ref);
    const portfolio = { ...(snap.exists() ? snap.data().portfolio || {} : {}), [key]: id };
    const d = new Date(), at = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
    await updateDoc(ref, { portfolio, updatedAt: serverTimestamp(), updatedByUid: me.user.uid, updatedByName: me.name,
      history: arrayUnion({ at, by: me.name, text: what === 'owner' ? 'Created in Portfolio: owner.' : `Created in Portfolio: ${what} ${id}.` }) });
    return ` Noted on ${h.listingId}.`;
  } catch (e) { return ` Not noted on ${h.listingId}: ${friendlyError(e, 'update the listing')}`; }
}
// Which property a "Create unit" handoff from a listing belongs to: the id the listing recorded, or the property with its name.
export function handoffProperty(h, properties) {
  const name = (h.property || '').trim().toLowerCase();
  return properties.find(x => x.id === h.portfolio?.propertyId)
    || (name && properties.find(x => (x.name || '').trim().toLowerCase() === name || x.id === slug(name))) || null;
}

// ---------- writes: owners ----------
// keepMain: Marketing editing an owner leave the code, status and bank digits as they are.
export async function saveOwner(me, { id, isNew, keepMain, active, bankLast4, priv, changed, reason, propertyId }) {
  const b = writeBatch(db);
  const main = keepMain ? { updatedAt: serverTimestamp(), updatedBy: me.user.uid }
    : { code: id, active, bankLast4, updatedAt: serverTimestamp(), updatedBy: me.user.uid };
  if (isNew) Object.assign(main, { createdAt: serverTimestamp(), createdBy: me.user.uid });
  b.set(doc(db, 'owners', id), main, { merge: true });
  b.set(doc(db, 'owners', id, 'private', 'main'), { ...priv, updatedAt: serverTimestamp(), updatedBy: me.user.uid }, { merge: true });
  // Audit names the fields changed, never the personal values.
  audit(b, me, { action: isNew ? 'owner.create' : 'owner.update', entity: `owners/${id}`, propertyId,
    changes: changed.map(k => ({ field: k, old: null, new: '(changed)' })), reason });
  await b.commit();
}
export async function deleteOwner(me, o, propertyId) {
  const b = writeBatch(db);
  b.delete(doc(db, 'owners', o.id, 'private', 'main'));
  b.delete(doc(db, 'owners', o.id));
  audit(b, me, { action: 'owner.delete', entity: `owners/${o.id}`, propertyId, changes: [{ field: 'owner', old: o.fullName || o.code || o.id, new: null }], reason: 'Deleted, no units linked' });
  await b.commit();
}
export async function deactivateOwner(me, id, reason) {
  const b = writeBatch(db);
  b.set(doc(db, 'owners', id), { active: false, deactivatedReason: reason, deactivatedAt: serverTimestamp(), deactivatedBy: me.user.uid }, { merge: true });
  audit(b, me, { action: 'owner.deactivate', entity: `owners/${id}`, changes: [{ field: 'active', old: true, new: false }], reason });
  await b.commit();
}
export async function reactivateOwner(me, id, reason) {
  const b = writeBatch(db);
  b.set(doc(db, 'owners', id), { active: true, deactivatedReason: null }, { merge: true });
  audit(b, me, { action: 'owner.reactivate', entity: `owners/${id}`, changes: [{ field: 'active', old: false, new: true }], reason });
  await b.commit();
}

// ---------- writes: units ----------
// detailsOnly: Marketing editing a unit change its details and eZee names only.
export async function saveUnit(me, { id, isNew, detailsOnly, propertyId, code, aliases, ownerId, info, active, terms, termsChanged, effectiveFrom, reason, changes }) {
  const b = writeBatch(db);
  const unitData = { propertyId, unitCode: code, ezeeRoomMatch: code, aliases, ownerId, info, active, updatedAt: serverTimestamp(), updatedBy: me.user.uid };
  if (isNew) unitData.createdAt = serverTimestamp(), unitData.createdBy = me.user.uid;
  b.set(doc(db, 'units', id), detailsOnly ? { aliases, info, updatedAt: serverTimestamp(), updatedBy: me.user.uid } : unitData, { merge: true });
  markFrom(b, propertyId, ALL_MONTHS, id);   // this unit's month summaries are worked out again (owner, status, settings)
  if (termsChanged) b.set(doc(db, 'units', id, 'terms', `${effectiveFrom}_${Date.now()}`), { ...terms, otaOverrides: null, effectiveFrom,
    reason, createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() });
  audit(b, me, { action: isNew ? 'unit.create' : 'unit.update', entity: `units/${id}`, propertyId, month: effectiveFrom, changes, reason });
  await b.commit();
}
// Delete a unit and its terms / ownership history. Chunked so a long history (500+ docs) can't exceed Firestore's
// 500-write batch limit.
export async function deleteUnit(me, u, propertyId) {
  const refs = [];
  for (const sub of ['terms', 'ownership']) (await getDocs(collection(db, 'units', u.id, sub))).forEach(d => refs.push(d.ref));
  const CHUNK = 450;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const cb = writeBatch(db);
    refs.slice(i, i + CHUNK).forEach(ref => cb.delete(ref));
    await cb.commit();
  }
  const b = writeBatch(db);
  b.delete(doc(db, 'units', u.id));
  audit(b, me, { action: 'unit.delete', entity: `units/${u.id}`, propertyId, changes: [{ field: 'unit', old: u.unitCode, new: null }], reason: 'Deleted, no history' });
  await b.commit();
}
// D'Majestic starter settings for the units not set up yet. Returns how many units got settings.
export async function loadStarter(me, propertyId, asOf, units) {
  const b = writeBatch(db); let n = 0; const ts = Date.now();
  for (const x of units.filter(y => !y.terms)) {
    const share = DM_STARTER.units.find(y => y[0] === x.unitCode), fixed = DM_STARTER.fixed.find(y => y[0] === x.unitCode);
    if (!share && !fixed) continue;
    const t = fixed ? { arrangement: 'fixedRent', fixedRentAmount: fixed[1] } : { arrangement: share[1], ...(share[2] || {}) };
    b.set(doc(db, 'units', x.id, 'terms', `${asOf}_${ts}`), { fixedRentAmount: null, serviceFeePct: null, utilityFeePct: null, sstOnFeePct: null, otaOverrides: null,
      ...t, effectiveFrom: asOf, reason: 'Starter settings (Upload CSV test page, Accounting Sep 2026 set-up)', createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() });
    markFrom(b, propertyId, asOf, x.id);
    n++;
  }
  audit(b, me, { action: 'unitTerms.starter', entity: `properties/${propertyId}`, propertyId, month: asOf, changes: [{ field: 'units', old: null, new: n }], reason: 'Starter settings loaded' });
  await b.commit();
  return n;
}

// ---------- writes: properties and rates ----------
export async function saveRates(me, propertyId, { effectiveFrom, ota, earlyToOwner, tourismTax, reason }) {
  const b = writeBatch(db);
  b.set(doc(db, 'properties', propertyId, 'rateVersions', `${effectiveFrom}_${Date.now()}`), { effectiveFrom, ota,
    earlyCheckInToOwner: earlyToOwner, tourismTaxPerNight: tourismTax, reason, createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() });
  audit(b, me, { action: 'rates.create', entity: `properties/${propertyId}/rateVersions`, propertyId, month: effectiveFrom, reason });
  markFrom(b, propertyId, effectiveFrom);   // every unit's summary from that month on is worked out again
  await b.commit();
}
export async function updateProperty(me, id, { name, info, changes, reason }) {
  const b = writeBatch(db);
  b.set(doc(db, 'properties', id), { name, info, updatedAt: serverTimestamp(), updatedBy: me.user.uid }, { merge: true });
  audit(b, me, { action: 'property.update', entity: `properties/${id}`, propertyId: id, changes, reason });
  await b.commit();
}
// A new property starts with the standard OTA rates.
export async function createProperty(me, id, { name, code, info }) {
  const b = writeBatch(db);
  b.set(doc(db, 'properties', id), { name, code, info, active: true, createdAt: serverTimestamp(), createdBy: me.user.uid });
  b.set(doc(db, 'properties', id, 'rateVersions', '2000-01_default'), { effectiveFrom: '2000-01', ota: DEFAULT_OTA, earlyCheckInToOwner: true, tourismTaxPerNight: 10,
    reason: 'Default OTA settings', createdBy: me.user.uid, createdByName: me.name, createdAt: serverTimestamp() });
  audit(b, me, { action: 'property.create', entity: `properties/${id}`, propertyId: id, reason: 'Added on Portfolio' });
  await b.commit();
}
