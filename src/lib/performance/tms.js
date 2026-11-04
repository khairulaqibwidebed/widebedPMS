// lib/performance/tms.js — TMS task-completion scoring (Phase 5), and the per-quarter snapshots that keep a
// TMS score stable even if the underlying TMS task records change later.
//
// How the mark is set (confirmed business rule):
//   1. The Director picks, per employee, which TMS workspace(s) count for that employee this quarter — staff sit
//      in many workspaces and only some of them are their job.
//   2. Inside those workspaces, the Director ticks which of the employee's tasks belong to this quarter.
//   3. Score = completed ticked tasks / all ticked tasks (cancelled excluded) x the quarter's TMS weight.
//      Equal weight per task, never scaled by priority, difficulty or duration.
// Tasks in a SUPER PRIVATE TMS workspace are never sent to the PMS at all — the TMS drops them on its own server
// (see the TMS repo's api/_pms-performance.js), so they can't be seen or ticked here.
//
// performanceTmsSnapshots/{quarterId}_{uid}  { quarterId, employeeId, workspaceIds, workspaceNames,
//   tasks: [{ id, title, workspaceId, workspaceName, dueDate, completed, completedAt, cancelled, missing }],
//   eligibleTaskIds, completedTaskIds, excludedTaskIds, exclusionReasons: { taskId: reason },
//   totalTasks, completedTasks, completionRate, score, syncedAt, selectedBy, selectedByName,
//   approvedBy, approvedAt, isFinal }
import { collection, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { sendToTasks } from '@/lib/tms.js';
export { attributeTasksFor, tmsScoreFromCounts } from './calc.js';
import { tmsScoreFromCounts } from './calc.js';

const me = () => useSession();
const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
const one = async ref => { const s = await getDoc(ref); return s.exists() ? { id: s.id, ...s.data() } : null; };

export async function audit(action, entity, details = '') {
  try {
    const s = me();
    await addDoc(collection(db, 'auditLog'), { at: serverTimestamp(), uid: s.user.uid, userName: s.name, role: s.role, action, entity, changes: [], reason: String(details).slice(0, 300) });
  } catch (e) { console.warn('audit', e); }
}

// ---- Reading from the TMS (Director only — the TMS refuses anyone else) ----
// [{ id, title, status, completed, completedAt, cancelled, dueDate, createdAt, workspaceId, workspaceName, boardId, boardName }]
export async function fetchEmployeeTasks(employeeUid) {
  const reply = await sendToTasks('performanceTasks', { data: { employeeUid } });
  return reply.tasks || [];
}

// Workspaces the employee has tasks in, with how many: [{ id, name, count }], busiest first.
export function workspacesOf(tasks) {
  const map = new Map();
  for (const t of tasks) {
    const w = map.get(t.workspaceId) || { id: t.workspaceId, name: t.workspaceName, count: 0 };
    w.count++; map.set(t.workspaceId, w);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// An ISO instant -> 'YYYY-MM-DD' in the viewer's own time zone (quarters are configured as local calendar days).
export function localDay(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// Only a hint for the Director ("due this quarter"); what counts is whatever they actually tick.
export function dueInQuarter(task, quarter) {
  const day = localDay(task.dueDate);
  return !!day && !!quarter?.startDate && !!quarter?.endDate && day >= quarter.startDate && day <= quarter.endDate;
}

// ---- Snapshots ----
const snapId = (quarterId, uid) => `${quarterId}_${uid}`;
export const getSnapshot = (quarterId, uid) => one(doc(db, 'performanceTmsSnapshots', snapId(quarterId, uid)));
export const listSnapshots = async quarterId => rows(await getDocs(query(collection(db, 'performanceTmsSnapshots'), where('quarterId', '==', quarterId))));

// Which of this employee's tasks are already counted in ANOTHER quarter — so the Director doesn't count the
// same task twice. Map taskId -> quarterId. A warning only; it never blocks ticking.
export async function countedElsewhere(employeeUid, quarterId) {
  const all = rows(await getDocs(query(collection(db, 'performanceTmsSnapshots'), where('employeeId', '==', employeeUid))));
  const map = new Map();
  for (const s of all) if (s.quarterId !== quarterId) for (const id of (s.eligibleTaskIds || [])) map.set(id, s.quarterId);
  return map;
}

const summary = t => ({
  id: t.id, title: t.title || 'Untitled task', workspaceId: t.workspaceId, workspaceName: t.workspaceName || '',
  dueDate: t.dueDate || null, completed: !!t.completed, completedAt: t.completedAt || null,
  cancelled: !!t.cancelled, missing: !!t.missing
});

// Builds the snapshot fields from the ticked tasks. Cancelled tasks and tasks that have disappeared from the TMS
// are kept on the list (so the Director sees what happened) but excluded from the score.
function buildFields(quarter, tickedTasks) {
  const eligible = [], completed = [], excluded = [], reasons = {};
  for (const t of tickedTasks) {
    if (t.missing) { excluded.push(t.id); reasons[t.id] = 'No longer in the TMS (deleted, unassigned or moved to a Super Private workspace)'; continue; }
    if (t.cancelled) { excluded.push(t.id); reasons[t.id] = 'Cancelled'; continue; }
    eligible.push(t.id);
    if (t.completed) completed.push(t.id);
  }
  const { score } = tmsScoreFromCounts(eligible.length, completed.length, quarter.weights?.tms ?? 30);
  return {
    tasks: tickedTasks.map(summary),
    eligibleTaskIds: eligible, completedTaskIds: completed, excludedTaskIds: excluded, exclusionReasons: reasons,
    totalTasks: eligible.length, completedTasks: completed.length,
    completionRate: eligible.length ? Math.round((completed.length / eligible.length) * 10000) / 100 : null,
    score
  };
}

// Director saves which workspaces count and which tasks are ticked for this employee this quarter. Only tasks
// inside the chosen workspaces are kept. Saving a new selection clears any earlier approval.
export async function saveSelection(quarter, employeeUid, { workspaceIds, workspaceNames, tickedTasks }) {
  const s = me();
  const prior = await getSnapshot(quarter.id, employeeUid);
  if (prior?.isFinal) throw new Error('This quarter\'s TMS score is finalized — create a correction instead.');
  const wsSet = new Set(workspaceIds);
  const kept = tickedTasks.filter(t => wsSet.has(t.workspaceId));
  const fields = buildFields(quarter, kept);
  await setDoc(doc(db, 'performanceTmsSnapshots', snapId(quarter.id, employeeUid)), {
    quarterId: quarter.id, employeeId: employeeUid,
    workspaceIds: [...wsSet], workspaceNames: workspaceNames || [],
    ...fields,
    syncedAt: serverTimestamp(), selectedBy: s.user.uid, selectedByName: s.name,
    approvedBy: null, approvedAt: null, isFinal: false
  });
  audit('performance.tms.select', `performanceTmsSnapshots/${snapId(quarter.id, employeeUid)}`,
    `${fields.completedTasks}/${fields.totalTasks} ticked task(s) in ${(workspaceNames || []).join(', ') || 'no workspace'}`);
  return fields;
}

// Re-reads the ticked tasks from the TMS to pick up newly completed (or cancelled / removed) ones. Keeps the
// Director's selection exactly as it was. Clears approval only if the counts actually changed.
export async function refreshSnapshot(quarter, employeeUid) {
  const prior = await getSnapshot(quarter.id, employeeUid);
  if (!prior) return null;
  if (prior.isFinal) throw new Error('This quarter\'s TMS score is finalized — create a correction instead.');
  const fresh = new Map((await fetchEmployeeTasks(employeeUid)).map(t => [t.id, t]));
  const ticked = (prior.tasks || []).map(old => fresh.has(old.id) ? fresh.get(old.id) : { ...old, missing: true });
  const fields = buildFields(quarter, ticked);
  const changed = fields.totalTasks !== prior.totalTasks || fields.completedTasks !== prior.completedTasks;
  await setDoc(doc(db, 'performanceTmsSnapshots', snapId(quarter.id, employeeUid)), {
    ...fields, syncedAt: serverTimestamp(),
    ...(changed ? { approvedBy: null, approvedAt: null } : {})
  }, { merge: true });
  audit('performance.tms.refresh', `performanceTmsSnapshots/${snapId(quarter.id, employeeUid)}`, `${fields.completedTasks}/${fields.totalTasks}`);
  return fields;
}

export async function approveSnapshot(quarterId, employeeUid) {
  const s = me();
  await setDoc(doc(db, 'performanceTmsSnapshots', snapId(quarterId, employeeUid)), { approvedBy: s.user.uid, approvedAt: serverTimestamp() }, { merge: true });
  audit('performance.tms.approve', `performanceTmsSnapshots/${snapId(quarterId, employeeUid)}`);
}