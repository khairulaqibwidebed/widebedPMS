// Staff Attendance page logic (HR > Attendance). Run: npm test
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase.js', () => ({ db: {} }));
vi.mock('@/lib/finance-data.js', () => ({ audit: () => {} }));
vi.mock('firebase/firestore', () => ({
  Timestamp: { fromMillis: ms => ({ toMillis: () => ms }) },
  serverTimestamp: () => 'SERVER_TIME', deleteField: () => 'DELETE',
  collection: () => ({}), doc: () => ({}), getDoc: async () => ({}), getDocs: async () => ({ docs: [] }), query: () => ({}),
  where: () => ({}), orderBy: () => ({}), limit: () => ({}), writeBatch: () => ({ set() {}, commit: async () => {} }), deleteDoc: async () => {}
}));

const A = await import('../attendance.js');
const ts = (key, time) => ({ toMillis: () => A.atMy(key, time) });
const me = { user: { uid: 'hr1' }, name: 'Hana (HR)' };

describe('Malaysia time', () => {
  it('reads times as Malaysia time whatever the computer is set to', () => {
    expect(A.clock(ts('2026-11-11', '09:05'))).toBe('9:05 AM');
    expect(A.hhmm(ts('2026-11-11', '18:30'))).toBe('18:30');
    expect(A.dayKey(Date.UTC(2026, 10, 10, 17, 30))).toBe('2026-11-11');   // 1:30 AM in KL
    expect(A.weekday('2026-11-11')).toBe(3);                                  // Wednesday
    expect(A.monthRange(-1, Date.UTC(2026, 10, 11))).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });
});

describe('the table', () => {
  const staff = [{ uid: 'a', name: 'Aisyah', role: 'operations' }, { uid: 'b', name: 'Ben', role: 'finance' }];
  const rec = (uid, date, out = true, extra = {}) => ({ id: `${uid}_${date}`, uid, date, name: uid === 'a' ? 'Aisyah' : 'Ben', role: 'operations',
    clockIn: ts(date, '08:55'), ...(out ? { clockOut: ts(date, '18:00') } : {}), status: 'present', ...extra });
  const rows = A.buildRows({
    records: [rec('a', '2026-11-09'), rec('a', '2026-11-10', false), rec('b', '2026-11-10', true, { status: 'late', late: true }), rec('a', '2026-11-11', false)],
    staff, holidays: { '2026-11-06': 'Test holiday' }, cfg: A.DEFAULT_CFG,
    from: '2026-11-01', to: '2026-11-30', today: '2026-11-11', firstDay: '2026-11-05'
  });
  const kind = (uid, date) => rows.find(r => r.uid === uid && r.date === date)?.kind;

  it('shows records, missed clock-outs and days with no clock-in', () => {
    expect(kind('a', '2026-11-09')).toBe('present');
    expect(kind('a', '2026-11-10')).toBe('noClockOut');
    expect(kind('b', '2026-11-10')).toBe('late');
    expect(kind('a', '2026-11-11')).toBe('clockedIn');      // today, not out yet
    expect(kind('b', '2026-11-09')).toBe('missing');        // Monday, nothing
    expect(kind('b', '2026-11-11')).toBeUndefined();         // today is never missing
    expect(kind('a', '2026-11-06')).toBeUndefined();         // holiday
    expect(kind('a', '2026-11-07')).toBeUndefined();         // Saturday
    expect(kind('a', '2026-11-04')).toBeUndefined();         // before anyone used the app
    expect(rows[0].date).toBe('2026-11-11');                 // newest first
  });

  it('adds up the totals', () => {
    const s = A.summary(rows);
    expect(s.present).toBe(4);
    expect(s.late).toBe(1);
    expect(s.noClockOut).toBe(1);
    expect(s.missing).toBe(3);   // Aisyah 5 Nov; Ben 5 and 9 Nov (6 Nov is the holiday)
  });
});

describe('corrections', () => {
  const row = { uid: 'a', name: 'Aisyah', role: 'operations', date: '2026-11-10', rec: null };
  it('works out late, off day and hours from the times', () => {
    const d = A.correctionFor({ row, inTime: '09:20', outTime: '18:05', note: 'Forgot to clock in', cfg: A.DEFAULT_CFG, holidays: {}, me });
    expect(d.late).toBe(true);
    expect(d.status).toBe('late');
    expect(d.workedMinutes).toBe(8 * 60 + 45);
    expect(d.editedBy).toBe('hr1');
    expect(d.editNote).toBe('Forgot to clock in');
    const ok = A.correctionFor({ row, inTime: '09:10', outTime: '', note: 'x x x', cfg: A.DEFAULT_CFG, holidays: {}, me });
    expect(ok.late).toBe(false);                    // 9:10 exactly is on time
    expect('clockOut' in ok).toBe(false);
    const hol = A.correctionFor({ row, inTime: '10:00', outTime: '12:00', note: 'x x x', cfg: A.DEFAULT_CFG, holidays: { '2026-11-10': 'X' }, me });
    expect(hol.status).toBe('offDay');
  });
  it('removes a clock-out when it is cleared', () => {
    const d = A.correctionFor({ row: { ...row, rec: { clockIn: ts('2026-11-10', '09:00'), clockOut: ts('2026-11-10', '18:00') } },
      inTime: '09:00', outTime: '', note: 'Wrong clock-out', cfg: A.DEFAULT_CFG, holidays: {}, me });
    expect(d.clockOut).toBe('DELETE');
  });
  it('refuses a clock-out before the clock-in', () => {
    expect(() => A.correctionFor({ row, inTime: '18:00', outTime: '09:00', note: 'x x x', cfg: A.DEFAULT_CFG, holidays: {}, me })).toThrow();
  });
  it("won't let you fix your own record", async () => {
    await expect(A.saveCorrection({ row: { ...row, uid: 'hr1' }, inTime: '09:00', outTime: '', note: 'mine', cfg: A.DEFAULT_CFG, holidays: {}, me })).rejects.toThrow(/own/);
  });
});

describe('several clock-ins a day', () => {
  const s1 = { id: 'a_2026-11-10', uid: 'a', date: '2026-11-10', name: 'Aisyah', role: 'operations', status: 'late', late: true, lateReason: 'Rain',
    clockIn: ts('2026-11-10', '09:20'), clockOut: ts('2026-11-10', '12:00'), workedMinutes: 160 };
  const s2 = { id: 'a_2026-11-10_s2', uid: 'a', date: '2026-11-10', session: 2, name: 'Aisyah', role: 'operations', status: 'present', late: false,
    clockIn: ts('2026-11-10', '14:00'), clockOut: ts('2026-11-10', '18:00') };
  it('adds them into one row: first in, last out, total time', () => {
    const rows = A.buildRows({ records: [s2, s1], staff: [], holidays: {}, cfg: A.DEFAULT_CFG, from: '2026-11-10', to: '2026-11-10', today: '2026-11-11', firstDay: null });
    expect(rows.length).toBe(1);
    expect(rows[0].kind).toBe('late');
    expect(A.clock(rows[0].rec.clockIn)).toBe('9:20 AM');
    expect(A.clock(rows[0].rec.clockOut)).toBe('6:00 PM');
    expect(A.minutesOf(rows[0].rec)).toBe(160 + 240);
    expect(A.sessionTimes(rows[0].rec)).toBe('9:20 AM – 12:00 PM, 2:00 PM – 6:00 PM');
    expect(A.exportRows(rows, () => 'Operations')[1].slice(14)).toEqual([2, '9:20 AM – 12:00 PM, 2:00 PM – 6:00 PM']);
  });
  it('a later clock-in still open is a missing clock-out the next day', () => {
    const open = { ...s2, clockOut: undefined };
    const rows = A.buildRows({ records: [s1, open], staff: [], holidays: {}, cfg: A.DEFAULT_CFG, from: '2026-11-10', to: '2026-11-10', today: '2026-11-11', firstDay: null });
    expect(rows[0].kind).toBe('noClockOut');
    expect(A.minutesOf(rows[0].rec)).toBe(160);
  });
  it('fixing a later clock-in is never late and goes to that clock-in', () => {
    const row = A.buildRows({ records: [s1, s2], staff: [], holidays: {}, cfg: A.DEFAULT_CFG, from: '2026-11-10', to: '2026-11-10', today: '2026-11-11', firstDay: null })[0];
    const d = A.correctionFor({ row, session: 2, inTime: '14:30', outTime: '18:00', note: 'Back later than recorded', cfg: A.DEFAULT_CFG, holidays: {}, me });
    expect(d.session).toBe(2);
    expect(d.late).toBe(false);
    expect(d.workedMinutes).toBe(210);
    expect(A.sessionDocId('a', '2026-11-10', 2)).toBe('a_2026-11-10_s2');
    expect(A.sessionDocId('a', '2026-11-10', 1)).toBe('a_2026-11-10');
  });
});

describe('daily report (payroll layout)', () => {
  const r = (uid, date, i, o, extra = {}) => ({ id: `${uid}_${date}`, uid, date, name: uid === 'a' ? 'Neo Ka Hoong' : 'Aisyah', role: uid === 'a' ? 'it' : 'operations',
    clockIn: ts(date, i), ...(o ? { clockOut: ts(date, o) } : {}), status: 'present', ...extra });
  const records = [
    r('a', '2026-10-01', '08:46', '18:04'), r('a', '2026-10-05', '09:24', '18:04', { status: 'late', late: true }),
    r('a', '2026-10-06', '08:46', '12:30'), { ...r('a', '2026-10-06', '14:00', '18:02'), id: 'a_2026-10-06_s2', session: 2 },
    r('a', '2026-10-07', '08:32', '16:33'), r('a', '2026-10-08', '08:50', null)
  ];
  const staff = [{ uid: 'a', name: 'Neo Ka Hoong', role: 'it', intern: true }, { uid: 'b', name: 'Aisyah', role: 'operations', intern: false }];
  const rep = A.dailyReport({ records, staff, holidays: { '2026-10-09': 'Test Holiday' }, cfg: A.DEFAULT_CFG, from: '2026-10-01', to: '2026-10-12',
    today: '2026-10-12', firstDay: '2026-10-01', deptLabel: x => ({ it: 'IT', operations: 'Operations' })[x] });
  const neo = rep.groups.find(g => g.title === 'Interns').people[0];
  const row = d => neo.rows.find(x => x.key === d);

  it('groups by department, interns last, and counts every day', () => {
    expect(rep.groups.map(g => g.title)).toEqual(['Operations', 'Interns']);
    expect(neo.position).toBe('Intern IT');
    expect(neo.rows.length).toBe(12);
    expect(rep.maxSessions).toBe(2);
  });
  it('fills each day like the payroll sheet', () => {
    expect(row('2026-10-01').date).toBe('26-10-01 Thu');
    expect(row('2026-10-01').shift).toBe('A 09:00-18:00');
    expect(row('2026-10-01').workMin).toBe(558);                         // same as the payroll file for 08:46 – 18:04
    expect(row('2026-10-05').pairs[0].inResult).toBe('Late 24 Mins');
    expect(row('2026-10-05').lateMin).toBe(24);
    expect(row('2026-10-06').pairs.length).toBe(2);                     // clocked in again
    expect(row('2026-10-07').pairs[0].outResult).toBe('Leave Early 1 Hours 27 Mins');
    expect(row('2026-10-08').pairs[0].outResult).toBe('Missing');
    expect(row('2026-10-08').workMin).toBe(null);
    expect(row('2026-10-03').text).toBe('Rest');
    expect(row('2026-10-09').text).toBe('Public Holiday: Test Holiday');
    expect(row('2026-10-12').type).toBe('blank');                       // today: not absent yet
  });
  it('marks absent working days and adds up the totals', () => {
    const ais = rep.groups.find(g => g.title === 'Operations').people[0];
    expect(ais.totals.absent).toBe(6);                                    // no clock-ins: Thu 1, Fri 2, Mon 5 – Thu 8 Oct (9 Oct holiday, 12 Oct today)
    expect(neo.totals.late).toBe(24);
    const t = A.reportTotals(rep);
    expect(t.late).toBe(1);
    expect(t.noClockOut).toBe(1);
  });
  it('a day of 540 minutes or more is Normal, even leaving before 6 PM', () => {
    expect(row('2026-10-01').status).toBe('Normal');                     // 558 minutes
    const early = A.dailyReport({ records: [r('b', '2026-10-01', '08:30', '17:30')], staff, holidays: {}, cfg: A.DEFAULT_CFG, from: '2026-10-01', to: '2026-10-01',
      today: '2026-10-12', firstDay: '2026-10-01', deptLabel: x => x, staffFilter: ['b'] });
    const d = early.groups[0].people[0].rows[0];
    expect(d.workMin).toBe(540);
    expect(d.status).toBe('Normal');
    expect(d.pairs[0].outResult).toBe('Normal');                         // not "Leave Early" on a full day
    expect(row('2026-10-07').status).toBe('Short 59 Mins');               // 08:32 – 16:33 = 481
    expect(row('2026-10-08').status).toBe('Missing clock-out');
    expect(rep.groups.find(g => g.title === 'Operations').people[0].rows[0].status).toBe('Absent');
  });
  it('shows Off-site when clocked in or out away from the office', () => {
    const off = A.dailyReport({ records: [r('b', '2026-10-01', '09:20', '18:30', { clockInInArea: false, clockOutInArea: true, late: true })], staff, holidays: {},
      cfg: A.DEFAULT_CFG, from: '2026-10-01', to: '2026-10-01', today: '2026-10-12', firstDay: '2026-10-01', deptLabel: x => x, staffFilter: ['b'] });
    const p = off.groups[0].people[0].rows[0].pairs[0];
    expect(p.inResult).toBe('Late 20 Mins · Off-site');
    expect(p.outResult).toBe('Normal');
    expect(A.reportTotals(off).offsite).toBe(1);
  });
  it('filters by one or more names', () => {
    const both = A.dailyReport({ records, staff, holidays: {}, cfg: A.DEFAULT_CFG, from: '2026-10-01', to: '2026-10-02', today: '2026-10-12', firstDay: '2026-10-01',
      deptLabel: x => x, staffFilter: ['a', 'b'] });
    expect(both.groups.flatMap(g => g.people).length).toBe(2);
    const one = A.dailyReport({ records, staff, holidays: {}, cfg: A.DEFAULT_CFG, from: '2026-10-01', to: '2026-10-02', today: '2026-10-12', firstDay: '2026-10-01',
      deptLabel: x => x, staffFilter: ['b'] });
    expect(one.groups.flatMap(g => g.people).map(p => p.uid)).toEqual(['b']);
  });
  it('puts a Status column in the Excel sheet', async () => {
    const XLSX = (await import('xlsx-js-style')).default;
    const ws = A.reportSheet(rep, XLSX, 'now');
    expect(Object.values(ws).some(c => c && c.v === 'Status')).toBe(true);
  });
});

describe('holiday list', () => {
  it('reads pasted lines in both date styles', () => {
    const { list, bad } = A.parseHolidayLines('2026-12-25 Christmas Day\n31/8/2026, Merdeka Day\n\nhello');
    expect(list).toEqual([{ date: '2026-12-25', name: 'Christmas Day' }, { date: '2026-08-31', name: 'Merdeka Day' }]);
    expect(bad).toEqual(['hello']);
  });
});

describe('holidays per person (Draft 0.59)', () => {
  const hols = { '2026-10-09': { name: 'Test Holiday', exceptUids: ['b'] } };
  it('a holiday counts only for the staff it is for', () => {
    expect(A.holidayFor(hols, '2026-10-09', 'a')).toBe('Test Holiday');
    expect(A.holidayFor(hols, '2026-10-09', 'b')).toBe('');
    expect(A.holidayFor({ '2026-10-09': 'Old style' }, '2026-10-09', 'b')).toBe('Old style');   // a plain name = everyone
    expect(A.holidayFor(hols, '2026-10-10', 'a')).toBe('');
  });
  it('someone left out works as normal: absent if no clock-in, late counts', () => {
    const staff = [{ uid: 'a', name: 'Aisyah', role: 'operations' }, { uid: 'b', name: 'Ben', role: 'operations' }];
    const rep = A.dailyReport({ records: [], staff, holidays: hols, cfg: A.DEFAULT_CFG, from: '2026-10-09', to: '2026-10-09',
      today: '2026-10-12', firstDay: '2026-10-01', deptLabel: x => x });
    const day = uid => rep.groups[0].people.find(p => p.uid === uid).rows[0];
    expect(day('a').text).toBe('Public Holiday: Test Holiday');
    expect(day('b').status).toBe('Absent');
    const row = { date: '2026-10-09', uid: 'b', name: 'Ben', role: 'operations', rec: null };
    const fix = A.correctionFor({ row, inTime: '09:30', outTime: '18:00', note: 'x x x', cfg: A.DEFAULT_CFG, holidays: hols, me });
    expect(fix.offDay).toBe(false);
    expect(fix.late).toBe(true);
    const forA = A.correctionFor({ row: { ...row, uid: 'a' }, inTime: '09:30', outTime: '18:00', note: 'x x x', cfg: A.DEFAULT_CFG, holidays: hols, me });
    expect(forA.offDay).toBe(true);
  });
  it('the old table leaves out only the people the holiday is for', () => {
    const staff = [{ uid: 'a', name: 'Aisyah', role: 'operations' }, { uid: 'b', name: 'Ben', role: 'operations' }];
    const rows = A.buildRows({ records: [], staff, holidays: hols, cfg: A.DEFAULT_CFG, from: '2026-10-09', to: '2026-10-09', today: '2026-10-12', firstDay: '2026-10-01' });
    expect(rows.map(r => r.uid)).toEqual(['b']);
  });
});

describe('Excel', () => {
  it('has one header row and one row per line', () => {
    const r = { date: '2026-11-10', name: 'Aisyah', kind: 'present', rec: { clockIn: ts('2026-11-10', '09:00'), clockOut: ts('2026-11-10', '18:00'), workedMinutes: 540 } };
    const aoa = A.exportRows([r], () => 'Operations');
    expect(aoa[0][0]).toBe('Date');
    expect(aoa[1].slice(0, 9)).toEqual(['2026-11-10', 'Tue', 'Aisyah', 'Operations', 'Present', '9:00 AM', '6:00 PM', 9, '9:00']);
  });
});
