// TMS Performance: removing an employee's selected tasks (12 Nov 2026).
import { describe, it, expect, vi, beforeEach } from 'vitest';
const store = new Map();
vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ col: name }), doc: (_db, col, id) => ({ path: `${col}/${id}`, id }),
  getDoc: async ref => ({ exists: () => store.has(ref.path), id: ref.id, data: () => store.get(ref.path) }),
  getDocs: async () => ({ docs: [] }), query: c => c, where: () => ({}), addDoc: async () => ({}), serverTimestamp: () => 'now',
  setDoc: async (ref, data, opt) => { store.set(ref.path, opt?.merge ? { ...store.get(ref.path), ...data } : { ...data }); }
}));
vi.mock('@/lib/firebase.js', () => ({ db: {} }));
vi.mock('@/stores/session.js', () => ({ useSession: () => ({ user: { uid: 'dir1' }, name: 'Director', role: 'director' }) }));
vi.mock('@/lib/tms.js', () => ({ sendToTasks: async () => ({ tasks: [] }) }));
import * as T from '../tms.js';

const quarter = { id: 'q3', weights: { tms: 30 } };
const task = (id, completed) => ({ id, title: id, workspaceId: 'w1', workspaceName: 'Assana Langkawi', completed });
beforeEach(() => store.clear());

describe('removing a TMS selection', () => {
  it('leaves no workspace, no task and no score, and clears the approval', async () => {
    await T.saveSelection(quarter, 'biha', { workspaceIds: ['w1'], workspaceNames: ['Assana Langkawi'], tickedTasks: [task('t1', true), task('t2', false)] });
    await T.approveSnapshot('q3', 'biha');
    const before = await T.getSnapshot('q3', 'biha');
    expect([T.hasSelection(before), before.totalTasks, before.score, !!before.approvedAt]).toEqual([true, 2, 15, true]);
    await T.clearSelection(quarter, 'biha');
    const after = await T.getSnapshot('q3', 'biha');
    expect(T.hasSelection(after)).toBe(false);
    expect([after.workspaceIds, after.tasks, after.eligibleTaskIds, after.totalTasks, after.score, after.approvedAt, after.cleared]).toEqual([[], [], [], 0, null, null, true]);
    expect(T.tmsScoreFromCounts(after.totalTasks, after.completedTasks, 30)).toEqual({ status: 'n/a', score: null });   // same as nothing chosen
    expect(await T.refreshSnapshot(quarter, 'biha')).toBe(null);          // Refresh does nothing to a removed selection
  });
  it('can be chosen again afterwards; a finalized score can\'t be removed', async () => {
    await T.saveSelection(quarter, 'biha', { workspaceIds: ['w1'], workspaceNames: ['A'], tickedTasks: [task('t1', true)] });
    await T.clearSelection(quarter, 'biha');
    await T.saveSelection(quarter, 'biha', { workspaceIds: ['w1'], workspaceNames: ['A'], tickedTasks: [task('t1', true)] });
    expect(T.hasSelection(await T.getSnapshot('q3', 'biha'))).toBe(true);
    store.set('performanceTmsSnapshots/q3_biha', { ...store.get('performanceTmsSnapshots/q3_biha'), isFinal: true });
    await expect(T.clearSelection(quarter, 'biha')).rejects.toThrow(/finalized/);
    await T.clearSelection(quarter, 'nobody');                             // nothing saved: nothing happens
    expect(store.has('performanceTmsSnapshots/q3_nobody')).toBe(false);
  });
});
