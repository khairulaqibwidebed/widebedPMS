// lib/performance/tms.js — TMS task-completion scoring (Phase 5), and the immutable per-quarter snapshots
// that keep a finalized TMS score stable even if the underlying TMS task records change later.
//
// BLOCKED ON THE TMS REPO: there is currently no bulk "tasks for these employees in this date range" endpoint
// on the TMS side (confirmed in the Stage 1 analysis — src/lib/tms.js only supports create/update/list/inbox/link
// for Procurement's own linked tasks). fetchEmployeeTasks() below calls a 'performanceTasks' action that does not
// exist yet; until the TMS team adds it, every sync will fail with the error message built into sendToTasks().
// Everything downstream of the fetch (attribution, scoring, snapshotting) is real and ready to run the moment
// the endpoint exists — it only needs the TMS response shape confirmed in the TODO below to match reality.
//
// performanceTmsSnapshots/{quarterId}_{uid}  { quarterId, employeeId, eligibleTaskIds, completedTaskIds,
//   excludedTaskIds, exclusionReasons: { taskId: reason }, totalTasks, completedTasks, completionRate, score,
//   syncedAt, approvedBy, approvedAt, isFinal }
import { collection, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { sendToTasks } from '@/lib/tms.js';
export { attributeTasksFor, tmsScoreFromCounts } from './calc.js';
import { attributeTasksFor, tmsScoreFromCounts } from './calc.js';

const me = () => useSession();
const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
const one = async ref => { const s = await getDoc(ref); return s.exists() ? { id: s.id, ...s.data() } : null; };

export async function audit(action, entity, details = '') {
  try {
    const s = me();
    await addDoc(collection(db, 'auditLog'), { at: serverTimestamp(), uid: s.user.uid, userName: s.name, role: s.role, action, entity, changes: [], reason: String(details).slice(0, 300) });
  } catch (e) { console.warn('audit', e); }
}

// TODO once the TMS adds this endpoint: confirm each task has { id, title, status, assignees: [uid],
// dueDate, createdAt, completedAt, cancelled, reassignedFrom, reassignedAt }. Until then this throws.
export async function fetchEmployeeTasks(employeeUids, startDate, endDate) {
  const reply = await sendToTasks('performanceTasks', { data: { employeeUids, startDate, endDate } });
  return reply.tasks || [];
}

// Eligibility, attribution and scoring (Phase 5.3/5.4 — equal weight per task, cancelled excluded, multi-assignee
// counted once each) are pure functions in ./calc.js, re-exported above, unit-tested without a TMS connection.
// A reassigned task is attributed to whoever holds it in the TMS's own current `assignees` list — this module
// trusts that list rather than re-deriving reassignment history itself.

// ---- Snapshots ----
const snapId = (quarterId, uid) => `${quarterId}_${uid}`;
export const getSnapshot = (quarterId, uid) => one(doc(db, 'performanceTmsSnapshots', snapId(quarterId, uid)));
export const listSnapshots = async quarterId => rows(await getDocs(query(collection(db, 'performanceTmsSnapshots'), where('quarterId', '==', quarterId))));

// Writes a fresh (non-final) snapshot. Never overwrites a snapshot where isFinal is true — a re-sync after
// finalization creates a differently-keyed comparison doc instead, so the finalized score never silently changes.
export async function syncSnapshot(quarterId, employeeUid, tasks, tmsWeight) {
  const prior = await getSnapshot(quarterId, employeeUid);
  if (prior?.isFinal) throw new Error('This quarter\'s TMS score is finalized. Re-syncing would not change it — create a correction instead.');
  const { eligibleTaskIds, completedTaskIds, excludedTaskIds, exclusionReasons } = attributeTasksFor(employeeUid, tasks);
  const { score } = tmsScoreFromCounts(eligibleTaskIds.length, completedTaskIds.length, tmsWeight);
  await setDoc(doc(db, 'performanceTmsSnapshots', snapId(quarterId, employeeUid)), {
    quarterId, employeeId: employeeUid, eligibleTaskIds, completedTaskIds, excludedTaskIds, exclusionReasons,
    totalTasks: eligibleTaskIds.length, completedTasks: completedTaskIds.length,
    completionRate: eligibleTaskIds.length ? Math.round((completedTaskIds.length / eligibleTaskIds.length) * 10000) / 100 : null,
    score, syncedAt: serverTimestamp(), approvedBy: null, approvedAt: null, isFinal: false
  });
  audit('performance.tms.sync', `performanceTmsSnapshots/${snapId(quarterId, employeeUid)}`, `${completedTaskIds.length}/${eligibleTaskIds.length}`);
}

export async function approveSnapshot(quarterId, employeeUid) {
  const s = me();
  await setDoc(doc(db, 'performanceTmsSnapshots', snapId(quarterId, employeeUid)), { approvedBy: s.user.uid, approvedAt: serverTimestamp() }, { merge: true });
  audit('performance.tms.approve', `performanceTmsSnapshots/${snapId(quarterId, employeeUid)}`);
}
