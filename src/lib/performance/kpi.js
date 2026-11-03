// lib/performance/kpi.js — per-employee KPI assignments, self-assessment, HR/Director review and discussions.
//
// kpiAssignments/{id}   { quarterId, employeeId, employeeName, title, description, target, weightage, deadline,
//                         completionCriteria, status: 'draft'|'active'|'archived', createdBy, createdByName, createdAt }
// kpiSubmissions/{assignmentId}   (1:1 with its assignment — same id, so there's only ever one submission to find)
//                       { assignmentId, employeeId, selfRating, selfComments, evidence: [{type,url}], completionTimestamp,
//                         originalRating, revisedRating, finalApprovedRating, reviewerId, reviewerComments, reviewReason,
//                         discussionStatus: 'none'|'requested'|'scheduled'|'resolved',
//                         status: 'notStarted'|'inProgress'|'submitted'|'underReview'|'revisionRequested'|'approved'|'rejected',
//                         submittedAt, reviewedAt, history: [{ at, byUid, byName, fromStatus, toStatus, rating, reason }] }
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, serverTimestamp, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { notifyUser, notifyRole } from '@/services/notificationService.js';

async function notifyReviewers(title, message, link, refId) {
  for (const role of ['hr', 'director']) {
    try { await notifyRole({ recipientRole: role, title, message, type: 'kpi', link, refId }); } catch (e) { console.warn('notify', e); }
  }
}

export { totalWeightage, suggestDeadlineRating, DEFAULT_DEADLINE_THRESHOLDS, kpiScoreFor } from './calc.js';
import { suggestDeadlineRating } from './calc.js';

const me = () => useSession();
const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
const one = async ref => { const s = await getDoc(ref); return s.exists() ? { id: s.id, ...s.data() } : null; };

export async function audit(action, entity, details = '') {
  try {
    const s = me();
    await addDoc(collection(db, 'auditLog'), { at: serverTimestamp(), uid: s.user.uid, userName: s.name, role: s.role, action, entity, changes: [], reason: String(details).slice(0, 300) });
  } catch (e) { console.warn('audit', e); }
}

// ---- Assignments ----
export const listAssignmentsFor = async (quarterId, employeeId) => rows(await getDocs(
  query(collection(db, 'kpiAssignments'), where('quarterId', '==', quarterId), where('employeeId', '==', employeeId))
)).filter(a => a.status !== 'archived');

export const listAllAssignments = async quarterId => rows(await getDocs(query(collection(db, 'kpiAssignments'), where('quarterId', '==', quarterId))));

export async function createAssignment(data) {
  const s = me(), ref = doc(collection(db, 'kpiAssignments'));
  await setDoc(ref, {
    quarterId: data.quarterId, employeeId: data.employeeId, employeeName: data.employeeName,
    title: data.title, description: data.description || '', target: data.target || '',
    weightage: Number(data.weightage), deadline: data.deadline || '', completionCriteria: data.completionCriteria || '',
    status: 'active', createdBy: s.user.uid, createdByName: s.name, createdAt: serverTimestamp()
  });
  audit('performance.kpi.assignment.create', `kpiAssignments/${ref.id}`, `${data.employeeName}: ${data.title}`);
  try { await notifyUser({ recipientUid: data.employeeId, title: 'New KPI assigned', message: `${data.title} (${data.weightage}% weight).`, type: 'kpi', link: '/Performance/kpi', refId: ref.id }); }
  catch (e) { console.warn('notify', e); }
  return ref.id;
}
export async function updateAssignment(id, patch) {
  await updateDoc(doc(db, 'kpiAssignments', id), patch);
  audit('performance.kpi.assignment.update', `kpiAssignments/${id}`, Object.keys(patch).join(', '));
}

// ---- Submissions ----
export const getSubmission = assignmentId => one(doc(db, 'kpiSubmissions', assignmentId));

export async function listSubmissionsFor(assignments) {
  const subs = await Promise.all(assignments.map(a => getSubmission(a.id)));
  return assignments.map((a, i) => ({ assignment: a, submission: subs[i] }));
}

function historyEntry(fromStatus, toStatus, rating, reason) {
  const s = me();
  return { at: Date.now(), byUid: s.user.uid, byName: s.name, fromStatus, toStatus, rating: rating ?? null, reason: reason || '' };
}

export async function submitSelfAssessment(assignment, { selfRating, selfComments, evidence, completionTimestamp }) {
  const s = me();
  const prior = await getSubmission(assignment.id);
  const history = [...(prior?.history || []), historyEntry(prior?.status || 'notStarted', 'submitted', selfRating)];
  await setDoc(doc(db, 'kpiSubmissions', assignment.id), {
    assignmentId: assignment.id, employeeId: assignment.employeeId,
    selfRating: Number(selfRating), selfComments: selfComments || '', evidence: evidence || [],
    completionTimestamp: completionTimestamp || null,
    originalRating: prior?.originalRating ?? Number(selfRating), revisedRating: prior?.revisedRating ?? null,
    finalApprovedRating: null, reviewerId: null, reviewerComments: '', reviewReason: '',
    discussionStatus: prior?.discussionStatus || 'none', status: 'submitted',
    submittedAt: serverTimestamp(), reviewedAt: null, history
  }, { merge: true });
  audit('performance.kpi.submission.submit', `kpiSubmissions/${assignment.id}`, `${assignment.title}: self-rated ${selfRating}`);
  await notifyReviewers('KPI submission received', `${s.name} submitted "${assignment.title}" (self-rated ${selfRating}/5).`, '/Performance/kpi', assignment.id);
}

// HR/Director review. decision: 'accept' keeps the self-rating as final; 'revise' records a different final rating
// and keeps the original self-rating untouched in originalRating; 'reject' / 'requestEvidence' leave finalApprovedRating null.
export async function reviewSubmission(assignmentId, { decision, rating, reviewerComments, reviewReason }) {
  const s = me();
  const prior = await getSubmission(assignmentId);
  if (!prior) throw new Error('No self-assessment submitted yet.');
  const statusMap = { accept: 'approved', revise: 'approved', reject: 'rejected', requestEvidence: 'revisionRequested' };
  const toStatus = statusMap[decision];
  const finalApprovedRating = decision === 'accept' ? prior.selfRating : decision === 'revise' ? Number(rating) : null;
  const history = [...(prior.history || []), historyEntry(prior.status, toStatus, finalApprovedRating, reviewReason)];
  await updateDoc(doc(db, 'kpiSubmissions', assignmentId), {
    status: toStatus, revisedRating: decision === 'revise' ? Number(rating) : prior.revisedRating,
    finalApprovedRating, reviewerId: s.user.uid, reviewerComments: reviewerComments || '', reviewReason: reviewReason || '',
    reviewedAt: serverTimestamp(), history
  });
  audit('performance.kpi.submission.review', `kpiSubmissions/${assignmentId}`, `${decision}${rating != null ? ' -> ' + rating : ''}`);
  const assignment = await one(doc(db, 'kpiAssignments', assignmentId));
  const verb = decision === 'revise' ? 'KPI rating changed' : decision === 'reject' ? 'KPI submission rejected' : decision === 'requestEvidence' ? 'Additional evidence requested' : 'KPI review completed';
  try { await notifyUser({ recipientUid: prior.employeeId, title: verb, message: `"${assignment?.title || 'Your KPI'}": ${reviewerComments || reviewReason || verb}.`, type: 'kpi', link: '/Performance/kpi', refId: assignmentId }); }
  catch (e) { console.warn('notify', e); }
}

export async function requestDiscussion(quarterId, assignmentId, reason) {
  const s = me();
  await updateDoc(doc(db, 'kpiSubmissions', assignmentId), { discussionStatus: 'requested' });
  const ref = await addDoc(collection(db, 'performanceDiscussions'), {
    quarterId, employeeId: s.user.uid, kpiAssignmentId: assignmentId, requestReason: reason,
    status: 'requested', assignedReviewer: null, scheduledAt: null, outcome: '', resolutionComments: '',
    createdAt: serverTimestamp(), resolvedAt: null
  });
  audit('performance.kpi.discussion.request', `performanceDiscussions/${ref.id}`, reason);
  await notifyReviewers('Discussion request received', `${s.name} would like to discuss a KPI rating: ${reason}`, '/Performance/kpi', ref.id);
  return ref.id;
}

export async function resolveDiscussion(discussionId, assignmentId, employeeId, { outcome, resolutionComments }) {
  const s = me();
  await updateDoc(doc(db, 'performanceDiscussions', discussionId), { status: 'resolved', outcome, resolutionComments, resolvedAt: serverTimestamp() });
  await updateDoc(doc(db, 'kpiSubmissions', assignmentId), { discussionStatus: 'resolved' });
  audit('performance.kpi.discussion.resolve', `performanceDiscussions/${discussionId}`, outcome);
  try { await notifyUser({ recipientUid: employeeId, title: 'Discussion resolved', message: resolutionComments || outcome || 'Your discussion request has been resolved.', type: 'kpi', link: '/Performance/kpi', refId: assignmentId }); }
  catch (e) { console.warn('notify', e); }
}

export const listDiscussions = async quarterId => rows(await getDocs(query(collection(db, 'performanceDiscussions'), where('quarterId', '==', quarterId))));
// (kpiScoreFor, totalWeightage, suggestDeadlineRating, DEFAULT_DEADLINE_THRESHOLDS live in ./calc.js — pure, unit-tested.)
