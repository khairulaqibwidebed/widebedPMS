// lib/performance/quarters.js — quarterly performance evaluation periods and their participants.
//
// performanceQuarters/{id}      { name, startDate, endDate, status, departmentIds: [string],
//                                  minCohEvaluations, weights: { coh, kpi, tms } }
// performanceParticipants/{quarterId}_{uid}  { quarterId, employeeId, employeeName, role, departmentId, position,
//                                  eligibilityStart, eligibilityEnd, participationStatus }
//
// Dates are plain 'YYYY-MM-DD' strings (matching months/{propertyId}_{month} elsewhere), not Firestore Timestamps,
// since they're configured as calendar days, not instants.
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, serverTimestamp, writeBatch, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { notifyUser } from '@/services/notificationService.js';
// Imported (not just re-exported) because this module uses DEFAULT_WEIGHTS and STATUSES itself below —
// `export { X } from './calc.js'` only re-exports for other modules, it doesn't bind X locally, which was a bug.
import { DEFAULT_WEIGHTS, STATUSES, canAdvance, nextStatus, weightsOk } from './calc.js';
export { DEFAULT_WEIGHTS, STATUSES, canAdvance, nextStatus, weightsOk };

const me = () => useSession();
function stamp(created) {
  const s = me();
  const base = { updatedAt: serverTimestamp(), updatedBy: s.user.uid, updatedByName: s.name };
  return created ? { ...base, createdAt: serverTimestamp(), createdBy: s.user.uid, createdByName: s.name } : base;
}
const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
const one = async ref => { const s = await getDoc(ref); return s.exists() ? { id: s.id, ...s.data() } : null; };

export async function audit(action, entity, details = '') {
  try {
    const s = me();
    await addDoc(collection(db, 'auditLog'), { at: serverTimestamp(), uid: s.user.uid, userName: s.name, role: s.role, action, entity, changes: [], reason: String(details).slice(0, 300) });
  } catch (e) { console.warn('audit', e); }
}

// Lifecycle: draft -> upcoming -> active -> evaluation -> pendingApproval -> finalized -> archived.
// finalized -> pendingApproval is the only backward move, and only for an authorized correction (Director).
// (STATUSES, canAdvance, nextStatus, weightsOk, DEFAULT_WEIGHTS live in ./calc.js — pure, unit-tested.)

// ---- Quarters ----
export const listQuarters = async () => rows(await getDocs(collection(db, 'performanceQuarters')))
  .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
export const getQuarter = id => one(doc(db, 'performanceQuarters', id));

export async function createQuarter(data) {
  if (!weightsOk(data.weights)) throw new Error('COH, KPI and TMS weights must add up to 100.');
  const ref = doc(collection(db, 'performanceQuarters'));
  await setDoc(ref, {
    // Only a start and end date (the extra evaluation/deadline dates were removed from the form).
    name: data.name, startDate: data.startDate, endDate: data.endDate,
    departmentIds: data.departmentIds || [],
    minCohEvaluations: Number(data.minCohEvaluations) || 1,
    weights: data.weights || DEFAULT_WEIGHTS,
    status: 'draft', ...stamp(true)
  });
  audit('performance.quarter.create', `performanceQuarters/${ref.id}`, data.name);
  return ref.id;
}

// Director/HR may edit a quarter's configuration at any status, by design — not just while draft. Editing a
// quarter that's already in evaluation, finalized, etc. can change what later recalculations produce; that's
// an accepted, deliberate tradeoff here (not a bug), so this only validates the weights, not the status.
export async function updateQuarter(id, patch) {
  if ('weights' in patch && !weightsOk(patch.weights)) throw new Error('COH, KPI and TMS weights must add up to 100.');
  await updateDoc(doc(db, 'performanceQuarters', id), { ...patch, ...stamp() });
  audit('performance.quarter.update', `performanceQuarters/${id}`, Object.keys(patch).join(', '));
}

// Director/HR may delete a quarter at any status, by design. This does not cascade-delete its participants,
// evaluations, KPI assignments, TMS snapshots or results — those stay queryable by quarterId even if the
// quarter document itself is gone, so deleting here doesn't silently destroy that history.
export async function deleteQuarter(id) {
  await deleteDoc(doc(db, 'performanceQuarters', id));
  audit('performance.quarter.delete', `performanceQuarters/${id}`);
}

export async function setStatus(id, status, reason = '') {
  if (!STATUSES.includes(status)) throw new Error('Unknown quarter status.');
  await updateDoc(doc(db, 'performanceQuarters', id), { status, ...stamp() });
  audit('performance.quarter.status', `performanceQuarters/${id}`, reason || status);
  if (status === 'evaluation') {
    const quarter = await getQuarter(id);
    const parts = (await listParticipants(id)).filter(p => p.participationStatus === 'active');
    for (const p of parts) {
      try { await notifyUser({ recipientUid: p.employeeId, title: 'Performance evaluation period opened', message: `COH and KPI self-assessment for ${quarter.name} is now open.`, type: 'performance', link: '/Performance/my', refId: id }); }
      catch (e) { console.warn('notify', e); }
    }
  }
}

// Director-only correction: step a finalized quarter back to pendingApproval. Bumps revisionNumber so
// performanceResults know to record what changes under this reopening as an auditable revision.
export async function reopenForCorrection(id, reason) {
  await updateDoc(doc(db, 'performanceQuarters', id), { status: 'pendingApproval', revisionNumber: (await getQuarter(id))?.revisionNumber + 1 || 2, ...stamp() });
  audit('performance.quarter.reopen', `performanceQuarters/${id}`, reason);
}

// ---- Participants ----
const partId = (quarterId, uid) => `${quarterId}_${uid}`;
export const listParticipants = async quarterId => rows(await getDocs(query(collection(db, 'performanceParticipants'), where('quarterId', '==', quarterId))))
  .sort((a, b) => String(a.employeeName || '').localeCompare(String(b.employeeName || '')));

// employees: [{ uid, name, role }] from agreements/data.js listStaff(). Adds the newly ticked, marks unticked
// as 'excluded' rather than deleting (so a removed participant's history for this quarter is still visible).
export async function setParticipants(quarterId, selectedUids, employees) {
  const existing = await listParticipants(quarterId);
  const existingByUid = new Map(existing.map(p => [p.employeeId, p]));
  const selected = new Set(selectedUids);
  const byUid = new Map(employees.map(e => [e.uid, e]));

  const entries = [...new Set([...selected, ...existingByUid.keys()])];
  for (let i = 0; i < entries.length; i += 400) {
    const batch = writeBatch(db);
    for (const uid of entries.slice(i, i + 400)) {
      const ref = doc(db, 'performanceParticipants', partId(quarterId, uid));
      const emp = byUid.get(uid);
      const prior = existingByUid.get(uid);
      if (selected.has(uid)) {
        batch.set(ref, {
          quarterId, employeeId: uid, employeeName: emp?.name || prior?.employeeName || 'Staff',
          // Role decides what they're scored on (Directors: COH only — calc.js isCohOnly)
          role: emp?.role || prior?.role || '',
          participationStatus: 'active',
          eligibilityStart: prior?.eligibilityStart || '', eligibilityEnd: prior?.eligibilityEnd || '',
          createdAt: prior?.createdAt || serverTimestamp()
        }, { merge: true });
      } else if (prior) {
        batch.set(ref, { participationStatus: 'excluded' }, { merge: true });
      }
    }
    await batch.commit();
  }
  audit('performance.participants.set', `performanceQuarters/${quarterId}`, `${selected.size} participant(s)`);
}

export async function setParticipantEligibility(quarterId, uid, { eligibilityStart, eligibilityEnd, participationStatus }) {
  await setDoc(doc(db, 'performanceParticipants', partId(quarterId, uid)), { eligibilityStart, eligibilityEnd, participationStatus }, { merge: true });
  audit('performance.participant.update', `performanceParticipants/${partId(quarterId, uid)}`, participationStatus);
}