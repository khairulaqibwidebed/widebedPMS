// lib/state-stamp.js (12 Nov 2026, state security Phase 2): the Director's "Stamp states" tool.
// Data access by property (Phase 3, 12 Nov 2026): the same run also LINKS records that cover several properties:
//   owners.propertyIds (their units' properties), tenants.propertyIds and tenants' private/main propertyIds (their
//   offline bookings' properties). Rows "Owners (properties)" / "Tenants (properties)" in the table. Lists only grow.
// Copies each property's state onto the records linked to it, so the rules and queries can check `state`.
//   - Records with a propertyId get `state` (the property's).
//   - owners, tenants and importBatches get `states` (a list): from their units, their bookings, their properties.
//   - offlineInquiries take their booking's state; newOwnerListings their property's (exact name match only).
// Nothing is guessed: a record whose property has no state, or that has no property, is listed as "not resolved"
// and a Director picks its state by hand (leads, listings, owners, tenants only) or fixes the property first.
// Child records (terms, private parts, replies, rate versions) are not stamped: the rules read the parent's state.
// The audit log is not stamped (its lines can't be changed); new lines carry the state already.
// Safe to run again: records that already have the right state are skipped, so a run stopped half way just resumes.
import { collection, doc, getDocs, query, where, orderBy, limit, startAfter, writeBatch, documentId, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { audit } from '@/lib/finance-data.js';
import { stateOf, statesOf, rememberStates, isDirectorRole } from '@/lib/states.js';

// 12 Nov 2026 (Khairul): access is by PROPERTY now, so records no longer need their state stamped. The tool only LINKS
// owners and tenants to their properties. The state code below is kept (off) in case states are wanted again.
export const STAMP_STATES = false;

const BATCH = 400;          // writes per batch (Firestore allows 500; the audit line needs room)
const PAGE = 1000;          // documents read per page
export const DAILY_CAP = 15000;   // Spark plan: 20,000 writes a day. A run stops here; run it again the next day.

// Collections stamped straight from their propertyId, in this order
export const BY_PROPERTY = ['units', 'bookings', 'offlineBookings', 'offlinePayments', 'utilityBills', 'statements', 'approvals', 'months',
  'unitMonths', 'expenses', 'payoutHistory', 'issueQuotes', 'issues'];
// Collections worked out from others
export const DERIVED = ['offlineInquiries', 'newOwnerListings', 'owners', 'tenants', 'importBatches'];
// A Director may pick the state by hand for these when the tool can't tell
export const MANUAL = ['offlineInquiries', 'newOwnerListings', 'owners', 'tenants'];
const LIST_FIELD = { owners: 'states', tenants: 'states', importBatches: 'states' };   // the rest use `state`
export const fieldOf = coll => LIST_FIELD[coll] || 'state';

export const LABEL = {
  units: 'Units', bookings: 'eZee bookings', offlineBookings: 'Offline bookings', offlinePayments: 'Offline payments', utilityBills: 'Utility bills',
  statements: 'Statements', approvals: 'Approvals', months: 'Month summaries', unitMonths: 'Unit month summaries', expenses: 'Expenses',
  payoutHistory: 'Payout history', issueQuotes: 'Ticket quotes', issues: 'Tickets', offlineInquiries: 'Tenant leads', newOwnerListings: 'Owner listings',
  owners: 'Owners', tenants: 'Tenants', importBatches: 'eZee uploads',
  ownerLinks: 'Owners (properties)', tenantLinks: 'Tenants (properties)'
};

const nk = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const same = (a, b) => (Array.isArray(a) || Array.isArray(b)
  ? [...(a || [])].sort().join('|') === [...(b || [])].sort().join('|')
  : (a || '') === (b || ''));
const uniq = list => [...new Set(list.filter(Boolean))].sort();

// Every document of a collection, a page at a time
async function readAll(coll, onPage) {
  const out = [];
  let last = null;
  for (;;) {
    const q = last ? query(collection(db, coll), orderBy(documentId()), startAfter(last), limit(PAGE)) : query(collection(db, coll), orderBy(documentId()), limit(PAGE));
    let snap;
    try { snap = await getDocs(q); }
    catch (e) { console.error(`[stamp] Firestore refused reading "${coll}"`, e); throw e; }   // names the collection in the console
    snap.docs.forEach(d => out.push({ id: d.id, ...d.data() }));
    if (onPage) onPage(out.length);
    if (snap.size < PAGE) return out;
    last = snap.docs[snap.docs.length - 1];
  }
}

// ---------- Dry run ----------
// Reads everything and works out what each record's state should be. Writes nothing.
// Returns { rows: [{ coll, total, ok, toStamp, unresolved, noLink }], jobs: [{ coll, id, value }], unresolved: [{ coll, id, label, why, manual }],
//           propertiesWithout, staffWithout, writes }
export async function dryRun(onStep = () => {}) {
  onStep('Reading properties');
  const props = await readAll('properties');
  rememberStates(props);
  const stateOfProp = Object.fromEntries(props.map(p => [p.id, stateOf(p)]));
  const propName = Object.fromEntries(props.map(p => [p.id, p.name || p.id]));
  const users = await readAll('users');
  // Staff with no properties on their record (data access by property): they see no property data
  const staffWithout = users.filter(u => u.active !== false && !isDirectorRole(u.role) && !(Array.isArray(u.properties) && u.properties.length)).length;

  const rows = [], jobs = [], unresolved = [], links = [];
  const want = {};   // coll -> id -> value it will have after the run (for the derived collections)
  const add = (coll, d, value, row) => {
    want[coll][d.id] = value;
    if (same(d[fieldOf(coll)], value)) row.ok++;
    else { row.toStamp++; jobs.push({ coll, id: d.id, value }); }
  };
  const miss = (coll, d, label, why, row) => { row.unresolved++; unresolved.push({ coll, id: d.id, label, why, manual: MANUAL.includes(coll) }); };

  if (STAMP_STATES) {
  for (const coll of BY_PROPERTY) {
    onStep(`Reading ${LABEL[coll]}`);
    const list = await readAll(coll, n => onStep(`Reading ${LABEL[coll]} (${n})`));
    const row = { coll, total: list.length, ok: 0, toStamp: 0, unresolved: 0, noLink: 0 };
    want[coll] = {};
    for (const d of list) {
      if (!d.propertyId) {
        // In-house tickets (and their quotes) have no property: they keep the tag rules, no state needed
        if (coll === 'issues' || coll === 'issueQuotes') { row.noLink++; continue; }
        miss(coll, d, d.unitCode || d.unitId || d.id, 'No property on the record', row); continue;
      }
      const st = stateOfProp[d.propertyId];
      if (st === undefined) { miss(coll, d, d.unitCode || d.id, `Property ${d.propertyId} no longer exists`, row); continue; }
      if (!st) { miss(coll, d, d.unitCode || d.id, `${propName[d.propertyId]} has no state yet`, row); continue; }
      add(coll, d, st, row);
    }
    rows.push(row);
  }

  // Tenant leads: the booking's state; a lead with a state already keeps it
  onStep('Reading tenant leads');
  {
    const coll = 'offlineInquiries', list = await readAll(coll), row = { coll, total: list.length, ok: 0, toStamp: 0, unresolved: 0, noLink: 0 };
    want[coll] = {};
    for (const d of list) {
      const st = d.bookingId ? want.offlineBookings[d.bookingId] : '';
      if (st) add(coll, d, st, row);
      else if (d.state) { row.ok++; want[coll][d.id] = d.state; }
      else miss(coll, d, `${d.id} · ${String(d.lookingFor || '').slice(0, 40)}`, d.bookingId ? 'Its booking has no state yet' : 'No booking yet: pick the state', row);
    }
    rows.push(row);
  }

  // Owner listings: a property of the same name with one state; else a listing with a state keeps it
  onStep('Reading owner listings');
  {
    const coll = 'newOwnerListings', list = await readAll(coll), row = { coll, total: list.length, ok: 0, toStamp: 0, unresolved: 0, noLink: 0 };
    want[coll] = {};
    for (const d of list) {
      const sts = uniq(props.filter(p => d.property && nk(p.name) === nk(d.property)).map(stateOf));
      if (sts.length === 1) add(coll, d, sts[0], row);
      else if (d.state) { row.ok++; want[coll][d.id] = d.state; }
      else miss(coll, d, `${d.id} · ${d.property || d.unit || ''}`, sts.length > 1 ? `${d.property} is in ${sts.join(' and ')}: pick one` : 'Property not in Portfolio: pick the state', row);
    }
    rows.push(row);
  }

  // Owners: the states of their units
  onStep('Reading owners');
  {
    const coll = 'owners', list = await readAll(coll), row = { coll, total: list.length, ok: 0, toStamp: 0, unresolved: 0, noLink: 0 };
    const units = await readAll('units');
    const byOwner = {};
    for (const u of units) if (u.ownerId) (byOwner[u.ownerId] = byOwner[u.ownerId] || []).push(want.units[u.id] || '');
    want[coll] = {};
    for (const d of list) {
      const sts = uniq(byOwner[d.id] || []);
      if (sts.length) add(coll, d, sts, row);
      else if (statesOf(d).length) { row.ok++; want[coll][d.id] = d.states; }
      else miss(coll, d, d.code || d.id, byOwner[d.id] ? 'Their units have no state yet' : 'No units: pick the state', row);
    }
    rows.push(row);
  }

  // Tenants: the states of their offline bookings
  onStep('Reading tenants');
  {
    const coll = 'tenants', list = await readAll(coll), row = { coll, total: list.length, ok: 0, toStamp: 0, unresolved: 0, noLink: 0 };
    const ob = await readAll('offlineBookings');
    const byTenant = {};
    for (const b of ob) if (b.tenantId) (byTenant[b.tenantId] = byTenant[b.tenantId] || []).push(want.offlineBookings[b.id] || '');
    want[coll] = {};
    for (const d of list) {
      const sts = uniq(byTenant[d.id] || []);
      if (sts.length) add(coll, d, uniq([...sts, ...statesOf(d)]), row);
      else if (statesOf(d).length) { row.ok++; want[coll][d.id] = d.states; }
      else miss(coll, d, d.id, byTenant[d.id] ? 'Their bookings have no state yet' : 'No bookings: pick the state', row);
    }
    rows.push(row);
  }

  // eZee uploads: the states of the properties in the upload
  onStep('Reading eZee uploads');
  {
    const coll = 'importBatches', list = await readAll(coll), row = { coll, total: list.length, ok: 0, toStamp: 0, unresolved: 0, noLink: 0 };
    want[coll] = {};
    for (const d of list) {
      const ids = d.propertyIds || (d.propertyId ? [d.propertyId] : []);
      const sts = uniq(ids.map(id => stateOfProp[id]));
      if (!ids.length) { row.noLink++; continue; }
      if (sts.length && ids.every(id => stateOfProp[id])) add(coll, d, sts, row);
      else miss(coll, d, d.fileName || d.id, 'A property in the upload has no state yet', row);
    }
    rows.push(row);
  }

  }   // end of STAMP_STATES

  // ---- Links (data access by property): owners and tenants carry the list of properties they belong to ----
  onStep('Linking owners and tenants to properties');
  {
    const units = await readAll('units'), ob = await readAll('offlineBookings');
    const owners = await readAll('owners'), tenants = await readAll('tenants');
    const ownerProps = {}, tenantProps = {};
    const unitsOf = {}, staysOf = {};   // for the list on screen: which units / how many bookings make the link
    for (const u of units) if (u.ownerId && u.propertyId) { (ownerProps[u.ownerId] ||= []).push(u.propertyId); (unitsOf[u.ownerId] ||= []).push(u.unitCode || u.id); }
    for (const b of ob) if (b.tenantId && b.propertyId) { (tenantProps[b.tenantId] ||= []).push(b.propertyId); staysOf[b.tenantId] = (staysOf[b.tenantId] || 0) + 1; }
    const link = (key, list, from) => {
      const row = { coll: key, total: list.length, ok: 0, toStamp: 0, unresolved: 0, noLink: 0 };
      for (const d of list) {
        const ids = uniq([...(from[d.id] || []), ...(Array.isArray(d.propertyIds) ? d.propertyIds : [])]);
        if (!ids.length) { row.noLink++; continue; }   // no units / bookings yet: seen by Directors and whoever added them
        if (same(ids, d.propertyIds)) { row.ok++; continue; }
        row.toStamp++;
        // What is linked to what, for the list in the popup
        const had = Array.isArray(d.propertyIds) ? d.propertyIds : [];
        links.push({ kind: key === 'ownerLinks' ? 'Owner' : 'Tenant', id: d.id, label: key === 'ownerLinks' ? (d.code || d.id) : (d.code || d.name || d.id),
          to: ids.map(id => ({ name: propName[id] || id, isNew: !had.includes(id) })),
          via: key === 'ownerLinks' ? (unitsOf[d.id] || []).sort().join(', ') : `${staysOf[d.id] || 0} booking${staysOf[d.id] === 1 ? '' : 's'}` });
        jobs.push({ coll: key === 'ownerLinks' ? 'owners' : 'tenants', id: d.id, value: ids, field: 'propertyIds' });
        if (key === 'tenantLinks') jobs.push({ coll: 'tenants', id: d.id, sub: 'private/main', value: ids, field: 'propertyIds' });
      }
      rows.push(row);
    };
    link('ownerLinks', owners, ownerProps);
    link('tenantLinks', tenants, tenantProps);
  }

  links.sort((a, b) => a.kind.localeCompare(b.kind) || String(a.label).localeCompare(String(b.label), 'en', { numeric: true }));
  return { rows, jobs, unresolved, links, writes: jobs.length, propertiesWithout: STAMP_STATES ? props.filter(p => !stateOf(p)).length : 0, staffWithout };
}

// ---------- Stamp ----------
// Writes the jobs from a dry run, BATCH at a time. Only `state` / `states` change (the rules allow a Director exactly that).
// onProgress({ done, total }). Stops after cap writes. Returns { done, stopped }.
export async function stamp(me, jobs, onProgress = () => {}, cap = DAILY_CAP, shouldStop = () => false) {
  const todo = jobs.slice(0, cap);
  let done = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    if (shouldStop()) return { done, stopped: true };
    const part = todo.slice(i, i + BATCH), b = writeBatch(db);
    for (const j of part) {
      const ref = j.sub ? doc(db, j.coll, j.id, ...j.sub.split('/')) : doc(db, j.coll, j.id);
      if (j.field === 'propertyIds') b.set(ref, { propertyIds: j.value }, { merge: true });   // links (private/main may not exist yet)
      else b.update(ref, { [fieldOf(j.coll)]: j.value });
    }
    const counts = {};
    part.forEach(j => { const k = j.field === 'propertyIds' ? (j.coll === 'owners' ? 'ownerLinks' : 'tenantLinks') : j.coll; if (!j.sub) counts[k] = (counts[k] || 0) + 1; });
    audit(b, me, { action: 'state.stamp', entity: 'stateStamp', reason: `${STAMP_STATES ? 'Stamped states' : 'Linked to properties'}: ${Object.entries(counts).map(([c, n]) => `${LABEL[c] || c} ${n}`).join(', ')}` });
    await b.commit();
    done += part.length;
    onProgress({ done, total: todo.length });
  }
  return { done, stopped: todo.length < jobs.length };
}

// A Director picks the state of one record the tool couldn't resolve (leads, listings, owners, tenants)
export async function setStateByHand(me, coll, id, state, reason = 'Picked by hand in Stamp states') {
  if (!MANUAL.includes(coll)) throw new Error('Fix the property\'s state instead.');
  const value = fieldOf(coll) === 'states' ? [state] : state;
  const b = writeBatch(db);
  b.update(doc(db, coll, id), { [fieldOf(coll)]: value });
  audit(b, me, { action: 'state.stamp', entity: `${coll}/${id}`, changes: [{ field: fieldOf(coll), old: null, new: state }], reason });
  await b.commit();
}

// ---------- One property's records, after a Director changes its state ----------
// Same rules as the full run, limited to one property. onStep(text). Returns the number of records changed.
export async function stampProperty(me, propertyId, state, onStep = () => {}) {
  if (!propertyId || !state) return 0;
  const jobs = [];
  const docsOf = async (coll, field, value) => (await getDocs(query(collection(db, coll), where(field, '==', value)))).docs.map(d => ({ id: d.id, ...d.data() }));
  const units = [], bookings = [];
  for (const coll of BY_PROPERTY) {
    onStep(`Checking ${LABEL[coll]}`);
    const list = await docsOf(coll, 'propertyId', propertyId);
    if (coll === 'units') units.push(...list);
    if (coll === 'offlineBookings') bookings.push(...list);
    for (const d of list) if (d.state !== state) jobs.push({ coll, id: d.id, value: state });
  }
  // Tenant leads booked into this property
  onStep('Checking tenant leads');
  for (let i = 0; i < bookings.length; i += 30) {
    const ids = bookings.slice(i, i + 30).map(b => b.id);
    const snap = await getDocs(query(collection(db, 'offlineInquiries'), where('bookingId', 'in', ids)));
    snap.docs.forEach(d => { if (d.data().state !== state) jobs.push({ coll: 'offlineInquiries', id: d.id, value: state }); });
  }
  // Owners, tenants and eZee uploads: their whole list again (they may also have records in other states)
  onStep('Checking owners, tenants and uploads');
  const listFor = async (coll, id, from, field) => {
    const linked = await docsOf(from, field, id);
    const sts = uniq(await Promise.all(linked.map(async x => (x.propertyId === propertyId ? state : x.state || ''))));
    return sts;
  };
  for (const ownerId of uniq(units.map(u => u.ownerId))) {
    const sts = await listFor('owners', ownerId, 'units', 'ownerId');
    if (sts.length) jobs.push({ coll: 'owners', id: ownerId, value: sts });
  }
  for (const tenantId of uniq(bookings.map(b => b.tenantId))) {
    const sts = await listFor('tenants', tenantId, 'offlineBookings', 'tenantId');
    if (sts.length) jobs.push({ coll: 'tenants', id: tenantId, value: sts });
  }
  const batches = (await getDocs(query(collection(db, 'importBatches'), where('propertyIds', 'array-contains', propertyId)))).docs;
  if (batches.length) {
    const props = (await getDocs(collection(db, 'properties'))).docs.map(d => ({ id: d.id, ...d.data() }));
    const st = Object.fromEntries(props.map(p => [p.id, p.id === propertyId ? state : stateOf(p)]));
    for (const d of batches) {
      const sts = uniq((d.data().propertyIds || []).map(id => st[id]));
      if (!same(sts, d.data().states)) jobs.push({ coll: 'importBatches', id: d.id, value: sts });
    }
  }
  if (!jobs.length) return 0;
  onStep(`Saving ${jobs.length} records`);
  const r = await stamp(me, jobs, ({ done, total }) => onStep(`Saved ${done} of ${total}`), Infinity);
  return r.done;
}

// Saved under config/stateStamp so the Settings lock switch can tell whether the data is stamped: { at, by, left }
export async function saveStampResult(me, left) {
  const b = writeBatch(db);
  b.set(doc(db, 'config', 'stateStamp'), { at: serverTimestamp(), byUid: me.user.uid, byName: me.name, left });
  await b.commit();
}
