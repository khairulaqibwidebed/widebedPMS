// Leave and MC (HR > Leave, My Leave) and how leave shows on HR > Attendance. Run: npm test
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase.js', () => ({ db: {}, ROLE_LABEL: { hr: 'HR', operations: 'Operations' } }));
vi.mock('@/lib/finance-data.js', () => ({ audit: () => {} }));
vi.mock('@/services/notificationService.js', () => ({ notifyUser: async () => {}, notifyRole: async () => {} }));
vi.mock('firebase/firestore', () => ({
  Timestamp: { fromMillis: ms => ({ toMillis: () => ms }) },
  serverTimestamp: () => 'SERVER_TIME', deleteField: () => 'DELETE',
  collection: () => ({}), doc: () => ({ id: 'new' }), getDoc: async () => ({}), getDocs: async () => ({ docs: [] }), query: () => ({}),
  where: () => ({}), orderBy: () => ({}), limit: () => ({}), writeBatch: () => ({ set() {}, update() {}, commit: async () => {} }), deleteDoc: async () => {}
}));

const L = await import('../leave.js');
const A = await import('../attendance.js');
const cfg = { ...A.DEFAULT_CFG };   // Mon–Fri
// 2026-12-21 Mon … 2026-12-27 Sun; 25 Dec (Fri) is a holiday except for 'u2'
const holidays = { '2026-12-25': { name: 'Christmas Day', exceptUids: ['u2'] } };

describe('working days', () => {
  it('counts Monday to Friday, without that person\'s public holidays', () => {
    expect(L.workingDays({ from: '2026-12-21', to: '2026-12-27', cfg, holidays, uid: 'u1' })).toBe(4);
    expect(L.workingDays({ from: '2026-12-21', to: '2026-12-27', cfg, holidays, uid: 'u2' })).toBe(5);   // left out of the holiday
  });
  it('a half day is 0.5, and only for one working day', () => {
    expect(L.workingDays({ from: '2026-12-22', to: '2026-12-22', halfDay: true, cfg, holidays, uid: 'u1' })).toBe(0.5);
    expect(L.workingDays({ from: '2026-12-26', to: '2026-12-26', halfDay: true, cfg, holidays, uid: 'u1' })).toBe(0);   // Saturday
  });
  it('follows the office working days', () => {
    expect(L.workingDays({ from: '2026-12-21', to: '2026-12-27', cfg: { workDays: [1, 2, 3, 4, 5, 6] }, holidays: {}, uid: 'u1' })).toBe(6);
  });
  it('gives 0 for bad or backwards dates', () => {
    expect(L.workingDays({ from: '2026-12-22', to: '2026-12-21', cfg, holidays, uid: 'u1' })).toBe(0);
    expect(L.workingDays({ from: '', to: '2026-12-21', cfg, holidays, uid: 'u1' })).toBe(0);
  });
});

describe('checking a request', () => {
  const ok = { type: 'annual', from: '2026-12-21', to: '2026-12-22', halfDay: false, note: '', days: 2 };
  it('passes a normal request', () => expect(L.checkRequest(ok)).toBe(''));
  it('stops the cases the rules refuse', () => {
    expect(L.checkRequest({ ...ok, type: 'holiday' })).toMatch(/type/);
    expect(L.checkRequest({ ...ok, to: '2026-12-20' })).toMatch(/before/);
    expect(L.checkRequest({ ...ok, halfDay: true })).toMatch(/one day/);
    expect(L.checkRequest({ ...ok, days: 0 })).toMatch(/no working days/);
    expect(L.checkRequest({ ...ok, days: 61 })).toMatch(/60/);
    expect(L.checkRequest({ ...ok, note: 'x'.repeat(301) })).toMatch(/300/);
  });
});

describe('balance', () => {
  const reqs = [
    { uid: 'u1', type: 'annual', from: '2026-03-02', to: '2026-03-04', days: 3, status: 'approved' },
    { uid: 'u1', type: 'annual', from: '2026-12-30', to: '2027-01-02', days: 3, status: 'approved' },   // counts in 2026 (its first day)
    { uid: 'u1', type: 'annual', from: '2026-06-01', to: '2026-06-01', days: 0.5, status: 'pending' },
    { uid: 'u1', type: 'annual', from: '2026-07-01', to: '2026-07-01', days: 1, status: 'declined' },
    { uid: 'u1', type: 'mc', from: '2026-05-05', to: '2026-05-05', days: 1, status: 'approved' },
    { uid: 'u2', type: 'annual', from: '2026-05-05', to: '2026-05-05', days: 1, status: 'approved' }
  ];
  const ent = { days: { annual: 14, mc: 14 } };
  it('given minus approved, with waiting apart; declined does not count', () => {
    const b = L.balanceFor(ent, reqs, 'u1', 2026);
    expect(b.find(x => x.key === 'annual')).toMatchObject({ given: 14, used: 6, waiting: 0.5, left: 8 });
    expect(b.find(x => x.key === 'mc')).toMatchObject({ given: 14, used: 1, left: 13 });
    expect(b.find(x => x.key === 'unpaid')).toMatchObject({ given: null, left: null });   // no limit
  });
  it('a request that crosses into the new year counts in the year of its first day', () => {
    expect(L.balanceFor(ent, reqs, 'u1', 2027).find(x => x.key === 'annual').used).toBe(0);
  });
  it('warns by how much a request goes over (waiting counted), never for no limit', () => {
    const b = L.balanceFor(ent, reqs, 'u1', 2026);
    expect(L.overBy(b, 'annual', 9)).toBe(1.5);   // 8 left, 0.5 waiting
    expect(L.overBy(b, 'annual', 2)).toBe(0);
    expect(L.overBy(b, 'unpaid', 40)).toBe(0);
  });
});

describe('leave days input', () => {
  it('empty = no limit, halves allowed, 0 to 365', () => {
    expect(L.cleanDays({ annual: '12.5', mc: '14', emergency: '', unpaid: '', other: '0' })).toEqual({ days: { annual: 12.5, mc: 14, other: 0 } });
    expect(L.cleanDays({ annual: '12.3' }).error).toMatch(/half/);
    expect(L.cleanDays({ mc: '400' }).error).toMatch(/365/);
    expect(L.cleanDays({ mc: 'abc' }).error).toMatch(/number/);
  });
  it('copy from last year fills only people with nothing set this year', () => {
    const staff = [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }];
    const draft = { a: L.daysInput({}), b: L.daysInput({ annual: 10 }), c: L.daysInput({}) };
    const last = { a: { days: { annual: 14 } }, b: { days: { annual: 20 } } };
    const { draft: out, count } = L.copyDraft(draft, last, staff, {});
    expect(count).toBe(1);
    expect(out.a.annual).toBe('14');
    expect(out.b.annual).toBe('10');   // kept
    expect(out.c.annual).toBe('');     // nothing last year
  });
  it('set for everyone fills empty boxes only, never your own row', () => {
    const staff = [{ uid: 'a' }, { uid: 'b' }, { uid: 'me' }];
    const draft = { a: L.daysInput({ mc: 5 }), b: L.daysInput({}), me: L.daysInput({}) };
    const { draft: out, count } = L.fillDraft(draft, staff, 'mc', '14', 'me');
    expect(count).toBe(1);
    expect(out.a.mc).toBe('5');
    expect(out.b.mc).toBe('14');
    expect(out.me.mc).toBe('');
  });
});

describe('waiting first', () => {
  it('waiting oldest first, then the rest newest first', () => {
    const list = [
      { id: 1, status: 'approved', from: '2026-01-05' }, { id: 2, status: 'pending', from: '2026-12-01' },
      { id: 3, status: 'pending', from: '2026-11-01' }, { id: 4, status: 'declined', from: '2026-06-01' }
    ];
    expect(L.sortForHR(list).map(r => r.id)).toEqual([3, 2, 4, 1]);
  });
});

describe('start dates', () => {
  it('HR details join date, else the staff record, else the first clock-in', () => {
    const staff = [{ uid: 'a', joinDate: '2026-01-01' }, { uid: 'b', joinDate: '2026-02-02' }, { uid: 'c' }, { uid: 'd' }];
    const hr = { a: { joinDate: '2025-05-05' } };
    expect(L.startDates(staff, hr, { c: '2026-11-12' })).toEqual({ a: '2025-05-05', b: '2026-02-02', c: '2026-11-12', d: '' });
  });
});

describe('Attendance report with leave', () => {
  const staff = [{ uid: 'u1', name: 'Aina', role: 'operations' }, { uid: 'u2', name: 'Badrul', role: 'operations' }];
  const leave = L.leaveByDay([
    { id: 'l1', uid: 'u1', type: 'annual', from: '2026-11-16', to: '2026-11-17', halfDay: false, status: 'approved' },
    { id: 'l2', uid: 'u1', type: 'mc', from: '2026-11-18', to: '2026-11-18', halfDay: true, status: 'approved' },
    { id: 'l3', uid: 'u2', type: 'annual', from: '2026-11-16', to: '2026-11-16', status: 'declined' }
  ]);
  const report = A.dailyReport({
    records: [], staff, holidays: {}, cfg, from: '2026-11-16', to: '2026-11-20', today: '2026-11-26', firstDay: '2026-11-11',
    deptLabel: r => r, leave, starts: { u1: '2026-01-01', u2: '2026-11-19' }
  });
  const rowsOf = uid => report.groups.flatMap(g => g.people).find(p => p.uid === uid);
  it('a working day with approved leave and no clock-in is Leave (type), never Absent', () => {
    const p = rowsOf('u1');
    expect(p.rows[0]).toMatchObject({ type: 'leave', status: 'Leave (Annual)', leave: 1 });
    expect(p.rows[2]).toMatchObject({ type: 'leave', status: 'Leave (Medical (MC), half day)', leave: 0.5 });
    expect(p.rows[3].type).toBe('absent');
    expect(p.totals).toMatchObject({ leave: 2.5, absent: 2 });
  });
  it('declined leave does not count, and absent starts at their own start date', () => {
    const p = rowsOf('u2');
    expect(p.rows.slice(0, 3).map(r => r.type)).toEqual(['blank', 'blank', 'blank']);   // before 19 Nov: not absent
    expect(p.totals.absent).toBe(2);
    expect(p.totals.leave).toBe(0);
  });
  it('the totals and the Excel sheet carry the Leave column', () => {
    expect(A.reportTotals(report).leave).toBe(2.5);
    const XLSX = { utils: { encode_cell: ({ r, c }) => `${c}:${r}`, encode_col: c => `C${c}`, encode_range: () => 'A1' } };
    const ws = A.reportSheet(report, XLSX, 'now');
    const headers = Object.values(ws).filter(c => c && c.t === 's').map(c => c.v);
    expect(headers).toContain('Leave Days');
    expect(headers).toContain('Leave (Annual)');
  });
});

describe('HR\'s own leave types (rules Draft 1.16)', () => {
  it('keeps the built-in five first and always there, then HR\'s own', () => {
    const list = L.mergeTypes([{ key: 'maternity', label: 'Maternity', active: true }, { key: 'mc', label: 'Sick leave', active: true }, { key: 'BAD KEY', label: 'x' }]);
    expect(list.map(t => t.key)).toEqual(['annual', 'mc', 'emergency', 'unpaid', 'other', 'maternity']);
    expect(list.find(t => t.key === 'mc')).toMatchObject({ label: 'Sick leave', builtIn: true });
    expect(list.find(t => t.key === 'maternity').builtIn).toBe(false);
  });
  it('makes a safe, unique key from the name', () => {
    expect(L.keyFor('Maternity leave')).toBe('maternity_leave');
    expect(L.keyFor('Maternity leave', ['maternity_leave'])).toBe('maternity_leave_2');
    expect(L.keyFor('2nd Marriage!')).toBe('nd_marriage');
    expect(L.keyFor('Ü')).toBe('type');
  });
  it('checks names: needed, no two the same, at least one on', () => {
    expect(L.cleanTypes([{ key: 'annual', label: '' }]).error).toMatch(/name/);
    expect(L.cleanTypes([{ key: 'annual', label: 'A' }, { key: 'x_y', label: 'a' }]).error).toMatch(/Two/);
    expect(L.cleanTypes(L.LEAVE_TYPES.map(t => ({ ...t, active: false }))).error).toMatch(/at least one/);
  });
  it('a new type can be picked, counted and labelled; a type turned off can\'t be picked but still counts', () => {
    L.setLeaveTypes([{ key: 'maternity', label: 'Maternity', active: true }, { key: 'emergency', label: 'Emergency', active: false }]);
    try {
      const ok = { from: '2026-12-21', to: '2026-12-22', halfDay: false, note: '', days: 2 };
      expect(L.checkRequest({ ...ok, type: 'maternity' })).toBe('');
      expect(L.checkRequest({ ...ok, type: 'emergency' })).toMatch(/type/);
      expect(L.cleanDays({ maternity: '60' })).toEqual({ days: { maternity: 60 } });
      const b = L.balanceFor({ days: { maternity: 60, emergency: 3 } }, [{ uid: 'u', type: 'emergency', from: '2026-02-02', days: 1, status: 'approved' }], 'u', 2026);
      expect(b.find(x => x.key === 'maternity').left).toBe(60);
      expect(b.find(x => x.key === 'emergency')).toMatchObject({ active: false, used: 1, left: 2 });
      expect(L.leaveByDay([{ uid: 'u', type: 'maternity', from: '2026-12-21', to: '2026-12-21', status: 'approved' }]).get('u_2026-12-21').label).toBe('Maternity');
      expect(L.typeLabel('gone_type')).toBe('Gone_type');   // a key no longer on the list still shows something
    } finally { L.setLeaveTypes(null); }
  });
});
