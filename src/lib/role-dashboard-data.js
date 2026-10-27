// Reads for the IT, HR, Operations, Procurement and Marketing dashboards (pages/Dashboard/RoleDashboard.vue).
// Each loader asks only for what that role's security rules let it read, with the same query shapes the
// rules check (rules are not filters): tickets tagged to the role plus tickets the person raised, inquiries
// assigned to the person, and so on. A Director using "View as" passes the same checks.
// Nothing here reads a private/ document except the complaint subject on the HR dashboard (HR and Directors only).
import { db, ROLE_LABEL } from './firebase.js';
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { dayOffset } from './format.js';
import { STAGES, withIds } from '@/pages/Playbook/onboarding-stages.js';

const ms = t => (t?.toMillis ? t.toMillis() : t?.toDate ? t.toDate().getTime() : 0);
const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
const LIST_LIMIT = 500;   // same as the Issues page

// ---- Tickets: tagged to the role, or raised by me (Directors read every ticket, but the dashboard asks the same way) ----
// tagOnly: the IT dashboard counts tickets tagged IT only.
export async function loadMyTickets(role, uid, { tagOnly = false } = {}) {
  const col = collection(db, 'issues'), tag = ROLE_LABEL[role] || role;
  const snaps = await Promise.all([
    getDocs(query(col, where('tags', 'array-contains', tag), limit(LIST_LIMIT))),
    tagOnly ? null : getDocs(query(col, where('raisedByUid', '==', uid), limit(LIST_LIMIT)))
  ]);
  const seen = new Map();
  for (const s of snaps) if (s) for (const d of s.docs) seen.set(d.id, { id: d.id, ...d.data() });
  return [...seen.values()].filter(t => t.status === 'open' || t.status === 'progress');
}

// ---- Properties and units (Portfolio view-only roles read the parents, never terms) ----
export async function loadPortfolioCounts() {
  const [p, u] = await Promise.all([getDocs(collection(db, 'properties')), getDocs(collection(db, 'units'))]);
  const units = rows(u).filter(x => x.active !== false);
  const properties = rows(p).filter(x => x.active !== false)
    .map(x => ({ id: x.id, name: x.name || x.id, units: units.filter(y => y.propertyId === x.id).length }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { properties, unitCount: units.filter(x => properties.some(p => p.id === x.propertyId)).length };
}

// Last eZee upload (any kind, as on the Finance dashboard).
export async function loadUploads(n = 1) {
  return rows(await getDocs(query(collection(db, 'importBatches'), orderBy('uploadedAt', 'desc'), limit(n))));
}

// ---- Operations ----
// Today's arrivals and departures: eZee bookings (unit, dates and channel only are shown; never amounts or guests)
// plus offline bookings. Offline bookings are read like the Portfolio Bookings tab (newest 300).
export async function loadOps(uid) {
  const today = dayOffset(0), in30 = dayOffset(30);
  const bk = collection(db, 'bookings');
  const [arr, dep, offSnap, inqSnap, last] = await Promise.all([
    getDocs(query(bk, where('arrival', '==', today))),
    getDocs(query(bk, where('departure', '==', today))),
    getDocs(query(collection(db, 'offlineBookings'), orderBy('createdAt', 'desc'), limit(300))),
    getDocs(query(collection(db, 'offlineInquiries'), where('assignedToUid', '==', uid), limit(LIST_LIMIT))),
    loadUploads(1)
  ]);
  const ezee = (snap, dir) => rows(snap).filter(b => b.status !== 'cancelled')
    .map(b => ({ key: 'e' + b.id + dir, dir, unit: b.unitCode || b.roomRaw || 'Room ?', source: b.source || 'eZee', propertyId: b.propertyId || '', ezee: true }));
  const offline = rows(offSnap).filter(b => b.status !== 'cancelled');
  const off = (dir, field) => offline.filter(b => b[field] === today)
    .map(b => ({ key: 'o' + b.id + dir, dir, unit: b.unitCode || '(no unit)', source: b.source === 'direct' ? 'Direct' : 'Offline', propertyId: b.propertyId || '', id: b.id }));
  const moves = [...ezee(arr, 'in'), ...off('in', 'arrival'), ...ezee(dep, 'out'), ...off('out', 'departure')]
    .sort((a, b) => (a.dir === b.dir ? 0 : a.dir === 'in' ? -1 : 1) || a.unit.localeCompare(b.unit));
  const leases = offline.filter(b => b.longTerm && b.departure >= today && b.departure <= in30)
    .sort((a, b) => a.departure.localeCompare(b.departure))
    .map(b => ({ id: b.id, unit: b.unitCode || '(no unit)', departure: b.departure, propertyId: b.propertyId || '' }));
  const inquiries = rows(inqSnap);
  return {
    today, moves,
    checkIns: moves.filter(m => m.dir === 'in').length,
    checkOuts: moves.filter(m => m.dir === 'out').length,
    notInEzee: offline.filter(b => !b.ezeeReservationNo).length,
    leases, inquiries,
    lastUpload: last[0] || null
  };
}

// ---- IT ----
// Staff accounts (users parents; IT may read them), upload history and IT's own audit entries.
function weekStart() {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // Monday
  return d.getTime();
}
export async function loadIT(uid) {
  const [tickets, usersSnap, uploads, auditSnap] = await Promise.all([
    loadMyTickets('it', uid, { tagOnly: true }),
    getDocs(collection(db, 'users')),
    loadUploads(5),
    // Index: auditLog role ASC, at DESC (fb/indexes_dash.json).
    getDocs(query(collection(db, 'auditLog'), where('role', '==', 'it'), orderBy('at', 'desc'), limit(50)))
  ]);
  const users = rows(usersSnap);
  const on = users.filter(u => u.active !== false), off = users.filter(u => u.active === false);
  const audits = rows(auditSnap), since = weekStart();
  return {
    tickets: tickets.sort((a, b) => ms(a.createdAt) - ms(b.createdAt)),   // oldest first
    activeCount: on.length, offCount: off.length,
    signIns: on.filter(u => u.lastLoginAt).sort((a, b) => ms(b.lastLoginAt) - ms(a.lastLoginAt)),
    joiners: on.filter(u => u.createdAt).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)),
    turnedOff: off.sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt)),
    uploads,
    changesThisWeek: audits.filter(a => ms(a.at) >= since).length,
    changesCapped: audits.length === 50 && audits.every(a => ms(a.at) >= since),
    audits: audits.slice(0, 6)
  };
}

// ---- HR ----
const SOP_KEYS = [['attendance', 'Attendance SOP', '/HR/attendance-sop'], ['advance', 'Advance SOP', '/HR/advance-sop'],
  ['allowance', 'Allowance SOP', '/HR/allowance-sop'], ['socso', 'Claim SOCSO', '/HR/claim-socso']];
export async function loadHR() {
  const cs = collection(db, 'complaints');
  const [staffSnap, dirSnap, sopSnaps, progSnap, usersSnap, playbook] = await Promise.all([
    getDocs(query(cs, where('kind', '==', 'staff'))),
    getDocs(query(cs, where('kind', '==', 'director'))),
    Promise.all(SOP_KEYS.map(([k]) => getDoc(doc(db, 'sops', k)))),
    getDocs(collection(db, 'onboardingProgress')),
    getDocs(collection(db, 'users')),
    getDoc(doc(db, 'playbook', 'onboarding'))
  ]);
  const byNewest = (a, b) => ms(b.createdAt) - ms(a.createdAt) || (b.ref || '').localeCompare(a.ref || '');
  const staff = rows(staffSnap).sort(byNewest), director = rows(dirSnap).sort(byNewest);
  // Subject only (private/main, HR and Directors). The sender's name is never read into the dashboard.
  const subjectOf = async c => { const p = await getDoc(doc(db, 'complaints', c.id, 'private', 'main')); return p.exists() ? p.data().subject || '' : ''; };
  const recentStaff = staff.slice(0, 5), recentDir = director.slice(0, 5);
  const subjects = await Promise.all([...recentStaff, ...recentDir].map(subjectOf));
  const shown = [...recentStaff, ...recentDir].map((c, i) => ({ id: c.id, ref: c.ref, date: c.date, status: c.status, read: c.read, subject: subjects[i] }));

  const month = dayOffset(0).slice(0, 7);
  const sops = SOP_KEYS.map(([key, label, to], i) => {
    const d = sopSnaps[i].exists() ? sopSnaps[i].data() : null;
    return { key, label, to, by: d?.updatedBy || '', at: d?.updatedAt || null };
  });
  const edited = sops.filter(s => s.at).sort((a, b) => ms(b.at) - ms(a.at));
  const monthOf = t => { const d = new Date(ms(t)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

  // Onboarding: ticks counted against the current checklist (saved one, else the starter list), as the Onboarding page does.
  const stages = playbook.exists() && Array.isArray(playbook.data().stages) ? playbook.data().stages : withIds(STAGES);
  const ids = stages.flatMap(st => st.items.map(it => it.id)), total = ids.length;
  const users = Object.fromEntries(usersSnap.docs.map(u => [u.id, u.data()]));
  const onboarding = progSnap.docs.map(d => {
    const ticks = d.data().ticks || {}, u = users[d.id] || {};
    return { uid: d.id, name: u.displayName || 'Staff member', role: ROLE_LABEL[u.role] || '', done: ids.filter(id => ticks[id]).length };
  }).filter(n => n.done > 0 && n.done < total).sort((a, b) => a.done - b.done || a.name.localeCompare(b.name));

  return {
    newCount: staff.filter(c => c.status === 'new').length,
    openCount: staff.filter(c => c.status !== 'closed').length,
    staffComplaints: shown.slice(0, recentStaff.length),
    dirComplaints: shown.slice(recentStaff.length),
    unreadDir: director.filter(c => !c.read).length,
    sopsThisMonth: edited.filter(s => monthOf(s.at) === month).length,
    sopEdits: edited,
    onboarding, total
  };
}

// ---- Procurement and Marketing: New owner listings (newOwnerListings). Marketing's work starts once the payment
// is confirmed, so "for Marketing" = paid and not live yet.
export async function loadListingCounts() {
  const list = rows(await getDocs(collection(db, 'newOwnerListings')));
  const notLive = list.filter(x => x.status !== 'live');
  return { count: list.length, notLive: notLive.length, forMarketing: notLive.filter(x => x.payment?.confirmed).length,
    unsigned: notLive.filter(x => !x.agreement?.signed && x.agreement?.skipped).length };
}
