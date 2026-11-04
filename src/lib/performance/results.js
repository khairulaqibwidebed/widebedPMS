// lib/performance/results.js — combines COH + KPI + TMS into one performanceResults doc per employee per
// quarter (Phase 7.6), finalizes the quarter, and (Stage 2) handles the one authorized way to correct a
// finalized result: requestCorrection() snapshots every participant's current finalized values into a
// performanceResults/{id}/revisions/{rev} subcollection doc (mirroring the existing statements/{id}/revisions
// pattern), then bumps revisionNumber and flips the result and quarter back to pendingApproval. The matching
// firestore.rules only allows this exact transition for a Director — see the Performance management section.
//
// performanceResults/{quarterId}_{uid}  { quarterId, employeeId, cohScore, kpiScore, tmsScore, finalScore,
//   componentStatuses: { coh, kpi, tms }, calculationVersion, snapshotRefs, approvalStatus, finalizedBy,
//   finalizedAt, revisionNumber, revisionReason, correctedBy, correctedAt }
// performanceResults/{quarterId}_{uid}/revisions/{revisionNumber}  — full snapshot of the doc above, taken
//   immediately before a correction overwrites it, plus revisionReason/correctedBy/correctedAt.
import { collection, doc, getDoc, getDocs, setDoc, query, where, serverTimestamp, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { notifyUser } from '@/services/notificationService.js';
import { exportFile } from '@/lib/agreements/table-io.js';
import { listStaff } from '@/lib/agreements/data.js';
import { isCohOnly, finalScoreFor } from './calc.js';
import { getQuarter, setStatus, listParticipants, reopenForCorrection } from './quarters.js';
import { cohScoreFor } from './coh.js';
import { listAssignmentsFor, listSubmissionsFor, kpiScoreFor } from './kpi.js';
import { getSnapshot, tmsScoreFromCounts } from './tms.js';

const me = () => useSession();
const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
const one = async ref => { const s = await getDoc(ref); return s.exists() ? { id: s.id, ...s.data() } : null; };
const CALC_VERSION = 1;

export async function audit(action, entity, details = '') {
  try {
    const s = me();
    await addDoc(collection(db, 'auditLog'), { at: serverTimestamp(), uid: s.user.uid, userName: s.name, role: s.role, action, entity, changes: [], reason: String(details).slice(0, 300) });
  } catch (e) { console.warn('audit', e); }
}

const resultId = (quarterId, uid) => `${quarterId}_${uid}`;
export const getResult = (quarterId, uid) => one(doc(db, 'performanceResults', resultId(quarterId, uid)));
// Only people who are CURRENTLY active participants of this quarter. A result saved for someone who was later
// unticked (or whose result was saved before they were removed) stays in Firestore for history, but is no longer
// listed, finalized or exported for the quarter.
export async function listResults(quarterId) {
  const [all, parts] = await Promise.all([
    getDocs(query(collection(db, 'performanceResults'), where('quarterId', '==', quarterId))).then(rows),
    listParticipants(quarterId)
  ]);
  const active = new Set(parts.filter(p => p.participationStatus === 'active').map(p => p.employeeId));
  return all.filter(r => active.has(r.employeeId));
}

// A person's PMS role: from their participant record (saved there since participants started storing it),
// else from the staff list — so quarters set up before that still work without re-saving participants.
let staffRoles = null;
async function roleOf(quarterId, employeeUid) {
  const part = await one(doc(db, 'performanceParticipants', `${quarterId}_${employeeUid}`));
  if (part?.role) return part.role;
  if (!staffRoles) {
    try { staffRoles = new Map((await listStaff()).map(e => [e.uid, e.role])); } catch (_) { staffRoles = new Map(); }
  }
  return staffRoles.get(employeeUid) || '';
}

// Works out one employee's three components and the combined score, WITHOUT saving anything. Shared by
// computeResult() (which saves) and liveResultFor() (My Performance, which only reads).
const NOT_APPLICABLE = { status: 'notApplicable', score: null };

async function gatherComponents(quarter, employeeUid, { cohOnly = false } = {}) {
  const { coh: cohWeight, kpi: kpiWeight, tms: tmsWeight } = quarter.weights;

  const coh = await cohScoreFor(quarter.id, employeeUid, quarter.minCohEvaluations || 1, cohWeight);
  // Directors are scored on COH only: KPI and TMS aren't read at all.
  if (cohOnly) return { coh, kpi: NOT_APPLICABLE, tms: NOT_APPLICABLE, snapshot: null };

  const assignments = await listAssignmentsFor(quarter.id, employeeUid);
  const subRows = await listSubmissionsFor(assignments);
  const submissionsByAssignmentId = Object.fromEntries(subRows.map(r => [r.assignment.id, r.submission || {}]));
  const kpi = kpiScoreFor(assignments, submissionsByAssignmentId, kpiWeight);

  const snapshot = await getSnapshot(quarter.id, employeeUid);
  const tms = snapshot ? tmsScoreFromCounts(snapshot.totalTasks, snapshot.completedTasks, tmsWeight) : { status: 'n/a', score: null };

  return { coh, kpi, tms, snapshot };
}


// Computes (and saves, as a provisional draft) one employee's three components plus the combined score.
// Returns the same shape whether or not everything is ready to finalize — callers check componentStatuses.
//
// Stage 2 fix: this used to unconditionally write approvalStatus: 'draft' and revisionNumber: 1 on every
// recompute — which, after a correction set approvalStatus to 'pendingApproval' and bumped revisionNumber,
// would have silently reset both the moment anyone clicked Recalculate. Now it only sets revisionNumber on
// first-ever write (merge leaves an existing value alone when the key is absent), and never downgrades
// approvalStatus away from 'pendingApproval' back to 'draft'. A finalized result is never touched at all —
// changing it must go through requestCorrection().
export async function computeResult(quarter, employeeUid, role) {
  const ref = doc(db, 'performanceResults', resultId(quarter.id, employeeUid));
  const prior = await one(ref);
  if (prior?.approvalStatus === 'finalized') return prior;

  const cohOnly = isCohOnly(role ?? await roleOf(quarter.id, employeeUid));
  const { coh, kpi, tms, snapshot } = await gatherComponents(quarter, employeeUid, { cohOnly });
  const finalScore = finalScoreFor({ coh, kpi, tms }, quarter.weights, { cohOnly });

  const data = {
    quarterId: quarter.id, employeeId: employeeUid,
    cohScore: coh.score, kpiScore: kpi.score, tmsScore: tms.score, finalScore,
    componentStatuses: { coh: coh.status, kpi: kpi.status, tms: tms.status },
    cohOnly,
    calculationVersion: CALC_VERSION,
    snapshotRefs: { cohAverageRating: coh.averageRating, kpiRatedOf: kpi.total ? `${kpi.rated}/${kpi.total}` : null, tmsSnapshotId: snapshot?.id || null },
    approvalStatus: prior?.approvalStatus === 'pendingApproval' ? 'pendingApproval' : 'draft'
  };
  if (!prior) data.revisionNumber = 1;
  await setDoc(ref, data, { merge: true });
  return { ...prior, ...data };
}

// My Performance: the employee's marks as they stand right now, read-only (never writes). A finalized result
// is returned exactly as locked. Otherwise KPI and TMS are worked out live from the latest approved ratings
// and synced tasks; COH marks are private to HR/Director, so when the employee can't read them here, the COH
// figure comes from the last saved calculation (refreshed whenever the Director approves a KPI, or
// Recalculate is clicked) — or shows as waiting for review if there isn't one yet.
// role: the viewer's own PMS role (My Performance passes session.role), so a Director sees a COH-only score.
export async function liveResultFor(quarter, employeeUid, role) {
  const saved = await getResult(quarter.id, employeeUid);
  if (saved?.approvalStatus === 'finalized' || ['finalized', 'archived'].includes(quarter.status)) return saved;

  const cohOnly = isCohOnly(role ?? await roleOf(quarter.id, employeeUid));
  let { coh, kpi, tms } = await gatherComponents(quarter, employeeUid, { cohOnly });
  if (coh.status === 'hidden' && saved?.componentStatuses?.coh && saved.componentStatuses.coh !== 'hidden') {
    coh = { status: saved.componentStatuses.coh, score: saved.cohScore };
  }

  return {
    ...(saved || {}), quarterId: quarter.id, employeeId: employeeUid,
    cohScore: coh.score, kpiScore: kpi.score, tmsScore: tms.score,
    finalScore: finalScoreFor({ coh, kpi, tms }, quarter.weights, { cohOnly }),
    componentStatuses: { coh: coh.status, kpi: kpi.status, tms: tms.status }, cohOnly,
    approvalStatus: saved?.approvalStatus || 'draft', live: true
  };
}

export async function recomputeAll(quarterId) {
  const quarter = await getQuarter(quarterId);
  const parts = (await listParticipants(quarterId)).filter(p => p.participationStatus === 'active');
  let roles = new Map();
  try { roles = new Map((await listStaff()).map(e => [e.uid, e.role])); } catch (_) { /* fall back to participant roles */ }
  const results = [];
  for (const p of parts) results.push(await computeResult(quarter, p.employeeId, p.role || roles.get(p.employeeId) || ''));
  audit('performance.results.recompute', `performanceQuarters/${quarterId}`, `${results.length} employee(s)`);
  return results;
}

export function readyToFinalize(results) {
  return results.length > 0 && results.every(r => r.finalScore != null);
}

// Locks every result and the quarter itself. Snapshots referenced here (performanceTmsSnapshots) should be
// flipped to isFinal separately once this succeeds — a correction after this point must go through
// quarters.reopenForCorrection(), never a direct overwrite.
export async function finalizeQuarter(quarterId) {
  const s = me();
  const quarter = await getQuarter(quarterId);
  const results = await recomputeAll(quarterId);
  if (!readyToFinalize(results)) throw new Error('Not every participant has an approved COH, KPI and TMS score yet.');
  for (const r of results) {
    await setDoc(doc(db, 'performanceResults', resultId(quarterId, r.employeeId)),
      { approvalStatus: 'finalized', finalizedBy: s.user.uid, finalizedAt: serverTimestamp() }, { merge: true });
    try { await notifyUser({ recipientUid: r.employeeId, title: 'Final performance score released', message: `${quarter.name}: ${r.finalScore.toFixed(2)} / 100.`, type: 'performance', link: '/Performance/my', refId: quarterId }); }
    catch (e) { console.warn('notify', e); }
  }
  await setStatus(quarterId, 'finalized', 'Final performance approval');
  audit('performance.quarter.finalize', `performanceQuarters/${quarterId}`, `${results.length} result(s) locked`);
}

// ---- Stage 2: authorized correction workflow ----
// Director-only. Snapshots every participant's current (finalized) result into a revisions/{rev} subcollection
// doc — preserving who finalized it, when, and the scores — before bumping revisionNumber and flipping the
// result and quarter back to pendingApproval. Firestore rules require this exact shape (revisionNumber+1,
// a non-empty revisionReason, correctedBy == the caller) on the one write that's allowed to touch a finalized
// performanceResults doc, so a correction can never be applied without a reason and a recorded identity.
export async function requestCorrection(quarterId, reason) {
  if (!reason || !reason.trim()) throw new Error('A reason is required to reopen a finalized quarter for correction.');
  const s = me();
  const quarter = await getQuarter(quarterId);
  if (quarter?.status !== 'finalized') throw new Error('Only a finalized quarter can be reopened for correction.');
  const results = await listResults(quarterId);
  for (const r of results) {
    const priorRevision = r.revisionNumber || 1;
    const resultRef = doc(db, 'performanceResults', resultId(quarterId, r.employeeId));
    // Snapshot first: the pre-correction values, with who/why/when, written before the parent doc changes.
    await setDoc(doc(resultRef, 'revisions', String(priorRevision)), {
      revision: priorRevision,
      cohScore: r.cohScore, kpiScore: r.kpiScore, tmsScore: r.tmsScore, finalScore: r.finalScore,
      componentStatuses: r.componentStatuses, approvalStatus: r.approvalStatus,
      calculationVersion: r.calculationVersion, snapshotRefs: r.snapshotRefs || null,
      finalizedBy: r.finalizedBy || null, finalizedAt: r.finalizedAt || null,
      revisionReason: reason, correctedBy: s.user.uid, correctedByName: s.name, correctedAt: serverTimestamp()
    });
    await setDoc(resultRef, {
      approvalStatus: 'pendingApproval', revisionNumber: priorRevision + 1,
      revisionReason: reason, correctedBy: s.user.uid, correctedByName: s.name, correctedAt: serverTimestamp()
    }, { merge: true });
  }
  await reopenForCorrection(quarterId, reason);
  audit('performance.results.correction.request', `performanceQuarters/${quarterId}`, `${results.length} result(s), reason: ${reason}`);
  return results.length;
}

export const listRevisions = async (quarterId, employeeUid) => rows(await getDocs(
  collection(db, 'performanceResults', resultId(quarterId, employeeUid), 'revisions')
)).sort((a, b) => b.revision - a.revision);

// Phase 12 (Excel export): reuses the same table-io.js exporter as Agreements, so there is one Excel-writing
// code path in the app, not two. Component statuses print in place of a null score (never blank, never "0").
export async function exportResultsReport(quarter, results, nameOf) {
  const cell = (score, status) => status === 'insufficientData' ? 'Insufficient data' : status === 'pending' ? 'Pending'
    : status === 'n/a' ? 'N/A' : status === 'notApplicable' ? 'Not scored (Director)' : status === 'hidden' ? 'Pending' : score;
  const header = ['Employee', 'COH (' + quarter.weights.coh + ')', 'KPI (' + quarter.weights.kpi + ')', 'TMS (' + quarter.weights.tms + ')', 'Final score', 'Approval status'];
  const rows = [header, ...results.map(r => [
    nameOf(r.employeeId), cell(r.cohScore, r.componentStatuses.coh), cell(r.kpiScore, r.componentStatuses.kpi),
    cell(r.tmsScore, r.componentStatuses.tms), r.finalScore ?? 'Pending', r.approvalStatus
  ])];
  await exportFile('xlsx', `performance-${quarter.name}`.replace(/\s+/g, '-'), rows);
  audit('performance.results.export', `performanceQuarters/${quarter.id}`, `${results.length} row(s)`);
}