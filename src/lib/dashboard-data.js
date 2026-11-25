// Reads what both dashboards need for one month and one property (or all properties).
// "Completed" figures come from statements and everything else from bookings, expenses and units, through the
// month summaries (scale work, 22 Oct 2026): "All properties" adds up the active properties' summaries.
// Completion is per unit: only statements with status 'completed' count (a reopened one is a draft again);
// the month document says 'completed' only when every unit is done ('partial' while some are).
import { db } from './firebase.js';
import { collection, getDocs, query, where, orderBy, limit, getCountFromServer }
  from 'firebase/firestore';
import { propertyMonth, canWriteSummaries } from './summary-data.js';
import { combine } from './summaries.js';
import { scoped, getScoped, countScoped, myProperties, myStaffUids } from './property-scope.js';
import { dayOffset } from './format.js';
import { leaseLabel, bookingNights } from './lease-term.js';
import { groupDays, placeText, loadStaff, loadConfig, loadHolidays, holidayFor, weekday } from '@/pages/HR/attendance.js';

export async function loadProperties() {
  const snap = await getScoped(scoped(collection(db, 'properties'), '__id'));   // only my properties (lib/property-scope.js)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Each property's month summary (lib/summaries.js) holds what this page used to work out from every unit, booking,
// expense and statement of the month: one read per property (none when this browser's saved copy is current).
// A stale or missing summary is worked out again for just the units that changed (Finance / Director write it back).
export async function loadMonth({ properties, propertyId, month, me }) {
  const scope = propertyId === 'all' ? properties : properties.filter(p => p.id === propertyId);
  const canWrite = canWriteSummaries(me);
  const [pms, uploadSnap, lastUploadSnap] = await Promise.all([
    Promise.all(scope.map(p => propertyMonth(p, month, { me, canWrite }))),
    uploadsFor(month)
  ]).then(([a, b]) => [a, ...b]);
  const sum = combine(pms.map(x => x.summary));
  // The month is completed when every property's month document says so (one property: that one)
  const completed = scope.length > 0 && pms.every(x => x.month?.status === 'completed');

  // ---- KPIs ----
  const rentalIncome = sum.income;
  const balToPay = sum.balToPay;

  // ---- Needs attention (pre-close checklist, OWN-03 / ARR-12); a completed unit needs nothing more ----
  // Bookings first (by reservation number, the order Firestore returns them), then negative payouts, then units not set up.
  const attention = [...sum.items.map(x => ({ text: x.text, tag: x.tag })), ...sum.negatives.map(x => ({ text: x.text, tag: 'Negative' })),
    ...sum.setup.map(x => ({ text: x.text, tag: 'Set up' }))];
  const attentionCount = sum.itemCount + sum.negativeCount + sum.setup.length;

  // ---- Statements by status ----
  const estimated = sum.byStatus.estimated + (sum.noUnitCtrip ? 1 : 0);
  const byStatus = { ...sum.byStatus, estimated };

  // ---- Month-end progress ----
  const uploaded = !uploadSnap.empty;
  const ctripLeft = estimated;
  const statementsDone = sum.statementsDone;
  const done = [uploaded, uploaded && (sum.expenses > 0 || completed), uploaded && ctripLeft === 0, completed, completed];
  const current = done.indexOf(false);
  const steps = ['Upload', 'Expenses', 'Ctrip', 'Review', 'Complete'].map((label, i) => ({ label, n: i + 1, done: done[i], current: i === current }));
  let progressNote;
  if (!uploaded) progressNote = 'No eZee report uploaded for this month yet.';
  else if (completed) progressNote = 'Month completed. Statements are read-only.';
  else if (statementsDone) progressNote = `${statementsDone} unit statement${statementsDone > 1 ? 's' : ''} completed so far.` +
    (ctripLeft ? ` ${ctripLeft} unit${ctripLeft > 1 ? 's' : ''} ${ctripLeft > 1 ? 'still need' : 'still needs'} a Ctrip amount.` : ' Approve & complete the rest on their statements.');
  else if (ctripLeft) progressNote = `${ctripLeft} unit${ctripLeft > 1 ? 's' : ''} ${ctripLeft > 1 ? 'still need' : 'still needs'} a Ctrip amount. Approve & complete unlocks when nothing is Estimated.`;
  else progressNote = 'Ready for review. Clear Needs attention, then Approve & complete.';

  const recentExpenses = sum.recent.map(e => ({ ...e, signedAmount: e.kind === 'reimburse' ? e.amount : -e.amount }));

  return {
    unitCount: sum.unitCount,
    rentalIncome, balToPay, statementsDone,
    attention, attentionCount, setupItems: attention.filter(a => a.tag === 'Set up'), byStatus, steps, progressNote, recentExpenses,
    lastUpload: lastUploadSnap.empty ? null : lastUploadSnap.docs[0].data().uploadedAt
  };
}

// Was this month uploaded, and the newest upload. A Director asks Firestore directly. Staff read their properties'
// newest uploads (propertyIds array-contains-any; Firestore allows only one array filter, so the month is picked here).
async function uploadsFor(month) {
  const col = collection(db, 'importBatches');
  if (!myProperties()) return Promise.all([
    getDocs(query(col, where('months', 'array-contains', month), limit(1))),
    getDocs(query(col, orderBy('uploadedAt', 'desc'), limit(1)))
  ]);
  const snap = await getScoped(scoped(query(col, orderBy('uploadedAt', 'desc'), limit(60)), 'propertyIds'), { order: ['uploadedAt', 'desc'], limit: 60 });
  const ofMonth = snap.docs.filter(d => (d.data().months || []).includes(month));
  return [{ empty: !ofMonth.length, docs: ofMonth.slice(0, 1) }, { empty: snap.empty, docs: snap.docs.slice(0, 1) }];
}

// Director only: who signed in lately (users.lastLoginAt, written at sign-in).
export async function loadTeamActivity() {
  const snap = await getDocs(query(collection(db, 'users'), orderBy('lastLoginAt', 'desc'), limit(5)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Director only: open tickets on the Issues page. Counts cost one read each (per 1,000 tickets),
// and only the 5 newest open tickets are read in full.
export const ISSUE_TAGS = ['Director', 'IT', 'Admin', 'HR', 'Finance', 'Operations', 'Procurement', 'Marketing'];
// How many unit statements Finance has sent that are waiting for a Director.
export async function loadApprovalsWaiting() {
  return countScoped(scoped(query(collection(db, 'approvals'), where('status', '==', 'submitted'))));
}

export async function loadOpenIssues() {
  const col = collection(db, 'issues');
  const open = where('status', 'in', ['open', 'progress']);
  const count = q => getCountFromServer(q).then(s => s.data().count);
  // Newest first needs the issues index (status + createdAt, firebase/firestore.indexes.json). Until it exists in the
  // console, read the open tickets without it and sort them here, so the card still loads.
  const newest = () => getDocs(query(col, open, orderBy('createdAt', 'desc'), limit(4)))
    .catch(async e => {
      if (e.code !== 'failed-precondition') throw e;
      console.warn('Create the issues index (status, createdAt) in the Firestore console to avoid this fallback:', e.message);
      const snap = await getDocs(query(col, open, limit(50)));
      const ms = d => d.data().createdAt?.toMillis?.() || 0;
      return { docs: snap.docs.sort((a, b) => ms(b) - ms(a)).slice(0, 4) };
    });
  const [total, notStarted, recentSnap] = await Promise.all([
    count(query(col, open)),
    count(query(col, where('status', '==', 'open'))),
    newest()
  ]);
  return {
    total, notStarted,
    recent: recentSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  };
}

// ---- Director dashboard "Today" tiles (24 Nov 2026, Khairul): Total No of Units, Today's Move-in / Move-out,
// Today's Duty Staff. "Today" is Malaysia time (dayOffset). Loaded once when the dashboard opens; the property
// picker then narrows units and moves on the page (duty staff are company-wide, a Branch Director's own staff only).

// Active units per property, counted on the server (2 count reads per property, no unit documents downloaded).
export async function loadUnitCounts(properties) {
  const units = collection(db, 'units');
  const count = q => getCountFromServer(q).then(s => s.data().count);
  const out = {};
  await Promise.all(properties.map(async p => {
    const [all, off] = await Promise.all([count(query(units, where('propertyId', '==', p.id))), count(query(units, where('propertyId', '==', p.id), where('active', '==', false)))]);
    out[p.id] = all - off;
  }));
  return out;
}

// Move-ins (arrival today) and move-outs (departure today), from the Bookings page (offlineBookings) only (Khairul,
// 24 Nov 2026: not eZee). Cancelled are left out; Awaiting payment is kept and tagged. A lease ended early has its
// departure moved to the end date, so it shows as a move-out that day.
export async function loadMoves(properties) {
  const today = dayOffset(0), names = Object.fromEntries(properties.map(p => [p.id, p.name || p.id]));
  const off = collection(db, 'offlineBookings');
  const [oa, od] = await Promise.all([
    getScoped(scoped(query(off, where('arrival', '==', today)))),
    getScoped(scoped(query(off, where('departure', '==', today))))
  ]);
  const moves = [];
  for (const [snap, dir] of [[oa, 'in'], [od, 'out']]) {
    for (const d of snap.docs) {
      const b = { id: d.id, ...d.data() };
      if (b.status === 'cancelled') continue;
      moves.push({ key: b.id + dir, dir, id: b.id, bookingNo: b.bookingNo || b.id, unit: b.unitCode || b.unitId || '(no unit)', propertyId: b.propertyId || '',
        propertyName: names[b.propertyId] || b.propertyName || '', lease: leaseLabel(bookingNights(b)), pending: b.status === 'pending', ended: !!b.earlyTermination?.date && dir === 'out' });
    }
  }
  return moves.sort((a, b) => (a.dir === b.dir ? 0 : a.dir === 'in' ? -1 : 1) || a.propertyName.localeCompare(b.propertyName) || a.unit.localeCompare(b.unit));
}

// Duty staff = everyone who clocked in today on the Staff Attendance app (any session), whether or not they have
// clocked out since. Rules: attendance is read by HR and Directors (hrOrDir).
const myTime = t => {
  const d = t?.toDate ? t.toDate() : t ? new Date(t) : null;
  return d && !isNaN(d) ? d.toLocaleTimeString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: 'numeric', minute: '2-digit', hour12: true }) : '';
};
export async function loadDutyStaff() {
  const today = dayOffset(0);
  const [snap, allowed] = await Promise.all([getDocs(query(collection(db, 'attendance'), where('date', '==', today))), myStaffUids()]);
  const days = groupDays(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  return [...days.values()]
    .filter(d => d.clockIn && (!allowed || allowed.has(d.uid)))
    .map(d => ({ uid: d.uid, name: d.name || 'Unknown', role: d.role || '', inAt: myTime(d.clockIn), outAt: d.open ? '' : myTime(d.clockOut), open: d.open, place: placeText(d, 'In') }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Missing today (24 Nov 2026, Khairul): active staff (the same list as HR > Attendance, a Branch Director's own staff only;
// the AI Agent login left out) with no clock-in today. Nobody is missing on a day off (office work days in the attendance
// settings) or on their public holiday. dutyUids = the uids already on duty.
export async function loadMissingStaff(dutyUids) {
  const today = dayOffset(0);
  const [staff, cfg, holidays] = await Promise.all([loadStaff(), loadConfig(), loadHolidays(today, today)]);
  if (!(cfg.workDays || []).includes(weekday(today))) return { offDay: true, list: [] };
  const on = new Set(dutyUids);
  return { offDay: false, list: staff.filter(u => u.role !== 'ai' && !on.has(u.uid) && !holidayFor(holidays, today, u.uid)).map(u => ({ uid: u.uid, name: u.name, role: u.role })) };
}
