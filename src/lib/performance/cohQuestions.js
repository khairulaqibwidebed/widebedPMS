// lib/performance/cohQuestions.js — which COH questions belong to which quarter (12 Nov 2026). No Firestore here: plain
// functions, tested in __tests__/cohQuestions.test.js. coh.js does the reading and saving.
//
// A question has quarterIds: a list of quarter ids = it belongs to those quarters (their OWN set), or null = a SHARED
// question. A quarter uses its own set when it has one, otherwise the shared questions. So Q3 can have 10 questions and
// Q4 11, and changing Q4's never changes Q3's.
const alive = q => q.deleted !== true;
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.title || '').localeCompare(String(b.title || ''));

export const ownSet = (all, quarterId) => all.filter(q => alive(q) && Array.isArray(q.quarterIds) && q.quarterIds.includes(quarterId)).sort(byOrder);
export const sharedSet = all => all.filter(q => alive(q) && !Array.isArray(q.quarterIds)).sort(byOrder);
export const hasOwnSet = (all, quarterId) => ownSet(all, quarterId).length > 0;
// The questions a quarter uses (inactive ones included; the evaluation form leaves those out).
export function questionsOf(all, quarterId) {
  const own = ownSet(all, quarterId);
  return own.length ? own : sharedSet(all);
}

// What a copy of a question carries over (a new document: its own id, its own quarter).
export const copyOf = (q, quarterIds) => ({ title: q.title || '', description: q.description || '', ratingScale: q.ratingScale ?? 5, order: q.order ?? 0,
  active: q.active !== false, quarterIds, copiedFrom: q.id });

// Give a quarter its own set when it is still on the shared questions, so changes to it stay in that quarter.
//   withEvaluations: ids of the quarters where colleagues have already rated someone. Their marks point at the question
//   documents, so those quarters must KEEP the documents they used.
// Returns what to save:
//   { mode: 'none' }                              it already has its own set, or there are no shared questions
//   { mode: 'copy', copies }                      no ratings yet in this quarter: it gets copies; the shared ones are untouched
//   { mode: 'keep', pin, pinTo, clones }          ratings exist: the shared documents (pin) become the set of the quarters
//                                                 that rated with them (pinTo), and fresh shared copies (clones) take their
//                                                 place for every other quarter
export function planOwnSet(all, quarterId, allQuarterIds, withEvaluations) {
  const shared = sharedSet(all);
  if (hasOwnSet(all, quarterId) || !shared.length) return { mode: 'none' };
  const rated = new Set(withEvaluations);
  if (!rated.has(quarterId)) return { mode: 'copy', copies: shared.map(q => copyOf(q, [quarterId])) };
  // Every quarter still on the shared questions that has ratings keeps these same documents.
  const pinTo = allQuarterIds.filter(id => rated.has(id) && !hasOwnSet(all, id));
  if (!pinTo.includes(quarterId)) pinTo.push(quarterId);
  return { mode: 'keep', pin: shared.map(q => q.id), pinTo, clones: shared.map(q => copyOf(q, null)) };
}

// Copy another quarter's questions into this one, replacing what it had as its own.
//   remove: its own questions that belong only to it (marked deleted); unlink: ones other quarters also use (this
//   quarter is taken off them); copies: the new questions. Inactive questions are copied too, still inactive.
export function planCopyFrom(all, fromQuarterId, toQuarterId) {
  const mine = ownSet(all, toQuarterId);
  return {
    remove: mine.filter(q => q.quarterIds.length === 1).map(q => q.id),
    unlink: mine.filter(q => q.quarterIds.length > 1).map(q => ({ id: q.id, quarterIds: q.quarterIds.filter(id => id !== toQuarterId) })),
    copies: questionsOf(all, fromQuarterId).map((q, i) => ({ ...copyOf(q, [toQuarterId]), order: i }))
  };
}
// The next "order" for a question added to a set: after the last one.
export const nextOrder = set => set.reduce((m, q) => Math.max(m, (q.order ?? 0) + 1), 0);
