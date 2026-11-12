// One To One Session form (12 Nov 2026): Code of Honor averages, the staff list, venues, file names.
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/firebase.js', () => ({ db: {}, ROLE_LABEL: { operations: 'Operations' } }));
vi.mock('@/stores/session.js', () => ({ useSession: () => ({ user: { uid: 'me' }, name: 'Me', role: 'hr' }) }));
vi.mock('@/services/notificationService.js', () => ({ notifyUser: async () => {} }));
vi.mock('firebase/firestore', () => ({ collection: () => ({}), doc: () => ({}), getDoc: async () => ({ exists: () => false }), getDocs: async () => ({ docs: [] }), setDoc: async () => {},
  updateDoc: async () => {}, addDoc: async () => {}, query: () => ({}), where: () => ({}), serverTimestamp: () => 'now', writeBatch: () => ({ set() {}, commit: async () => {} }), deleteDoc: async () => {} }));
import * as O from '../oneToOne.js';
import { buildOneToOnePdf } from '../oneToOnePdf.js';

const questions = [{ id: 'q1', title: 'Learning' }, { id: 'q2', title: 'Discipline' }, { id: 'q3', title: 'Added later' }];
const ev = (from, to, status, marks) => ({ evaluatorId: from, evaluateeId: to, status, ...(marks ? { ratings: Object.entries(marks).map(([questionId, score]) => ({ questionId, score })) } : {}) });

describe('Code of Honor averages', () => {
  it('averages each question over everyone who rated the person', () => {
    const r = O.cohAverages(questions, [ev('b', 'a', 'submitted', { q1: 5, q2: 4 }), ev('c', 'a', 'approved', { q1: 4, q2: 3 }), ev('d', 'a', 'submitted', { q1: 3, q2: 5, q3: 2 })]);
    expect(r.lines.map(l => l.average)).toEqual([4, 4, 2]);
    expect(r.lines.map(l => l.count)).toEqual([3, 3, 1]);        // a question added later has fewer answers
    expect(r.average).toBe(3.33);                                // (4 + 4 + 2) / 3
    expect(r.raters).toBe(3);
  });
  it('leaves out evaluations that are not sent in, or whose marks can\'t be read', () => {
    const r = O.cohAverages(questions, [ev('b', 'a', 'submitted', { q1: 5 }), ev('c', 'a', 'correctionRequested', { q1: 1 }), ev('d', 'a', 'submitted', null)]);
    expect(r.lines[0].average).toBe(5);
    expect(r.raters).toBe(1);
  });
  it('is empty when nobody has rated yet; a deleted question is not on the form', () => {
    const none = O.cohAverages(questions, []);
    expect(none.lines.map(l => l.average)).toEqual([null, null, null]);
    expect(none.average).toBe(null);
    const r = O.cohAverages(questions.slice(0, 1), [ev('b', 'a', 'submitted', { q1: 4, q2: 1 })]);   // q2 was deleted from the list
    expect(r.lines.length).toBe(1);
    expect(r.average).toBe(4);
  });
  it('rounds marks to 1 decimal and the average to 2', () => {
    const r = O.cohAverages(questions.slice(0, 2), [ev('b', 'a', 'submitted', { q1: 5, q2: 4 }), ev('c', 'a', 'submitted', { q1: 4, q2: 4 }), ev('d', 'a', 'submitted', { q1: 4, q2: 5 })]);
    expect(r.lines.map(l => l.average)).toEqual([4.3, 4.3]);
    expect(r.average).toBe(4.33);                                // from the exact 4.333…, not from the rounded 4.3
  });
});

describe('the staff list and the form', () => {
  const parts = [{ employeeId: 'a', employeeName: 'Aina', participationStatus: 'active' }, { employeeId: 'b', employeeName: 'Ben', participationStatus: 'active' },
    { employeeId: 'c', employeeName: 'Chen', participationStatus: 'active' }, { employeeId: 'x', employeeName: 'Left', participationStatus: 'excluded' }];
  const evals = [ev('b', 'a', 'submitted', { q1: 5 }), ev('c', 'a', 'approved', { q1: 4 }), ev('a', 'b', 'submitted', { q1: 3 })];
  const rows = O.sessionRows(parts, evals, { a: { name: 'Aina Sofea', position: 'Operations Executive', joinDate: '2025-02-03' } });
  it('counts who has rated each person out of the other active people', () => {
    expect(rows.map(r => [r.name, r.done, r.expected, r.complete])).toEqual([['Aina Sofea', 2, 2, true], ['Ben', 1, 2, false], ['Chen', 0, 2, false]]);
  });
  it('fills the form for one person', () => {
    const f = O.formData({ row: rows[0], questions: questions.slice(0, 1), date: '2026-12-10', venue: ' 183 Site Office ' });
    expect([f.date, f.venue, f.staffName, f.joinDate, f.position, f.topic]).toEqual(['10/12/26', '183 Site Office', 'Aina Sofea', '03/02/2025', 'Operations Executive', 'Performance Evaluation / Confirmation']);
    expect(f.questions).toEqual([{ title: 'Learning', mark: '4.5' }]);
    expect([f.average, f.raters, f.expected]).toEqual(['4.50', 2, 2]);
    const empty = O.formData({ row: rows[2], questions: questions.slice(0, 1), date: '', venue: '' });
    expect([empty.questions[0].mark, empty.average, empty.joinDate, empty.date]).toEqual(['', '', '', '']);
  });
  it('tidies the venue list and names the file', () => {
    expect(O.cleanVenues([' 183 Site Office ', '183 site office', '', 'Meeting   Room 2'])).toEqual(['183 Site Office', 'Meeting Room 2']);
    expect(O.fileName('Aina/Sofea', 'Q4 2026')).toBe('One To One - Aina Sofea (Q4 2026).pdf');
  });
});

describe('the PDF', () => {
  it('is made with two pages, also with no marks, many questions or a name the fonts can\'t print', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const base = { company: O.COMPANY, topic: O.TOPIC, date: '10/12/26', venue: '183 Site Office', staffName: 'Aina Sofea', joinDate: '', position: 'Operations Executive', average: '', raters: 0, expected: 14 };
    for (const data of [{ ...base, questions: [] }, { ...base, staffName: '陈美玲', questions: Array.from({ length: 45 }, (_, i) => ({ title: `Question number ${i + 1} with a rather long title`, mark: '4.0' })), average: '4.00', raters: 3 }]) {
      const bytes = await buildOneToOnePdf(data);
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
    }
  });
});
