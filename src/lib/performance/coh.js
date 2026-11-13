// lib/performance/coh.js — Code of Conduct peer evaluations. Evaluator identity is always visible to the
// person being evaluated and to HR/Director; this is not an anonymous evaluation system (confirmed requirement).
// The MARK itself, however, is never visible to the person being evaluated — only to the evaluator who gave
// it and to HR/Director — so it lives on a separate private/scores sub-document the evaluatee can't read
// (firestore.rules enforces this; it isn't just hidden in the UI).
//
// cohQuestions/{id}      { title, description, order, active, ratingScale, quarterIds: [string] | null (null = shared; see cohQuestions.js), copiedFrom?,
//                          deleted?: true, deletedAt, deletedBy }   (deleted = removed from every list, 12 Nov 2026)
// cohEvaluations/{quarterId}_{evaluatorUid}_{evaluateeUid}
//                        { quarterId, evaluatorId, evaluatorNameSnapshot, evaluateeId, evaluateeNameSnapshot,
//                          status: 'submitted'|'approved'|'correctionRequested', submittedAt, reviewedBy, reviewedAt }
// cohEvaluations/{id}/private/scores
//                        { ratings: [{ questionId, questionTextSnapshot, score }], averageRating }
//
// The deterministic evaluation id (one per evaluator/evaluatee/quarter) makes "no duplicate submission" a
// property of the document path, not application logic: a second submit overwrites the first rather than
// creating a second row, and firestore.rules can check "does this id already exist" cheaply.
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, limit, serverTimestamp, addDoc, writeBatch } from 'firebase/firestore';
import { questionsOf, hasOwnSet, sharedSet, planOwnSet, planCopyFrom } from './cohQuestions.js';
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
// Each quarter can have its own set (12 Nov 2026, cohQuestions.js): a quarter uses its own questions when it has some,
// otherwise the shared ones (quarterIds: null). Before, a quarter got the shared ones AND any scoped to it.
const allQuestionDocs = async () => rows(await getDocs(collection(db, 'cohQuestions')));
// The questions shown on a quarter's evaluation form and on its One To One forms: its set, active ones only.
export async function listQuestions(quarterId) {
  return questionsOf(await allQuestionDocs(), quarterId).filter(q => q.active !== false);
}
// Manage questions: a quarter's set (inactive ones included), and whether it is its own or the shared one.
export async function listQuestionsFor(quarterId) {
  const all = await allQuestionDocs();
  const own = hasOwnSet(all, quarterId);
  return { questions: questionsOf(all, quarterId), own, shared: !own && sharedSet(all).length > 0 };
}
// Has anyone been rated in this quarter yet? (Their marks point at the question documents.)
export async function quarterHasEvaluations(quarterId) {
  return !(await getDocs(query(collection(db, 'cohEvaluations'), where('quarterId', '==', quarterId), limit(1)))).empty;
}
const stampNew = s => ({ createdBy: s.user.uid, createdByName: s.name, createdAt: serverTimestamp() });
// Before the first change to a quarter that is still on the shared questions: give it its own set, so the change stays
// in that quarter. Returns { oldId: newId } for questions that were copied (empty when the same documents are kept).
export async function ensureOwnSet(quarterId, allQuarterIds) {
  const all = await allQuestionDocs();
  if (hasOwnSet(all, quarterId) || !sharedSet(all).length) return {};
  const rated = [];
  for (const id of allQuarterIds) if (!hasOwnSet(all, id) && await quarterHasEvaluations(id)) rated.push(id);
  const plan = planOwnSet(all, quarterId, allQuarterIds, rated);
  const s = me(), b = writeBatch(db), map = {};
  if (plan.mode === 'copy') {
    for (const c of plan.copies) { const ref = doc(collection(db, 'cohQuestions')); b.set(ref, { ...c, ...stampNew(s) }); map[c.copiedFrom] = ref.id; }
  } else if (plan.mode === 'keep') {
    for (const id of plan.pin) b.update(doc(db, 'cohQuestions', id), { quarterIds: plan.pinTo });
    for (const c of plan.clones) b.set(doc(collection(db, 'cohQuestions')), { ...c, ...stampNew(s) });
  } else return {};
  await b.commit();
  audit('performance.coh.question.ownSet', `performanceQuarters/${quarterId}`, plan.mode === 'copy' ? 'Copied the shared questions for this quarter' : 'This quarter keeps the questions it was rated with');
  return map;
}
// Use another quarter's questions for this one (replaces this quarter's own questions). Not once ratings exist here.
export async function copyQuestionsFrom(fromQuarterId, toQuarterId) {
  if (fromQuarterId === toQuarterId) throw new Error('Pick a different quarter to copy from.');
  if (await quarterHasEvaluations(toQuarterId)) throw new Error('Evaluations have started in this quarter, so its questions can\'t be replaced. You can still add, edit or delete questions.');
  const plan = planCopyFrom(await allQuestionDocs(), fromQuarterId, toQuarterId);
  if (!plan.copies.length) throw new Error('That quarter has no questions to copy.');
  const s = me(), b = writeBatch(db);
  for (const id of plan.remove) b.update(doc(db, 'cohQuestions', id), { deleted: true, active: false, deletedAt: serverTimestamp(), deletedBy: s.user.uid, deletedByName: s.name });
  for (const u of plan.unlink) b.update(doc(db, 'cohQuestions', u.id), { quarterIds: u.quarterIds });
  for (const c of plan.copies) b.set(doc(collection(db, 'cohQuestions')), { ...c, ...stampNew(s) });
  await b.commit();
  audit('performance.coh.question.copy', `performanceQuarters/${toQuarterId}`, `Copied ${plan.copies.length} questions from ${fromQuarterId}`);
  return plan.copies.length;
}
export async function listAllQuestions() {
  return rows(await getDocs(collection(db, 'cohQuestions'))).filter(q => q.deleted !== true).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
// Delete a question (12 Nov 2026). It leaves every list (Manage questions, new evaluations, the One To One form). The record
// itself is kept, marked deleted: marks already given for it stay in the evaluations that hold them, and the rules never
// remove a question for good.
export async function deleteQuestion(id, title = '') {
  const s = me();
  await updateDoc(doc(db, 'cohQuestions', id), { deleted: true, active: false, deletedAt: serverTimestamp(), deletedBy: s.user.uid, deletedByName: s.name });
  audit('performance.coh.question.delete', `cohQuestions/${id}`, title);
}

// ---- Eligibility: active participants in the quarter, minus myself ----
export async function listEvaluatees(quarterId, myUid) {
  const parts = await listParticipants(quarterId);
  return parts.filter(p => p.participationStatus === 'active' && p.employeeId !== myUid);
}

const evalId = (quarterId, evaluatorUid, evaluateeUid) => `${quarterId}_${evaluatorUid}_${evaluateeUid}`;

// Used by the evaluator to resume/review their own submission (so it includes the score they gave — they're
// always authorized to read their own private/scores sub-document).
export async function getEvaluation(quarterId, evaluatorUid, evaluateeUid) {
  const e = await one(doc(db, 'cohEvaluations', evalId(quarterId, evaluatorUid, evaluateeUid)));
  if (!e) return null;
  const [withScore] = await withScores([e]);
  return withScore;
}

// ratings: [{ questionId, questionTextSnapshot, score }]. averageRating is stored, not recomputed on read,
// so a later change to a question's wording never silently changes a historical score. Written as two
// documents in one batch: the public cohEvaluations doc (who/when/status — the evaluatee can read this)
// and a private/scores sub-document (the actual marks — the evaluatee can never read this, enforced by
// firestore.rules, not just hidden in the UI).
export async function submitEvaluation(quarterId, evaluateeUid, evaluateeName, ratings) {
  const s = me();
  if (evaluateeUid === s.user.uid) throw new Error('You cannot evaluate yourself.');
  if (!ratings.length) throw new Error('Rate every question before submitting.');
  const average = ratings.reduce((sum, r) => sum + Number(r.score), 0) / ratings.length;
  const ref = doc(db, 'cohEvaluations', evalId(quarterId, s.user.uid, evaluateeUid));
  const b = writeBatch(db);
  b.set(ref, {
    quarterId, evaluatorId: s.user.uid, evaluatorNameSnapshot: s.name,
    evaluateeId: evaluateeUid, evaluateeNameSnapshot: evaluateeName,
    status: 'submitted', submittedAt: serverTimestamp(), reviewedBy: null, reviewedAt: null
  });
  b.set(doc(ref, 'private', 'scores'), { ratings, averageRating: average });
  await b.commit();
  audit('performance.coh.evaluation.submit', ref.path, `Rated ${evaluateeName}: ${average.toFixed(2)}/5`);
  try { await notifyUser({ recipientUid: evaluateeUid, title: 'New code of conduct evaluation received', message: `${s.name} evaluated you for this quarter.`, type: 'coh', link: '/Performance/coh', refId: ref.id }); }
  catch (e) { console.warn('notify', e); }
}

// Attaches the private score (ratings/averageRating) onto each evaluation when the caller is authorized to
// read it — i.e. the evaluator who gave it, or HR/Director. For the evaluatee reading their own received
// evaluations, every private/scores read is denied by firestore.rules; that's expected, not an error, so
// each attempt fails silently and the row is returned with the score fields simply absent.
async function withScores(evals) {
  return Promise.all(evals.map(async e => {
    try {
      const s = await getDoc(doc(db, 'cohEvaluations', e.id, 'private', 'scores'));
      return s.exists() ? { ...e, ...s.data() } : e;
    } catch (_) { return e; }
  }));
}

// Evaluations received about this person — evaluator identity is always included, by design. The score is
// attached only if the caller is allowed to see it (see withScores): the employee calling this about
// themselves never gets a score back; HR/Director calling it (e.g. during result calculation) does.
export async function listReceived(quarterId, employeeUid) {
  const list = rows(await getDocs(query(collection(db, 'cohEvaluations'), where('quarterId', '==', quarterId), where('evaluateeId', '==', employeeUid))))
    .sort((a, b) => (b.submittedAt?.toMillis?.() || 0) - (a.submittedAt?.toMillis?.() || 0));
  return withScores(list);
}

// Evaluations this person has submitted — they always see their own marks (it's their own input).
export async function listGiven(quarterId, evaluatorUid) {
  const list = rows(await getDocs(query(collection(db, 'cohEvaluations'), where('quarterId', '==', quarterId), where('evaluatorId', '==', evaluatorUid))));
  return withScores(list);
}

// HR/Director monitoring: every evaluation in the quarter, with scores, for the completion dashboard.
export async function listAllForQuarter(quarterId) {
  const list = rows(await getDocs(query(collection(db, 'cohEvaluations'), where('quarterId', '==', quarterId))));
  return withScores(list);
}

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
