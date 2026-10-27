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

export async function loadProperties() {
  const snap = await getDocs(collection(db, 'properties'));
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
    getDocs(query(collection(db, 'importBatches'), where('months', 'array-contains', month), limit(1))),
    getDocs(query(collection(db, 'importBatches'), orderBy('uploadedAt', 'desc'), limit(1)))
  ]);
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

// Director only: who signed in lately (users.lastLoginAt, written at sign-in).
export async function loadTeamActivity() {
  const snap = await getDocs(query(collection(db, 'users'), orderBy('lastLoginAt', 'desc'), limit(5)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Director only: open tickets on the Issues page. Counts cost one read each (per 1,000 tickets),
// and only the 5 newest open tickets are read in full.
export const ISSUE_TAGS = ['Director', 'IT', 'Admin', 'HR', 'Finance', 'Operations', 'Procurement', 'Marketing'];
export async function loadOpenIssues() {
  const col = collection(db, 'issues');
  const open = where('status', 'in', ['open', 'progress']);
  const count = q => getCountFromServer(q).then(s => s.data().count);
  const [total, notStarted, byTag, recentSnap] = await Promise.all([
    count(query(col, open)),
    count(query(col, where('status', '==', 'open'))),
    Promise.all(ISSUE_TAGS.map(tag => count(query(col, open, where('tags', 'array-contains', tag))))),
    getDocs(query(col, open, orderBy('createdAt', 'desc'), limit(5)))
  ]);
  return {
    total, notStarted,
    byTag: ISSUE_TAGS.map((tag, i) => ({ tag, count: byTag[i] })).filter(x => x.count),
    recent: recentSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  };
}
