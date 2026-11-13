// COH questions per quarter (12 Nov 2026): each quarter's own set, copying from another quarter, and the saves behind them.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// A tiny stand-in for Firestore: documents in a Map, keyed "collection/id".
const store = new Map();
let nextId = 1;
const snapOf = list => ({ docs: list.map(([path, data]) => ({ id: path.split('/')[1], data: () => data })), empty: !list.length });
vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ col: name }),
  doc: (a, b, c) => (a && a.col && b === undefined ? { path: `${a.col}/new${nextId++}`, id: `new${nextId - 1}` } : { path: `${b}/${c}`, id: c }),
  getDocs: async q => {
    const col = q.col, list = [...store].filter(([p]) => p.startsWith(col + '/')).filter(([, d]) => (q.filters || []).every(([f, v]) => d[f] === v));
    return snapOf(q.max ? list.slice(0, q.max) : list);
  },
  getDoc: async ref => ({ exists: () => store.has(ref.path), id: ref.id, data: () => store.get(ref.path) }),
  query: (c, ...parts) => ({ col: c.col, filters: parts.filter(p => p.f).map(p => [p.f, p.v]), max: parts.find(p => p.max)?.max }),
  where: (f, _op, v) => ({ f, v }), limit: n => ({ max: n }),
  setDoc: async (ref, data) => { store.set(ref.path, { ...data }); },
  updateDoc: async (ref, patch) => { store.set(ref.path, { ...store.get(ref.path), ...patch }); },
  addDoc: async () => ({}), serverTimestamp: () => 'now',
  writeBatch: () => { const ops = []; return { set: (ref, data) => ops.push(() => store.set(ref.path, { ...data })), update: (ref, patch) => ops.push(() => store.set(ref.path, { ...store.get(ref.path), ...patch })), commit: async () => ops.forEach(f => f()) }; }
}));
vi.mock('@/lib/firebase.js', () => ({ db: {} }));
vi.mock('@/stores/session.js', () => ({ useSession: () => ({ user: { uid: 'hr1' }, name: 'HR', role: 'hr' }) }));
vi.mock('@/services/notificationService.js', () => ({ notifyUser: async () => {} }));
vi.mock('../quarters.js', () => ({ listParticipants: async () => [] }));

import * as Q from '../cohQuestions.js';
import * as C from '../coh.js';

const q = (id, title, quarterIds = null, extra = {}) => ({ id, title, order: Number(id.replace(/\D/g, '')) || 0, quarterIds, ...extra });
const put = list => list.forEach(x => { const { id, ...data } = x; store.set(`cohQuestions/${id}`, data); });
const titles = async quarter => (await C.listQuestionsFor(quarter)).questions.map(x => x.title);
beforeEach(() => { store.clear(); nextId = 1; });

describe('which questions a quarter uses', () => {
  const all = [q('s1', 'Learning'), q('s2', 'Discipline'), q('a1', 'Q4 only', ['q4']), q('d1', 'Deleted', ['q4'], { deleted: true })];
  it('its own set when it has one, else the shared questions', () => {
    expect(Q.questionsOf(all, 'q4').map(x => x.title)).toEqual(['Q4 only']);
    expect(Q.questionsOf(all, 'q3').map(x => x.title)).toEqual(['Learning', 'Discipline']);
    expect(Q.hasOwnSet(all, 'q3')).toBe(false);
  });
  it('plans a copy when nobody is rated yet, and keeps the same questions when ratings exist', () => {
    const shared = [q('s1', 'Learning'), q('s2', 'Discipline')];
    const copy = Q.planOwnSet(shared, 'q4', ['q3', 'q4'], ['q3']);
    expect([copy.mode, copy.copies.map(c => c.quarterIds)]).toEqual(['copy', [['q4'], ['q4']]]);
    const keep = Q.planOwnSet(shared, 'q3', ['q3', 'q4'], ['q3']);
    expect([keep.mode, keep.pin, keep.pinTo, keep.clones.map(c => c.quarterIds)]).toEqual(['keep', ['s1', 's2'], ['q3'], [null, null]]);
    expect(Q.planOwnSet(all, 'q4', ['q4'], []).mode).toBe('none');
  });
});

describe('saving', () => {
  it('Q3 has 2 questions, Q4 gets its own 3: changing Q4 never changes Q3', async () => {
    put([q('s1', 'Learning'), q('s2', 'Discipline')]);
    const map = await C.ensureOwnSet('q4', ['q3', 'q4']);                 // first change in Q4 (no ratings there yet)
    expect(Object.keys(map)).toEqual(['s1', 's2']);
    await C.createQuestion({ title: 'Customer Focus', quarterIds: ['q4'], order: Q.nextOrder((await C.listQuestionsFor('q4')).questions) });
    await C.saveQuestion(map.s1, { title: 'Learning fast' });
    expect(await titles('q4')).toEqual(['Learning fast', 'Discipline', 'Customer Focus']);
    expect(await titles('q3')).toEqual(['Learning', 'Discipline']);
    expect((await C.listQuestionsFor('q4')).own).toBe(true);
  });
  it('a quarter with ratings keeps the very same questions (their marks still match); other quarters get copies', async () => {
    put([q('s1', 'Learning'), q('s2', 'Discipline')]);
    store.set('cohEvaluations/q3_a_b', { quarterId: 'q3', status: 'submitted' });
    const map = await C.ensureOwnSet('q3', ['q3', 'q4']);
    expect(map).toEqual({});                                             // same documents, same ids
    expect((await C.listQuestionsFor('q3')).questions.map(x => x.id)).toEqual(['s1', 's2']);
    await C.deleteQuestion('s2', 'Discipline');                          // a change in Q3…
    expect(await titles('q3')).toEqual(['Learning']);
    expect(await titles('q4')).toEqual(['Learning', 'Discipline']);       // …leaves Q4 (and future quarters) as they were
    expect((await C.listQuestionsFor('q4')).own).toBe(false);
  });
  it('a new quarter uses the previous quarter\'s questions, then is edited on its own', async () => {
    put([q('a1', 'Learning', ['q3']), q('a2', 'Discipline', ['q3'], { active: false }), q('b1', 'Old Q4 question', ['q4'])]);
    expect(await C.copyQuestionsFrom('q3', 'q4')).toBe(2);
    expect(await titles('q4')).toEqual(['Learning', 'Discipline']);       // the old Q4 question is replaced
    expect((await C.listQuestions('q4')).map(x => x.title)).toEqual(['Learning']);   // inactive stays inactive
    const first = (await C.listQuestionsFor('q4')).questions[0];
    await C.saveQuestion(first.id, { title: 'Learning (Q4)' });
    expect(await titles('q3')).toEqual(['Learning', 'Discipline']);
    expect(store.get('cohQuestions/b1').deleted).toBe(true);
  });
  it('refuses to replace the questions of a quarter where evaluations have started', async () => {
    put([q('a1', 'Learning', ['q3']), q('b1', 'Q4 question', ['q4'])]);
    store.set('cohEvaluations/q4_a_b', { quarterId: 'q4', status: 'submitted' });
    await expect(C.copyQuestionsFrom('q3', 'q4')).rejects.toThrow(/started/);
    expect(await titles('q4')).toEqual(['Q4 question']);
    await expect(C.copyQuestionsFrom('q3', 'q3')).rejects.toThrow(/different/);
  });
  it('a question shared by two rated quarters is unlinked, not deleted, when one of them copies another set', () => {
    const all = [q('s1', 'Learning', ['q2', 'q3']), q('c1', 'New', ['q5'])];
    const plan = Q.planCopyFrom(all, 'q5', 'q3');
    expect([plan.remove, plan.unlink, plan.copies.map(c => c.title)]).toEqual([[], [{ id: 's1', quarterIds: ['q2'] }], ['New']]);
  });
});
