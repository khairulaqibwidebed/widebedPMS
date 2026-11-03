// lib/performance/coh.js — Code of Conduct peer evaluations. Evaluator identity is always visible to the
// person being evaluated and to HR/Director; this is not an anonymous evaluation system (confirmed requirement).
//
// cohQuestions/{id}      { title, description, order, active, ratingScale, quarterIds: [string] | null }
// cohEvaluations/{quarterId}_{evaluatorUid}_{evaluateeUid}
//                        { quarterId, evaluatorId, evaluatorNameSnapshot, evaluateeId, evaluateeNameSnapshot,
//                          ratings: [{ questionId, questionTextSnapshot, score }], averageRating,
//                          status: 'submitted'|'approved'|'correctionRequested', submittedAt, reviewedBy, reviewedAt }
//
// The deterministic evaluation id (one per evaluator/evaluatee/quarter) makes "no duplicate submission" a
// property of the document path, not application logic: a second submit overwrites the first rather than
// creating a second row, and firestore.rules can check "does this id already exist" cheaply.
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, serverTimestamp, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { notifyUser } from '@/services/notificationService.js';
import { listParticipants } from './quarters.js';
import { cohScoreFromRatings } from './calc.js';

const me = () => useSession();
const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
const one = async ref => { const s = await getDoc(ref); return s.exists() ? { id: s.id, ...s.data() } : null; };

export async function audit(action, entity, details = '') {
  try {
    const s = me();
    await addDoc(collection(db, 'auditLog'), { at: serverTimestamp(), uid: s.user.uid, userName: s.name, role: s.role, action, entity, changes: [], reason: String(details).slice(0, 300) });
  } catch (e) { console.warn('audit', e); }
}

// ---- Questions (HR/Director configure; reused across quarters unless scoped) ----
export async function listQuestions(quarterId) {
  const all = rows(await getDocs(collection(db, 'cohQuestions'))).filter(q => q.active !== false);
  return all.filter(q => !q.quarterIds || q.quarterIds.includes(quarterId)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
export async function listAllQuestions() {
  return rows(await getDocs(collection(db, 'cohQuestions'))).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
export async function createQuestion({ title, description = '', ratingScale = 5, quarterIds = null, order = 0 }) {
  const s = me(), ref = doc(collection(db, 'cohQuestions'));
  await setDoc(ref, { title, description, ratingScale, quarterIds, order, active: true, createdBy: s.user.uid, createdByName: s.name, createdAt: serverTimestamp() });
  audit('performance.coh.question.create', `cohQuestions/${ref.id}`, title);
  return ref.id;
}
export async function saveQuestion(id, patch) {
  await updateDoc(doc(db, 'cohQuestions', id), patch);
  audit('performance.coh.question.update', `cohQuestions/${id}`, Object.keys(patch).join(', '));
}

// ---- Eligibility: active participants in the quarter, minus myself ----
export async function listEvaluatees(quarterId, myUid) {
  const parts = await listParticipants(quarterId);
  return parts.filter(p => p.participationStatus === 'active' && p.employeeId !== myUid);
}

const evalId = (quarterId, evaluatorUid, evaluateeUid) => `${quarterId}_${evaluatorUid}_${evaluateeUid}`;

export const getEvaluation = (quarterId, evaluatorUid, evaluateeUid) => one(doc(db, 'cohEvaluations', evalId(quarterId, evaluatorUid, evaluateeUid)));

// ratings: [{ questionId, questionTextSnapshot, score }]. averageRating is stored, not recomputed on read,
// so a later change to a question's wording never silently changes a historical score.
export async function submitEvaluation(quarterId, evaluateeUid, evaluateeName, ratings) {
  const s = me();
  if (evaluateeUid === s.user.uid) throw new Error('You cannot evaluate yourself.');
  if (!ratings.length) throw new Error('Rate every question before submitting.');
  const average = ratings.reduce((sum, r) => sum + Number(r.score), 0) / ratings.length;
  const ref = doc(db, 'cohEvaluations', evalId(quarterId, s.user.uid, evaluateeUid));
  await setDoc(ref, {
    quarterId, evaluatorId: s.user.uid, evaluatorNameSnapshot: s.name,
    evaluateeId: evaluateeUid, evaluateeNameSnapshot: evaluateeName,
    ratings, averageRating: average, status: 'submitted',
    submittedAt: serverTimestamp(), reviewedBy: null, reviewedAt: null
  });
  audit('performance.coh.evaluation.submit', ref.path, `Rated ${evaluateeName}: ${average.toFixed(2)}/5`);
  try { await notifyUser({ recipientUid: evaluateeUid, title: 'New code of conduct evaluation received', message: `${s.name} rated you ${average.toFixed(2)} / 5.`, type: 'coh', link: '/Performance/coh', refId: ref.id }); }
  catch (e) { console.warn('notify', e); }
}

// Evaluations received about this person — evaluator identity is always included, by design.
export const listReceived = async (quarterId, employeeUid) => rows(await getDocs(
  query(collection(db, 'cohEvaluations'), where('quarterId', '==', quarterId), where('evaluateeId', '==', employeeUid))
)).sort((a, b) => (b.submittedAt?.toMillis?.() || 0) - (a.submittedAt?.toMillis?.() || 0));

// Evaluations this person has submitted.
export const listGiven = async (quarterId, evaluatorUid) => rows(await getDocs(
  query(collection(db, 'cohEvaluations'), where('quarterId', '==', quarterId), where('evaluatorId', '==', evaluatorUid))
));

// HR/Director monitoring: every evaluation in the quarter, for the completion dashboard.
export const listAllForQuarter = async quarterId => rows(await getDocs(query(collection(db, 'cohEvaluations'), where('quarterId', '==', quarterId))));

export async function approveEvaluation(id, reviewerUid) {
  await updateDoc(doc(db, 'cohEvaluations', id), { status: 'approved', reviewedBy: reviewerUid, reviewedAt: serverTimestamp() });
  audit('performance.coh.evaluation.approve', `cohEvaluations/${id}`);
}

// ---- Score (pure math in calc.js): average of valid (submitted or approved) ratings received, scaled to the
// quarter's COH weight. Below the configured minimum, explicitly "insufficient data", never a silent zero.
export async function cohScoreFor(quarterId, employeeUid, minValid, cohWeight) {
  const received = (await listReceived(quarterId, employeeUid)).filter(e => e.status === 'submitted' || e.status === 'approved');
  return cohScoreFromRatings(received.map(e => e.averageRating), minValid, cohWeight);
}
