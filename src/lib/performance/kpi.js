// lib/performance/kpi.js — per-employee KPI assignments, self-assessment, director review and discussions.
//
// kpiAssignments/{id}   { quarterId, employeeId, employeeName, title, description, target, weightage, deadline,
//                         completionCriteria, scoringRules: {earlyDays,earlyRating,onTimeRating,overdueRating}|null,
//                         status: 'draft'|'active'|'archived', createdBy, createdByName, createdAt }
// kpiSubmissions/{assignmentId}   (1:1 with its assignment — same id, so there's only ever one submission to find)
//                       { assignmentId, employeeId, selfRating, selfComments, completionTimestamp,
//                         directorRating, directorComments, directorId, ratedAt,
//                         originalRating, revisedRating, finalApprovedRating, reviewerId, reviewerComments, reviewReason,
//                         discussionStatus: 'none'|'requested'|'replied'|'resolved',
//                         status: 'notStarted'|'submitted'|'pendingReview'|'discussionRequested'|'resubmitted'|'done',
//                         submittedAt, reviewedAt, history: [{ at, byUid, byName, fromStatus, toStatus, rating, reason }] }
// kpiDiscussions/{submissionId}   { submissionId, assignmentId, employeeId, directorId, quarterId,
//                                   thread: [{ by, byUid, byName, message, at, role: 'director'|'employee' }],
//                                   status: 'active'|'resolved', createdAt, resolvedAt }
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, serverTimestamp, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { notifyUser, notifyRole } from '@/services/notificationService.js';

async function notifyReviewers(title, message, link, refId) {
  try { await notifyRole({ recipientRole: 'director', title, message, type: 'kpi', link, refId }); } catch (e) { console.warn('notify', e); }
}

export { totalWeightage, suggestDeadlineRating, DEFAULT_DEADLINE_THRESHOLDS, customThresholds, kpiScoreFor } from './calc.js';
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
    // Optional per-task early/on-time/overdue override (calc.js::customThresholds shape); null means "use the
    // app-wide DEFAULT_DEADLINE_THRESHOLDS", same as before this field existed.
    scoringRules: data.scoringRules || null,
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

export async function submitSelfAssessment(assignment, { selfRating, selfComments, completionTimestamp }) {
  const s = me();
  const prior = await getSubmission(assignment.id);
  const history = [...(prior?.history || []), historyEntry(prior?.status || 'notStarted', 'submitted', selfRating)];
  await setDoc(doc(db, 'kpiSubmissions', assignment.id), {
    assignmentId: assignment.id, employeeId: assignment.employeeId,
    selfRating: Number(selfRating), selfComments: selfComments || '',
    completionTimestamp: completionTimestamp || null,
    directorRating: null, directorComments: '', directorId: null, ratedAt: null,
    originalRating: prior?.originalRating ?? Number(selfRating), revisedRating: prior?.revisedRating ?? null,
    finalApprovedRating: null, reviewerId: null, reviewerComments: '', reviewReason: '',
    discussionStatus: 'none', status: 'submitted',
    submittedAt: serverTimestamp(), reviewedAt: null, history
  }, { merge: true });
  audit('performance.kpi.submission.submit', `kpiSubmissions/${assignment.id}`, `${assignment.title}: self-rated ${selfRating}`);
  await notifyReviewers('KPI submission received', `${s.name} submitted "${assignment.title}" (self-rated ${selfRating}/5).`, '/Performance/kpi', assignment.id);
}

// Director review: provide rating and comments, then decide action.
export async function provideDirectorReview(assignmentId, { directorRating, directorComments }) {
  const s = me();
  const prior = await getSubmission(assignmentId);
  if (!prior) throw new Error('No self-assessment submitted yet.');
  if (prior.status !== 'submitted') throw new Error('KPI must be in submitted state to review.');

  await updateDoc(doc(db, 'kpiSubmissions', assignmentId), {
    directorRating: Number(directorRating), directorComments: directorComments || '',
    directorId: s.user.uid, ratedAt: serverTimestamp()
  });
  audit('performance.kpi.director.rated', `kpiSubmissions/${assignmentId}`, `rated ${directorRating}`);
}

// Director sends back KPI for discussion without final approval.
export async function sendBackForDiscussion(assignmentId, { directorRating, directorComments }) {
  const s = me();
  const prior = await getSubmission(assignmentId);
  if (!prior) throw new Error('No self-assessment submitted yet.');

  const newStatus = prior.status === 'resubmitted' ? 'discussionRequested' : 'discussionRequested';
  const history = [...(prior.history || []), historyEntry(prior.status, newStatus, null, 'Sent back for discussion')];

  await updateDoc(doc(db, 'kpiSubmissions', assignmentId), {
    status: newStatus, directorRating: Number(directorRating), directorComments: directorComments || '',
    directorId: s.user.uid, ratedAt: serverTimestamp(), discussionStatus: 'requested', history
  });

  const assignment = await one(doc(db, 'kpiAssignments', assignmentId));
  audit('performance.kpi.director.sendBack', `kpiSubmissions/${assignmentId}`, `sent back for discussion`);
  try {
    await notifyUser({
      recipientUid: prior.employeeId,
      title: 'KPI review - Discussion requested',
      message: `Your KPI "${assignment?.title}" has been reviewed. Your supervisor would like to discuss: ${directorComments.slice(0, 50)}...`,
      type: 'kpi',
      link: '/Performance/kpi',
      refId: assignmentId
    });
  } catch (e) { console.warn('notify', e); }
}

// Director approves final rating.
export async function approveKpiRating(assignmentId, { directorRating, directorComments }) {
  const s = me();
  const prior = await getSubmission(assignmentId);
  if (!prior) throw new Error('No self-assessment submitted yet.');

  const finalRating = Number(directorRating);
  const history = [...(prior.history || []), historyEntry(prior.status, 'done', finalRating, 'Final approval')];

  await updateDoc(doc(db, 'kpiSubmissions', assignmentId), {
    status: 'done', finalApprovedRating: finalRating, reviewerId: s.user.uid,
    directorRating: finalRating, directorComments: directorComments || '',
    directorId: s.user.uid, ratedAt: serverTimestamp(), discussionStatus: 'resolved',
    reviewerComments: directorComments || '', reviewedAt: serverTimestamp(), history
  });

  const assignment = await one(doc(db, 'kpiAssignments', assignmentId));
  audit('performance.kpi.director.approved', `kpiSubmissions/${assignmentId}`, `final approval: ${finalRating}`);
  try {
    await notifyUser({
      recipientUid: prior.employeeId,
      title: 'KPI final rating approved',
      message: `Your KPI "${assignment?.title}" has been finalized with a rating of ${finalRating}/5.`,
      type: 'kpi',
      link: '/Performance/kpi',
      refId: assignmentId
    });
  } catch (e) { console.warn('notify', e); }
}

// Director re-rates before final approval.
export async function rerateKpi(assignmentId, newRating) {
  const s = me();
  const prior = await getSubmission(assignmentId);
  if (!prior) throw new Error('No submission found.');
  if (prior.status === 'done') throw new Error('Cannot re-rate an approved KPI.');

  await updateDoc(doc(db, 'kpiSubmissions', assignmentId), {
    directorRating: Number(newRating), ratedAt: serverTimestamp()
  });
  audit('performance.kpi.director.rerate', `kpiSubmissions/${assignmentId}`, `re-rated to ${newRating}`);
}

// Employee replies to director's discussion request.
export async function postDiscussionReply(submissionId, message) {
  const s = me();
  const sub = await getSubmission(submissionId);
  if (!sub) throw new Error('Submission not found.');
  if (sub.status !== 'discussionRequested' && sub.status !== 'resubmitted') throw new Error('Not in discussion state.');

  let discussionDoc = await getDoc(doc(db, 'kpiDiscussions', submissionId));
  const thread = discussionDoc.exists() ? (discussionDoc.data().thread || []) : [];

  thread.push({
    by: s.name, byUid: s.user.uid, message, at: Date.now(), role: 'employee'
  });

  if (!discussionDoc.exists()) {
    const sub = await getSubmission(submissionId);
    await setDoc(doc(db, 'kpiDiscussions', submissionId), {
      submissionId, assignmentId: sub.assignmentId, employeeId: sub.employeeId,
      directorId: sub.directorId, quarterId: '', thread,
      status: 'active', createdAt: serverTimestamp(), resolvedAt: null
    });
  } else {
    await updateDoc(doc(db, 'kpiDiscussions', submissionId), { thread });
  }

  await updateDoc(doc(db, 'kpiSubmissions', submissionId), { discussionStatus: 'replied' });

  audit('performance.kpi.discussion.reply', `kpiDiscussions/${submissionId}`, 'employee replied');
  const assignment = await one(doc(db, 'kpiAssignments', submissionId));
  try {
    await notifyUser({
      recipientUid: sub.directorId,
      title: 'KPI discussion - Employee replied',
      message: `${s.name} replied to the discussion on "${assignment?.title}": ${message.slice(0, 50)}...`,
      type: 'kpi',
      link: '/Performance/kpi',
      refId: submissionId
    });
  } catch (e) { console.warn('notify', e); }
}

// Director replies to ongoing discussion.
export async function postDirectorReply(submissionId, message) {
  const s = me();
  const sub = await getSubmission(submissionId);
  if (!sub) throw new Error('Submission not found.');

  let discussionDoc = await getDoc(doc(db, 'kpiDiscussions', submissionId));
  const thread = discussionDoc.exists() ? (discussionDoc.data().thread || []) : [];

  thread.push({
    by: s.name, byUid: s.user.uid, message, at: Date.now(), role: 'director'
  });

  if (!discussionDoc.exists()) {
    await setDoc(doc(db, 'kpiDiscussions', submissionId), {
      submissionId, assignmentId: sub.assignmentId, employeeId: sub.employeeId,
      directorId: s.user.uid, quarterId: '', thread,
      status: 'active', createdAt: serverTimestamp(), resolvedAt: null
    });
  } else {
    await updateDoc(doc(db, 'kpiDiscussions', submissionId), { thread });
  }

  audit('performance.kpi.discussion.directorReply', `kpiDiscussions/${submissionId}`, 'director replied');
  const assignment = await one(doc(db, 'kpiAssignments', submissionId));
  try {
    await notifyUser({
      recipientUid: sub.employeeId,
      title: 'KPI discussion - Supervisor replied',
      message: `Your supervisor replied to the discussion on "${assignment?.title}": ${message.slice(0, 50)}...`,
      type: 'kpi',
      link: '/Performance/kpi',
      refId: submissionId
    });
  } catch (e) { console.warn('notify', e); }
}

// Get or create discussion thread for a submission.
export const getDiscussionThread = async submissionId => {
  const doc_ref = doc(db, 'kpiDiscussions', submissionId);
  const d = await getDoc(doc_ref);
  return d.exists() ? { id: d.id, ...d.data() } : null;
}

// List all discussions for a quarter.
export const listDiscussions = async quarterId => {
  // For now, we'll query all discussions and filter by employee or director
  const s = me();
  const allDocs = await getDocs(collection(db, 'kpiDiscussions'));
  return allDocs.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.employeeId === s.user.uid || d.directorId === s.user.uid);
}

export const listDiscussions = async quarterId => rows(await getDocs(query(collection(db, 'performanceDiscussions'), where('quarterId', '==', quarterId))));
// (kpiScoreFor, totalWeightage, suggestDeadlineRating, DEFAULT_DEADLINE_THRESHOLDS live in ./calc.js — pure, unit-tested.)
