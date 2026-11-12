// Staff Attendance (11 Nov 2026). The Widebed Staff Attendance app (Flutter) writes attendance/{uid}_{YYYY-MM-DD};
// this page lets HR and Directors read everyone's, fix a missed clock-in or clock-out, keep the public holiday list and
// change the office settings. Firestore rules: Draft 0.49 (the app), 0.51 (corrections here), 0.52 (several clock-ins a day),
// 0.59 (a holiday can leave some staff out: exceptUids), 0.61 (several locations: config.places, clockInPlace / clockOutPlace).
// Times are Malaysia time (UTC+8, no daylight saving) whatever the computer is set to.
import { db } from '@/lib/firebase.js';
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, writeBatch, serverTimestamp, Timestamp, deleteDoc, deleteField } from 'firebase/firestore';
import { audit } from '@/lib/finance-data.js';

// ---------- Settings ----------
// The same defaults as the app and the Firestore rules (agreed 11 Nov 2026).
export const DEFAULT_CFG = Object.freeze({
  officeName: 'Widebed Office',
  address: 'Unit 01-01, 1st Floor, Micasa Shoppes, 368-A Jalan Tun Razak, 50400 Kuala Lumpur',
  lat: 3.156812, lng: 101.722188, radiusM: 250,
  workStartMin: 540, lateAfterMin: 550, workEndMin: 1080, workDays: [1, 2, 3, 4, 5],
  allowOffsite: true,         // Draft 0.54: clock in / out away from the office is allowed and shown as Off-site
  places: []                  // Draft 0.61: the other locations (properties): { name, address, lat, lng, radiusM, cosLat }
});
// What a clock-in at the main office is recorded as (the same word in the app and the rules).
export const MAIN_PLACE = 'WIDEBED';
export const MAX_PLACES = 30;

// "3.156812, 101.722188", or a Google Maps link that has the numbers in it -> { lat, lng } (null when there are none).
export function parseLatLng(text) {
  const t = String(text || '').trim();
  const m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(t)                 // the pin of a place link
    || /[?&](?:q|ll|query|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i.exec(t)
    || /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(t)                          // the middle of the map
    || /^\(?\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*\)?$/.exec(t);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
// The locations list, checked and tidied for saving (throws a message HR can read).
export function cleanPlaces(list) {
  const out = [], seen = new Set([MAIN_PLACE.toLowerCase()]);
  for (const p of list || []) {
    const name = String(p.name || '').trim().slice(0, 60);
    const lat = Number(p.lat), lng = Number(p.lng), radiusM = Number(p.radiusM);
    if (!name) throw new Error('Give every location a name.');
    if (seen.has(name.toLowerCase())) throw new Error(`Two locations are called "${name}". Each needs its own name (${MAIN_PLACE} is the main office).`);
    if (p.lat === '' || p.lng === '' || p.lat == null || p.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error(`Check the latitude and longitude of "${name}".`);
    if (!(radiusM >= 50 && radiusM <= 2000)) throw new Error(`The allowed distance of "${name}" must be between 50 and 2000 metres.`);
    seen.add(name.toLowerCase());
    out.push({ name, address: String(p.address || '').trim().slice(0, 200), lat, lng, radiusM, cosLat: Math.cos(lat * Math.PI / 180) });
  }
  if (out.length > MAX_PLACES) throw new Error(`${MAX_PLACES} locations at most.`);
  return out;
}
// Where a clock-in ('In') or clock-out ('Out') was made, as HR reads it: WIDEBED, a property's name, or
// "Off-site: <address the phone looked up, else the coordinates>". '' when nothing is known (a record HR added by hand).
export function placeText(rec, which) {
  if (!rec || !rec[`clock${which}`]) return '';
  const place = String(rec[`clock${which}Place`] || '').trim(), inArea = rec[`clock${which}InArea`];
  const lat = rec[`clock${which}Lat`], lng = rec[`clock${which}Lng`];
  if (inArea === false) return `Off-site: ${place || (typeof lat === 'number' && typeof lng === 'number' ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'place not recorded')}`;
  return place || (inArea === true ? MAIN_PLACE : '');
}
export function mapLink(rec, which) {
  const lat = rec?.[`clock${which}Lat`], lng = rec?.[`clock${which}Lng`];
  return typeof lat === 'number' && typeof lng === 'number' ? `https://www.google.com/maps?q=${lat},${lng}` : '';
}
// A full day: work start to work end (9:00 – 18:00 = 540 minutes). A day with at least this much work is Normal,
// even if they left before 6 PM (owner, 11 Nov 2026).
export const requiredMinutes = cfg => Math.max(0, (cfg.workEndMin ?? 1080) - (cfg.workStartMin ?? 540));
export const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export async function loadConfig() {
  const s = await getDoc(doc(db, 'config', 'attendance'));
  return { ...DEFAULT_CFG, ...(s.exists() ? s.data() : {}) };
}

export async function saveConfig(cfg, me) {
  const data = {
    officeName: String(cfg.officeName || '').trim() || DEFAULT_CFG.officeName,
    address: String(cfg.address || '').trim(),
    lat: Number(cfg.lat), lng: Number(cfg.lng), radiusM: Number(cfg.radiusM),
    cosLat: Math.cos(Number(cfg.lat) * Math.PI / 180),   // the rules use it for the distance sum
    workStartMin: Math.round(cfg.workStartMin), lateAfterMin: Math.round(cfg.lateAfterMin), workEndMin: Math.round(cfg.workEndMin),
    workDays: [...cfg.workDays].map(Number).sort(),
    allowOffsite: cfg.allowOffsite !== false,
    places: cleanPlaces(cfg.places),
    updatedBy: me.user.uid, updatedAt: serverTimestamp()
  };
  const b = writeBatch(db);
  b.set(doc(db, 'config', 'attendance'), data);
  audit(b, me, { action: 'attendance.settings', entity: 'config/attendance',
    changes: [{ field: 'office', to: `${data.lat}, ${data.lng} · ${data.radiusM} m` }, { field: 'late after', to: hm(data.lateAfterMin) },
      { field: 'other locations', to: data.places.map(p => `${p.name} (${p.radiusM} m)`).join(', ') || 'none' }] });
  await b.commit();
}

// ---------- Time helpers (Malaysia) ----------
const MY = 8 * 3600 * 1000;
const myDate = ms => new Date(ms + MY);                      // read its getUTC* parts as Malaysia time
export const pad = n => String(n).padStart(2, '0');
export const dayKey = (ms = Date.now()) => { const d = myDate(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const hm = m => { const h = Math.floor(m / 60), mm = m % 60; return `${h % 12 || 12}:${pad(mm)} ${h < 12 ? 'AM' : 'PM'}`; };
export const toMs = t => (t?.toMillis ? t.toMillis() : t instanceof Date ? t.getTime() : typeof t === 'number' ? t : null);
export const clock = t => { const ms = toMs(t); if (ms == null) return ''; const d = myDate(ms); return hm(d.getUTCHours() * 60 + d.getUTCMinutes()); };
export const hhmm = t => { const ms = toMs(t); if (ms == null) return ''; const d = myDate(ms); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
export const duration = m => (m == null ? '' : `${Math.floor(m / 60)}h ${pad(m % 60)}m`);
// ISO weekday 1 = Monday … 7 = Sunday, of a YYYY-MM-DD day
export const weekday = key => { const d = new Date(key + 'T00:00:00Z').getUTCDay(); return d === 0 ? 7 : d; };
// 'YYYY-MM-DD' + 'HH:MM' (Malaysia) -> milliseconds
export const atMy = (key, time) => Date.parse(`${key}T${time}:00+08:00`);
export function daysBetween(from, to) {
  const out = [];
  for (let t = Date.parse(from + 'T00:00:00Z'), end = Date.parse(to + 'T00:00:00Z'); t <= end; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
export function monthRange(offset = 0, now = Date.now()) {
  const d = myDate(now), y = d.getUTCFullYear(), m = d.getUTCMonth() + offset;
  const first = new Date(Date.UTC(y, m, 1)), last = new Date(Date.UTC(y, m + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

// ---------- Reading ----------
export async function loadRecords(from, to) {
  const snap = await getDocs(query(collection(db, 'attendance'), where('date', '>=', from), where('date', '<=', to), orderBy('date', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
// The first day anyone used the app: before it, no day counts as Missing.
export async function loadFirstDay() {
  const snap = await getDocs(query(collection(db, 'attendance'), orderBy('date'), limit(1)));
  return snap.empty ? null : snap.docs[0].data().date;
}
// Active staff with a role (the same people who can sign in to the app).
export async function loadStaff() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }))
    .filter(u => u.active !== false && u.role)
    .map(u => ({ uid: u.uid, name: u.displayName || u.email || 'Unknown', email: u.email || '', role: u.role, intern: !!u.intern }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
// { '2026-12-25': { name: 'Christmas Day', exceptUids: ['uid1'] } }. exceptUids = staff left out (Draft 0.59); empty = everyone.
export async function loadHolidays(from, to) {
  const snap = await getDocs(collection(db, 'attendanceHolidays'));
  return Object.fromEntries(snap.docs.filter(d => (!from || d.id >= from) && (!to || d.id <= to))
    .map(d => [d.id, { name: d.data().name || 'Public holiday', exceptUids: Array.isArray(d.data().exceptUids) ? d.data().exceptUids : [] }]));
}
// The holiday's name if [date] is a holiday for this person, else ''. (A plain name string also works: older callers and tests.)
export function holidayFor(holidays, date, uid) {
  const h = holidays?.[date];
  if (!h) return '';
  if (typeof h === 'string') return h;
  return (h.exceptUids || []).includes(uid) ? '' : (h.name || 'Public holiday');
}

// ---------- The table: one row per person per day, plus the days nobody clocked in ----------
// Staff can clock in again after clocking out: a day can have several session documents
// ({uid}_{day}, {uid}_{day}_s2 …; rules Draft 0.52). They are added up into one row: first clock-in, last clock-out, total minutes.
export const sessionOf = r => (Number.isInteger(r?.session) && r.session > 1 ? r.session : 1);
export const sessionDocId = (uid, date, n) => (n > 1 ? `${uid}_${date}_s${n}` : `${uid}_${date}`);

export function groupDays(records) {
  const m = new Map();
  for (const r of records) {
    const k = `${r.uid}_${r.date}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  const out = new Map();
  for (const [k, list] of m) {
    const sessions = list.sort((a, b) => sessionOf(a) - sessionOf(b));
    const first = sessions[0], last = sessions[sessions.length - 1];
    const open = !last.clockOut;
    const closedMin = sessions.reduce((t, s) => t + (s.clockOut ? (minutesOf(s) || 0) : 0), 0);
    const notes = sessions.filter(s => s.editNote);
    out.set(k, {
      ...first, id: first.id, sessions,
      clockOut: open ? null : last.clockOut, clockOutDistance: open ? null : last.clockOutDistance,
      workedMinutes: closedMin, open,
      editNote: notes.map(s => s.editNote).join(' · '), editedByName: notes.map(s => s.editedByName).filter(Boolean)[0] || ''
    });
  }
  return out;
}

// kind: present | late | offDay | holiday | missing | noClockOut | clockedIn
export function buildRows({ records, staff, holidays, cfg, from, to, today, firstDay }) {
  const rows = [];
  const byKey = groupDays(records);
  const workDays = new Set(cfg.workDays || DEFAULT_CFG.workDays);
  for (const [key, d] of byKey) {
    const kind = d.open ? (d.date === today ? 'clockedIn' : 'noClockOut') : (d.status || 'present');
    rows.push({ key, date: d.date, uid: d.uid, name: d.name, role: d.role, rec: d, kind, holiday: holidayFor(holidays, d.date, d.uid) });
  }
  // A working day before today with no record, for each active staff member, from the first day the app was used.
  if (firstDay) {
    const start = from > firstDay ? from : firstDay, end = to < today ? to : today;
    for (const day of start <= end ? daysBetween(start, end) : []) {
      if (day >= today || !workDays.has(weekday(day))) continue;
      for (const s of staff) {
        if (holidayFor(holidays, day, s.uid)) continue;
        if (!byKey.has(`${s.uid}_${day}`)) rows.push({ key: `${s.uid}_${day}`, date: day, uid: s.uid, name: s.name, role: s.role, rec: null, kind: 'missing', holiday: '' });
      }
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

export const KIND = {
  present: ['Present', 'green'], late: ['Late', 'amber'], offDay: ['Off day work', 'grey'], holiday: ['Holiday', 'grey'],
  missing: ['Missing', 'red'], noClockOut: ['No clock-out', 'red'], clockedIn: ['Clocked in', 'blue']
};

export function minutesOf(r) {
  if (!r) return null;
  if (Number.isInteger(r.workedMinutes)) return r.workedMinutes;
  const a = toMs(r.clockIn), b = toMs(r.clockOut);
  return a != null && b != null ? Math.floor((b - a) / 60000) : null;
}

export function summary(rows) {
  const s = { present: 0, late: 0, missing: 0, noClockOut: 0, minutes: 0 };
  for (const r of rows) {
    if (r.rec?.clockIn) s.present++;
    if (r.rec?.late) s.late++;
    if (r.kind === 'missing') s.missing++;
    if (r.kind === 'noClockOut') s.noClockOut++;
    s.minutes += minutesOf(r.rec) || 0;
  }
  return s;
}

// ---------- Corrections (HR and Directors; never their own record) ----------
// Sets one clock-in (and its clock-out, if given) by hand, with a note for the audit log. [session] picks which of the
// day's clock-ins (1 = the first, which also decides Late / Off day; a missing day is always 1).
export function correctionFor({ row, session = 1, inTime, outTime, note, cfg, holidays, me, staffMember }) {
  const date = row.date;
  const n = session > 1 ? session : 1;
  const inMs = atMy(date, inTime);
  const outMs = outTime ? atMy(date, outTime) : null;
  if (!Number.isFinite(inMs)) throw new Error('Enter the clock-in time.');
  if (outTime && !(outMs > inMs)) throw new Error('Clock-out must be after clock-in.');
  const workDay = (cfg.workDays || DEFAULT_CFG.workDays).includes(weekday(date)) && !holidayFor(holidays, date, row.uid);
  const d = myDate(inMs), mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  const late = n === 1 && workDay && mins > cfg.lateAfterMin;
  const prev = (row.rec?.sessions || (row.rec ? [row.rec] : [])).find(x => sessionOf(x) === n) || {};
  const data = {
    uid: row.uid, date, ...(n > 1 ? { session: n } : {}),
    name: prev.name || staffMember?.name || row.name || '',
    department: prev.department || staffMember?.department || '',
    role: prev.role || staffMember?.role || row.role || null,
    clockIn: Timestamp.fromMillis(inMs),
    late, offDay: !workDay, status: !workDay ? 'offDay' : late ? 'late' : 'present',
    editedBy: me.user.uid, editedByName: me.name || '', editedAt: serverTimestamp(), editNote: String(note || '').trim(),
    updatedAt: serverTimestamp()
  };
  if (prev.lateReason) data.lateReason = prev.lateReason;
  if (!prev.createdAt) data.createdAt = serverTimestamp();
  if (outMs) { data.clockOut = Timestamp.fromMillis(outMs); data.workedMinutes = Math.floor((outMs - inMs) / 60000); }
  else if (prev.clockOut) { data.clockOut = deleteField(); data.workedMinutes = deleteField(); }   // clock-out taken away
  return data;
}

export async function saveCorrection(args) {
  const { row, me, note } = args;
  const n = args.session > 1 ? args.session : 1;
  if (row.uid === me.user.uid) throw new Error("You can't correct your own attendance. Ask another HR person or a Director.");
  if (String(note || '').trim().length < 3) throw new Error('Write what was wrong and why it is being corrected.');
  const data = correctionFor(args);
  const ref = doc(db, 'attendance', sessionDocId(row.uid, row.date, n));
  const prev = (row.rec?.sessions || []).find(x => sessionOf(x) === n);
  const b = writeBatch(db);
  // set with merge keeps the app's own fields (location, platform…) on an existing record
  b.set(ref, data, { merge: true });
  audit(b, me, { action: prev ? 'attendance.correct' : 'attendance.add', entity: `attendance/${sessionDocId(row.uid, row.date, n)}`,
    changes: [
      { field: n > 1 ? `clock in ${n}` : 'clock in', from: prev ? clock(prev.clockIn) : '', to: clock(data.clockIn) },
      { field: n > 1 ? `clock out ${n}` : 'clock out', from: prev ? clock(prev.clockOut) : '', to: args.outTime ? clock(data.clockOut) : '' }
    ], reason: data.editNote });
  await b.commit();
}

// ---------- Holidays ----------
const holidayName = name => String(name || '').trim().slice(0, 80) || 'Public holiday';
// Add a holiday, or change one ([existing] = the holiday as loaded). exceptUids: staff left out of it (Draft 0.59).
// [names] (uid -> name) only makes the audit line readable.
export async function addHoliday(date, name, me, { exceptUids = [], existing = null, names = {} } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Pick a date.');
  const except = [...new Set(exceptUids)];
  if (except.length > 300) throw new Error('Too many people left out (300 at most).');
  const who = except.length ? `everyone except ${except.map(u => names[u] || u).join(', ')}` : 'everyone';
  const data = { name: holidayName(name), exceptUids: except };
  if (existing) Object.assign(data, { updatedBy: me.user.uid, updatedAt: serverTimestamp() });
  else Object.assign(data, { addedBy: me.user.uid, addedAt: serverTimestamp() });
  const b = writeBatch(db);
  b.set(doc(db, 'attendanceHolidays', date), data, { merge: true });   // merge keeps addedBy / addedAt when changing one
  audit(b, me, { action: 'attendance.holiday', entity: `attendanceHolidays/${date}`,
    changes: [{ field: 'holiday', from: existing ? `${existing.name}` : '', to: `${date} ${data.name}` }, { field: 'for', to: who }] });
  await b.commit();
}
export async function removeHoliday(date, me) {
  await deleteDoc(doc(db, 'attendanceHolidays', date));
  const b = writeBatch(db);
  audit(b, me, { action: 'attendance.holidayRemove', entity: `attendanceHolidays/${date}`, changes: [{ field: 'holiday', from: date, to: '' }] });
  await b.commit();
}
// "2026-12-25, Christmas Day" or "25/12/2026 Christmas Day", one per line.
export function parseHolidayLines(text) {
  const out = [], bad = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let m = line.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[\s,;\t-]*(.*)$/);
    if (m) { out.push({ date: `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`, name: m[4].trim() || 'Public holiday' }); continue; }
    m = line.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})[\s,;\t-]*(.*)$/);
    if (m) { out.push({ date: `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`, name: m[4].trim() || 'Public holiday' }); continue; }
    bad.push(line);
  }
  return { list: out.filter(h => !Number.isNaN(Date.parse(h.date + 'T00:00:00Z'))), bad };
}
export async function addHolidays(list, me) {
  for (let i = 0; i < list.length; i += 200) {
    const b = writeBatch(db);
    for (const h of list.slice(i, i + 200)) b.set(doc(db, 'attendanceHolidays', h.date), { name: holidayName(h.name), exceptUids: [], addedBy: me.user.uid, addedAt: serverTimestamp() });
    audit(b, me, { action: 'attendance.holiday', entity: 'attendanceHolidays', changes: [{ field: 'holidays', to: `${list.slice(i, i + 200).length} added` }] });
    await b.commit();
  }
}

// "8:55 AM – 12:30 PM, 2:10 PM – 6:00 PM"
export const sessionTimes = d => (d.sessions || [d]).map(s => `${clock(s.clockIn)} – ${s.clockOut ? clock(s.clockOut) : '…'}`).join(', ');

// ---------- Excel ----------
export function exportRows(rows, deptOf) {
  const head = ['Date', 'Day', 'Staff', 'Department', 'Status', 'Clock in', 'Clock out', 'Hours', 'Worked (h:mm)', 'Late reason',
    'Clock-in distance (m)', 'Clock-out distance (m)', 'Corrected by', 'Correction note', 'Clock-ins', 'All times'];
  const body = rows.map(r => {
    const m = minutesOf(r.rec);
    return [r.date, DAY_NAMES[weekday(r.date)], r.name, deptOf(r), (KIND[r.kind] || [r.kind])[0],
      r.rec ? clock(r.rec.clockIn) : '', r.rec?.clockOut ? clock(r.rec.clockOut) : '',
      m == null ? '' : Math.round(m / 60 * 100) / 100, m == null ? '' : `${Math.floor(m / 60)}:${pad(m % 60)}`,
      r.rec?.lateReason || '', r.rec?.clockInDistance ?? '', r.rec?.clockOutDistance ?? '',
      r.rec?.editedByName || '', r.rec?.editNote || '',
      r.rec ? (r.rec.sessions || [r.rec]).length : '', r.rec ? sessionTimes(r.rec) : ''];
  });
  return [head, ...body];
}


// ======================================================================================================================
// Daily Report (11 Nov 2026): the layout of HR's payroll sheet (CLOCK_IN_PAYROLL.xlsx). One block per person, one row per
// day: Name | Position | Attendance Date | Attendance Shift | Clock In1 (Punch Time, Result, Location) | Clock Out1 (Punch Time, Result, Location)
// | [Clock In2 / Clock Out2 … when anyone clocked in again] | Work Duration (Minutes) | Late for (Minutes) | Absent Days,
// then a total line. Rest days and public holidays span the clock columns. Grouped by department; interns in their own group.
// The page table and the Excel export are both drawn from dailyReport().
// ======================================================================================================================
const WD = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hhOf = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const myMinutes = t => { const ms = toMs(t); if (ms == null) return null; const d = myDate(ms); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
export const reportDate = key => `${key.slice(2)} ${WD[weekday(key)]}`;   // 2026-10-01 -> "26-10-01 Thu"
const hoursMins = m => (m >= 60 ? `${Math.floor(m / 60)} Hours ${m % 60} Mins` : `${m} Mins`);

export function dailyReport({ records, staff, holidays, cfg, from, to, today, firstDay, deptLabel, staffFilter = '', deptFilter = '' }) {
  const days = daysBetween(from, to);
  const byDay = groupDays(records);
  const workDays = new Set(cfg.workDays || DEFAULT_CFG.workDays);
  const shift = `A ${hhOf(cfg.workStartMin)}-${hhOf(cfg.workEndMin)}`;
  const required = requiredMinutes(cfg);

  // Everyone active, plus anyone with records in these dates (e.g. someone who has since left).
  const people = new Map(staff.map(s => [s.uid, { ...s }]));
  for (const r of records) if (!people.has(r.uid)) people.set(r.uid, { uid: r.uid, name: r.name || 'Former staff', role: r.role, intern: false, former: true });
  const names = Array.isArray(staffFilter) ? staffFilter : (staffFilter ? [staffFilter] : []);   // Name column filter: one or more people
  const list = [...people.values()].filter(p => (!names.length || names.includes(p.uid)) && (!deptFilter || p.role === deptFilter));

  let maxSessions = 1;
  for (const d of byDay.values()) if (days.includes(d.date)) maxSessions = Math.max(maxSessions, d.sessions.length);

  const blocks = list.map(p => {
    const dept = deptLabel(p.role) || p.role || '';
    const rows = days.map(key => {
      const d = byDay.get(`${p.uid}_${key}`);
      const hol = holidayFor(holidays, key, p.uid);
      const workDay = workDays.has(weekday(key)) && !hol;
      const base = { key, date: reportDate(key), uid: p.uid, name: p.name, role: p.role, holiday: hol, workDay, att: d || null };
      if (!d) {
        if (hol) return { ...base, type: 'span', text: `Public Holiday: ${hol}`, fill: 'FFFF00' };
        if (!workDay) return { ...base, type: 'span', text: 'Rest', fill: 'FFFF00' };
        if (key >= today || !firstDay || key < firstDay) return { ...base, type: 'blank', shift, status: '', statusKind: '' };
        return { ...base, type: 'absent', shift, absent: 1, status: 'Absent', statusKind: 'absent' };
      }
      // Clocked in: one In / Out pair per clock-in. Off-site = clocked in or out away from the office (Draft 0.54).
      const startMin = myMinutes(d.sessions[0].clockIn);
      const late = !!d.sessions[0].late;
      const lateMin = late && startMin != null ? Math.max(0, startMin - cfg.workStartMin) : null;
      const dayMin = d.open ? null : (d.workedMinutes || 0);   // no minutes until every clock-in has its clock-out
      const fullDay = dayMin != null && dayMin >= required;
      const pairs = d.sessions.map((x, i) => {
        const isLast = i === d.sessions.length - 1;
        const outMin = myMinutes(x.clockOut);
        const inOff = x.clockInInArea === false, outOff = x.clockOutInArea === false;
        const isLate = i === 0 && late;
        let outResult = outOff ? 'Off-site' : 'Normal', outFill = outOff ? 'CCFFFF' : '', outKind = outOff ? 'offsite' : 'normal';
        if (outMin == null) { outResult = key === today ? 'Not yet' : 'Missing'; outFill = key === today ? '' : 'FF8080'; outKind = key === today ? 'open' : 'missing'; }
        // Leave Early only when the day is short of a full day (540 minutes); 8:30 – 17:30 is Normal
        else if (isLast && workDay && outMin < cfg.workEndMin && !fullDay) {
          outResult = `Leave Early ${hoursMins(cfg.workEndMin - outMin)}${outOff ? ' · Off-site' : ''}`; outFill = 'FFFFCC'; outKind = 'early';
        }
        return {
          n: i + 1, session: sessionOf(x), rec: x, edited: !!x.editNote, inOff, outOff,
          inTime: hhmm(x.clockIn),
          inResult: isLate ? `Late ${lateMin} Mins${inOff ? ' · Off-site' : ''}` : inOff ? 'Off-site' : 'Normal',
          inFill: isLate ? 'CCFFCC' : inOff ? 'CCFFFF' : '', inKind: isLate ? 'late' : inOff ? 'offsite' : 'normal',
          // Draft 0.61: where each was made (WIDEBED, a property, or Off-site: the address) and a map link to the exact spot
          inPlace: placeText(x, 'In'), outPlace: placeText(x, 'Out'), inMap: mapLink(x, 'In'), outMap: mapLink(x, 'Out'),
          outTime: x.clockOut ? hhmm(x.clockOut) : '', outResult, outFill, outKind
        };
      });
      const shiftText = workDay ? shift : hol ? `Public Holiday (worked)` : 'Rest (worked)';
      // The day's status (the 540-minute rule)
      let status, statusKind;
      if (d.open) { status = key === today ? 'Working' : 'Missing clock-out'; statusKind = key === today ? 'working' : 'missing'; }
      else if (!workDay) { status = 'Off day work'; statusKind = 'offday'; }
      else if (fullDay) { status = 'Normal'; statusKind = 'normal'; }
      else { status = `Short ${hoursMins(required - dayMin)}`; statusKind = 'short'; }
      return { ...base, type: 'work', shift: shiftText, pairs, workMin: dayMin, lateMin, open: d.open, status, statusKind,
        offsite: pairs.some(x => x.inOff || x.outOff) };
    });
    const totals = {
      work: rows.reduce((t, r) => t + (r.workMin || 0), 0),
      late: rows.reduce((t, r) => t + (r.lateMin || 0), 0),
      absent: rows.reduce((t, r) => t + (r.absent || 0), 0)
    };
    const group = p.intern ? 'Interns' : (dept || 'No department');
    return { uid: p.uid, name: p.name, position: p.intern ? `Intern ${dept}`.trim() : dept, group, rows, totals };
  });

  // Groups: departments A–Z, Interns last
  const groups = new Map();
  for (const b of blocks.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!groups.has(b.group)) groups.set(b.group, []);
    groups.get(b.group).push(b);
  }
  const order = [...groups.keys()].sort((a, b) => (a === 'Interns') - (b === 'Interns') || a.localeCompare(b));
  return { from, to, maxSessions, groups: order.map(title => ({ title, people: groups.get(title) })) };
}

// Totals across the report for the cards above the table.
export function reportTotals(report) {
  const t = { present: 0, late: 0, absent: 0, noClockOut: 0, minutes: 0, short: 0, offsite: 0 };
  for (const g of report.groups) for (const p of g.people) for (const r of p.rows) {
    if (r.type === 'work') {
      t.present++; if (r.lateMin != null) t.late++; if (r.pairs.some(x => x.outResult === 'Missing')) t.noClockOut++; t.minutes += r.workMin || 0;
      if (r.statusKind === 'short') t.short++;
      if (r.offsite) t.offsite++;
    }
    if (r.type === 'absent') t.absent++;
  }
  return t;
}

// ---------- Excel in the payroll layout (xlsx-js-style) ----------
const F_HEAD = '新宋体', F_BODY = '黑体';
const thin = { style: 'thin', color: { rgb: '000000' } };
const BORDER = { top: thin, bottom: thin, left: thin, right: thin };
const st = (o = {}) => ({
  font: { name: o.font || F_BODY, sz: o.sz || 12, bold: !!o.bold, color: o.color ? { rgb: o.color } : undefined },
  fill: o.fill ? { patternType: 'solid', fgColor: { rgb: o.fill } } : undefined,
  alignment: { horizontal: o.h || 'center', vertical: 'center', wrapText: o.wrap !== false },
  border: o.noBorder ? undefined : BORDER
});

export function reportSheet(report, XLSX, generatedAt) {
  const S = report.maxSessions;
  const W = 6;                                 // columns per clock-in: In (Punch Time, Result, Location), Out (the same three). Location: 12 Nov 2026
  const nCols = 4 + S * W + 4;                 // A–D, In/Out pairs, the three number columns, then Status (540-minute rule)
  const last = nCols - 1;
  const cIdx = { work: 4 + S * W, late: 5 + S * W, absent: 6 + S * W, status: 7 + S * W };
  const ws = {}, merges = [], rowsH = [];
  const put = (r, c, v, style, extra = {}) => {
    const cell = typeof v === 'number' ? { t: 'n', v } : { t: 's', v: v == null ? '' : String(v) };
    ws[XLSX.utils.encode_cell({ r, c })] = { ...cell, s: style, ...extra };
  };
  const fillRow = (r, from, to, style) => { for (let c = from; c <= to; c++) if (!ws[XLSX.utils.encode_cell({ r, c })]) put(r, c, '', style); };
  const merge = (r1, c1, r2, c2) => merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });

  // Title rows
  put(0, 0, `Daily Report From: ${report.from} to ${report.to}`, st({ font: F_HEAD, sz: 24, bold: true, fill: 'CCFFFF', color: '008080' }));
  fillRow(0, 1, last, st({ fill: 'CCFFFF' })); merge(0, 0, 0, last); rowsH[0] = { hpt: 31.5 };
  put(1, 0, `Generated At: ${generatedAt}`, st({ font: F_HEAD, sz: 14, fill: 'CCFFFF', color: '008080' }));
  fillRow(1, 1, last, st({ fill: 'CCFFFF' })); merge(1, 0, 1, last); rowsH[1] = { hpt: 18.75 };

  // Two header rows
  const H = st({ font: F_HEAD, sz: 10, bold: true, fill: 'FFFFCC' });
  [['Name', 0], ['Position', 1], ['Attendance Date', 2], ['Attendance Shift', 3]].forEach(([t, c]) => { put(2, c, t, H); put(3, c, '', H); merge(2, c, 3, c); });
  for (let k = 0; k < S; k++) {
    const c = 4 + k * W;
    put(2, c, `Clock In${k + 1}`, H); put(2, c + 1, '', H); put(2, c + 2, '', H); merge(2, c, 2, c + 2);
    put(2, c + 3, `Clock Out${k + 1}`, H); put(2, c + 4, '', H); put(2, c + 5, '', H); merge(2, c + 3, 2, c + 5);
    put(3, c, 'Punch Time:', H); put(3, c + 1, 'Result', H); put(3, c + 2, 'Location', H);
    put(3, c + 3, 'Punch Time:', H); put(3, c + 4, 'Result', H); put(3, c + 5, 'Location', H);
  }
  [['Work Duration (Minutes)', cIdx.work], ['Late for (Minutes)', cIdx.late], ['Absent Days', cIdx.absent], ['Status', cIdx.status]].forEach(([t, c]) => { put(2, c, t, H); put(3, c, '', H); merge(2, c, 3, c); });
  rowsH[3] = { hpt: 24 };

  // The black bar under the header, as in the payroll file
  for (let c = 0; c <= last; c++) put(4, c, '', st({ fill: '000000' }));
  merge(4, 0, 4, last);
  let r = 4;
  const D = st(), DL = st({ sz: 10 }), DRED = st({ color: 'FF0000' });
  for (const g of report.groups) {
    r++;                                                                    // blank line, then the group heading
    put(r, 0, g.title, st({ font: 'Aptos Narrow', sz: 10, bold: true, h: 'left', noBorder: true, wrap: false }));
    merge(r, 0, r, last); r++;
    for (const p of g.people) {
      const first = r;
      for (const row of p.rows) {
        put(r, 2, row.date, row.type === 'span' ? DRED : D);   // rest days and holidays: red date
        if (row.type === 'span') {
          put(r, 3, row.text, st({ fill: row.fill })); fillRow(r, 4, last, st({ fill: row.fill })); merge(r, 3, r, last);
        } else {
          put(r, 3, row.shift, D);
          for (let k = 0; k < S; k++) {
            const c = 4 + k * W, x = row.pairs?.[k];
            // Location: an off-site one is light blue and opens the exact spot on Google Maps
            const loc = (cc, text, off, url) => put(r, cc, text || '', st({ sz: 10, fill: off ? 'CCFFFF' : '' }), off && url ? { l: { Target: url, Tooltip: 'Open the spot on Google Maps' } } : {});
            put(r, c, x ? x.inTime : '', D); put(r, c + 1, x ? x.inResult : (row.type === 'absent' && k === 0 ? 'Absent' : ''), st({ fill: x ? x.inFill : (row.type === 'absent' && k === 0 ? 'FF8080' : '') }));
            loc(c + 2, x?.inPlace, x?.inOff, x?.inMap);
            put(r, c + 3, x ? x.outTime : '', D); put(r, c + 4, x ? x.outResult : '', st({ fill: x ? x.outFill : '' }));
            loc(c + 5, x?.outPlace, x?.outOff && !!x?.outTime, x?.outMap);
          }
          put(r, cIdx.work, row.type === 'work' ? row.workMin : '', D);
          put(r, cIdx.late, row.lateMin != null ? row.lateMin : '', D);
          put(r, cIdx.absent, row.absent || '', D);
          const sFill = { short: 'FFFFCC', missing: 'FF8080', absent: 'FF8080' }[row.statusKind] || '';
          put(r, cIdx.status, row.status || '', st({ fill: sFill }));
        }
        rowsH[r] = { hpt: row.pairs?.some(x => x.outResult.startsWith('Leave Early') || x.inPlace.length > 34 || x.outPlace.length > 34) ? 57 : 28.5 };
        r++;
      }
      // Name and position span the person's days
      put(first, 0, p.name, DL); put(first, 1, p.position, DL);
      for (let rr = first + 1; rr < r; rr++) { put(rr, 0, '', DL); put(rr, 1, '', DL); }
      if (r - 1 > first) { merge(first, 0, r - 1, 0); merge(first, 1, r - 1, 1); }
      // Total line: black with yellow text, sums as formulas so edits in Excel add up
      const T = st({ font: 'Aptos Narrow', sz: 10, fill: '000000', color: 'FFFF00' });
      put(r, 0, 'Lates of minutes', T); put(r, 1, '', T); merge(r, 0, r, 1);
      fillRow(r, 2, last, T);
      const col = c => XLSX.utils.encode_col(c);
      const sum = (c, v) => put(r, c, v, T, { f: `SUM(${col(c)}${first + 1}:${col(c)}${r})` });
      sum(cIdx.work, p.totals.work); sum(cIdx.late, p.totals.late); sum(cIdx.absent, p.totals.absent);
      rowsH[r] = { hpt: 33 };
      r += 1;
    }
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r - 1, 3), c: last } });
  ws['!merges'] = merges;
  ws['!rows'] = rowsH;
  ws['!cols'] = [{ wch: 31 }, { wch: 34 }, { wch: 15.4 }, { wch: 16 }, ...Array.from({ length: S * W }, (_, i) => ({ wch: [10, 14, 34][i % 3] })), { wch: 13 }, { wch: 11 }, { wch: 9 }, { wch: 18 }];
  return ws;
}

export const generatedStamp = (ms = Date.now()) => { const d = myDate(ms); return `${dayKey(ms)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
