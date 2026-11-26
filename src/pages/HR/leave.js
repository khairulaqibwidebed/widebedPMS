// Leave and MC (26 Nov 2026, Crane). The same data as the Widebed Staff Attendance app 1.5.0; do not rename or reshape it.
//   attendanceLeave/{auto id}         one request (rules Draft 1.14): { uid, name, department, type, from, to, halfDay, days,
//                                      note, status, byHR, resolvedBy, resolvedByName, resolvedAt, resolveNote, createdAt, updatedAt }
//   leaveEntitlements/{uid}_{year}    the days HR gives one person for one year (rules Draft 1.15): { uid, year, days: { annual,
//                                      mc, emergency, unpaid, other }, note, updatedBy, updatedByName, updatedAt }. A type left out = no limit.
//   config/attendance.leaveEnabled    false hides leave in the app (missing = on).
// Counting (must match the app): working days = config/attendance.workDays that are not a public holiday for that person
// (attendanceHolidays exceptUids). Half day = 0.5. A request's days are worked out when saved and kept. The balance of a type
// in a year = days given minus the approved requests of that type whose first day is in that year; waiting = the same for
// pending. Going over is allowed (a warning only): HR decides.
//   config/leaveTypes                 (26 Nov 2026, rules Draft 1.16) HR's own leave types next to the five built-in ones:
//                                      { types: [{ key, label, active, builtIn }], typeKeys: [every custom key ever saved],
//                                      updatedBy, updatedByName, updatedAt }. A type is never deleted once saved, only turned off
//                                      (old requests keep their type). The built-in five can be renamed or turned off, never removed.
// Pages: HR > Leave (Leave.vue, HR / Directors / Branch Directors) and HR > My Leave (MyLeave.vue, everyone).
import { db, ROLE_LABEL } from '@/lib/firebase.js';
import { collection, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { audit } from '@/lib/finance-data.js';
import { notifyUser, notifyRole } from '@/services/notificationService.js';
import { DEFAULT_CFG, weekday, daysBetween, holidayFor } from './attendance.js';

// The five the attendance app 1.5.0 knows. KEEP IN STEP WITH builtInLeaveTypes() in firestore.rules.
export const LEAVE_TYPES = Object.freeze([
  { key: 'annual', label: 'Annual' }, { key: 'mc', label: 'Medical (MC)' }, { key: 'emergency', label: 'Emergency' },
  { key: 'unpaid', label: 'Unpaid' }, { key: 'other', label: 'Other' }
]);
export const BUILT_IN_KEYS = LEAVE_TYPES.map(t => t.key);
export const MAX_TYPES = 30;

// ---------- Leave types (the built-in five + HR's own) ----------
// The list in use on this page, set by loadLeaveTypes() (or setLeaveTypes in tests). Every helper below reads it.
let registry = LEAVE_TYPES.map(t => ({ ...t, active: true, builtIn: true }));
export const allTypes = () => registry;                          // every type, turned-off ones too (old requests, balances)
export const activeTypes = () => registry.filter(t => t.active);  // the ones people can pick for new leave
export const typeLabel = key => registry.find(t => t.key === key)?.label || (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'Leave');
// Saved list -> the list in use: built-ins always there (in their order, first), then HR's own in their saved order.
export function mergeTypes(saved) {
  const list = Array.isArray(saved) ? saved : [];
  const byKey = new Map(list.filter(t => t && typeof t.key === 'string').map(t => [t.key, t]));
  const out = LEAVE_TYPES.map(t => {
    const x = byKey.get(t.key);
    return { key: t.key, label: String(x?.label || t.label).slice(0, 40), active: x ? x.active !== false : true, builtIn: true };
  });
  for (const t of list) {
    if (!t || BUILT_IN_KEYS.includes(t.key) || !/^[a-z][a-z0-9_]{1,29}$/.test(t.key || '') || out.some(o => o.key === t.key)) continue;
    out.push({ key: t.key, label: String(t.label || t.key).slice(0, 40), active: t.active !== false, builtIn: false });
  }
  return out;
}
export function setLeaveTypes(saved) { registry = mergeTypes(saved); return registry; }
// "Maternity leave" -> 'maternity_leave' (unique among [taken]); letters, digits and _ only, 2 to 30 long.
export function keyFor(label, taken = []) {
  let base = String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[0-9_]+/, '').slice(0, 26) || 'type';
  if (base.length < 2) base = `${base}_x`;
  let key = base, n = 2;
  while (taken.includes(key)) key = `${base}_${n++}`;
  return key;
}
// HR's list as typed -> what is saved, or { error }. Labels 1 to 40, no two the same.
export function cleanTypes(list) {
  const out = [], seen = new Set();
  for (const t of list || []) {
    const label = String(t.label || '').trim().slice(0, 40);
    if (!label) return { error: 'Give every leave type a name.' };
    if (seen.has(label.toLowerCase())) return { error: `Two leave types are called "${label}".` };
    seen.add(label.toLowerCase());
    out.push({ key: t.key, label, active: t.active !== false, builtIn: BUILT_IN_KEYS.includes(t.key) });
  }
  if (out.length > MAX_TYPES) return { error: `${MAX_TYPES} leave types at most.` };
  if (!out.some(t => t.active)) return { error: 'Keep at least one leave type on.' };
  return { types: mergeTypes(out) };
}
export const STATUS = {
  pending: { label: 'Waiting', pill: 'amber' }, approved: { label: 'Approved', pill: 'green' }, declined: { label: 'Declined', pill: 'red' },
  withdrawn: { label: 'Withdrawn', pill: 'grey' }, cancelled: { label: 'Cancelled', pill: 'grey' }
};
// Where the notifications point. The attendance app's link (AppConstants.pmsAttendanceLink) should be LEAVE_LINK_HR.
export const LEAVE_LINK_HR = '/HR/leave';
export const LEAVE_LINK_STAFF = '/HR/my-leave';
export const MAX_DAYS = 60;

const r2 = n => Math.round(n * 100) / 100;
export const daysText = n => `${r2(n)} day${n === 1 ? '' : 's'}`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dateText = k => { if (!k) return ''; const [y, m, d] = k.split('-'); return `${+d} ${MON[+m - 1]} ${y}`; };
export const rangeText = r => (r.from === r.to ? `${dateText(r.from)}${r.halfDay ? ' (half day)' : ''}` : `${dateText(r.from)} – ${dateText(r.to)}`);
export const leaveEnabled = cfg => cfg?.leaveEnabled !== false;

// ---------- Counting ----------
// Working days between two dates (both included) for one person. Half day (one day only) = 0.5.
export function workingDays({ from, to, halfDay = false, cfg, holidays, uid }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || to < from) return 0;
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 400) return MAX_DAYS + 1;   // far too long anyway; don't walk it
  const wd = new Set(cfg?.workDays || DEFAULT_CFG.workDays);
  const n = daysBetween(from, to).filter(d => wd.has(weekday(d)) && !holidayFor(holidays, d, uid)).length;
  return halfDay && from === to ? (n ? 0.5 : 0) : n;
}

// What is wrong with a request, in words a person can act on ('' = fine). Same limits as the rules.
export function checkRequest({ type, from, to, halfDay, note, days }) {
  if (!activeTypes().some(t => t.key === type)) return 'Pick the type of leave.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '')) return 'Pick the first day.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to || '')) return 'Pick the last day.';
  if (to < from) return 'The last day is before the first day.';
  if (halfDay && from !== to) return 'A half day is for one day only.';
  if (!(days >= 0.5)) return 'These dates have no working days (rest days and public holidays don\'t count).';
  if (days > MAX_DAYS) return `${MAX_DAYS} working days at most in one request. Split it into two.`;
  if (String(note || '').length > 300) return 'The note is 300 characters at most.';
  return '';
}

// One person's balance per type for a year. given null = no limit. Only requests whose FIRST day is in that year count.
export function balanceFor(ent, requests, uid, year) {
  const days = ent?.days || {};
  const y = String(year);
  const mine = requests.filter(r => r.uid === uid && String(r.from || '').slice(0, 4) === y);
  const sum = (type, status) => r2(mine.filter(r => r.type === type && r.status === status).reduce((t, r) => t + (Number(r.days) || 0), 0));
  return allTypes().map(t => {
    const given = typeof days[t.key] === 'number' ? days[t.key] : null;
    const used = sum(t.key, 'approved'), waiting = sum(t.key, 'pending');
    return { ...t, given, used, waiting, left: given == null ? null : r2(given - used) };
  });
}
// "3 left of 14", or a warning when [days] is more than what is left (null = no limit set).
export function overBy(balance, type, days) {
  const b = balance.find(x => x.key === type);
  if (!b || b.left == null) return 0;
  return r2(Math.max(0, days - (b.left - b.waiting)));
}

// HR's typed numbers -> the days map for saving. '' = no limit (left out). 0 to 365, halves allowed.
export function cleanDays(input) {
  const days = {};
  for (const t of allTypes()) {
    const raw = input?.[t.key];
    if (raw === '' || raw == null) continue;
    const n = Number(String(raw).trim());
    if (!Number.isFinite(n) || n < 0 || n > 365) return { error: `${t.label}: a number from 0 to 365.` };
    if (Math.round(n * 2) !== n * 2) return { error: `${t.label}: whole or half days only (12 or 12.5).` };
    days[t.key] = n;
  }
  return { days };
}
// The other way, for the input boxes.
export const daysInput = d => Object.fromEntries(allTypes().map(t => [t.key, typeof d?.[t.key] === 'number' ? String(d[t.key]) : '']));

// Approved leave by person and day, for the Attendance page: Map('{uid}_{YYYY-MM-DD}' -> { type, label, half, id }).
export function leaveByDay(requests) {
  const m = new Map();
  for (const r of requests) {
    if (r.status !== 'approved' || !r.from || !r.to || r.to < r.from) continue;
    for (const d of daysBetween(r.from, r.to)) m.set(`${r.uid}_${d}`, { type: r.type, label: typeLabel(r.type), half: !!r.halfDay, id: r.id });
  }
  return m;
}

// Requests sorted for HR: Waiting first (oldest first, so nobody waits longest), then the rest by first day, newest first.
export function sortForHR(list) {
  return [...list].sort((a, b) => (a.status === 'pending') === (b.status === 'pending')
    ? (a.status === 'pending' ? a.from.localeCompare(b.from) : b.from.localeCompare(a.from))
    : a.status === 'pending' ? -1 : 1);
}

// ---------- Reading ----------
// config/leaveTypes -> the list in use (the built-in five when nothing is saved, or it can't be read).
export async function loadLeaveTypes() {
  try {
    const s = await getDoc(doc(db, 'config', 'leaveTypes'));
    return setLeaveTypes(s.exists() ? s.data().types : null);
  } catch (_) { return setLeaveTypes(null); }
}
export async function saveLeaveTypes(list, me) {
  const { types, error } = cleanTypes(list);
  if (error) throw new Error(error);
  const prev = await getDoc(doc(db, 'config', 'leaveTypes'));
  const kept = prev.exists() && Array.isArray(prev.data().typeKeys) ? prev.data().typeKeys : [];
  // typeKeys: every custom key ever saved (never shrinks, so leave saved under a type that is now off stays valid)
  const typeKeys = [...new Set([...kept, ...types.filter(t => !t.builtIn).map(t => t.key)])];
  const b = writeBatch(db);
  b.set(doc(db, 'config', 'leaveTypes'), { types, typeKeys, updatedBy: me.user.uid, updatedByName: meName(me), updatedAt: serverTimestamp() });
  audit(b, me, { action: 'leave.types', entity: 'config/leaveTypes',
    changes: [{ field: 'leave types', to: types.map(t => `${t.label}${t.active ? '' : ' (off)'}`).join(', ') }] });
  await b.commit();
  return setLeaveTypes(types);
}
const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
// Everything HR needs for a year: every request that runs into the year (balances and the month filter), plus every
// request still waiting (whatever its dates). Two single-field queries: no new index.
export async function loadLeaveForYear(year) {
  const [a, b] = await Promise.all([
    getDocs(query(collection(db, 'attendanceLeave'), where('to', '>=', `${year}-01-01`))),
    getDocs(query(collection(db, 'attendanceLeave'), where('status', '==', 'pending')))
  ]);
  const m = new Map([...rows(a), ...rows(b)].map(r => [r.id, r]));
  return [...m.values()].filter(r => r.from <= `${year}-12-31` || r.status === 'pending');
}
// Approved leave touching [from, to] (the Attendance page).
export async function loadLeaveBetween(from, to) {
  const snap = await getDocs(query(collection(db, 'attendanceLeave'), where('to', '>=', from)));
  return rows(snap).filter(r => r.status === 'approved' && r.from <= to);
}
export async function loadMyLeave(uid) {
  return rows(await getDocs(query(collection(db, 'attendanceLeave'), where('uid', '==', uid))))
    .sort((a, b) => b.from.localeCompare(a.from));
}
// { uid: entitlement } for a year
export async function loadEntitlements(year) {
  const snap = await getDocs(query(collection(db, 'leaveEntitlements'), where('year', '==', Number(year))));
  return Object.fromEntries(rows(snap).map(e => [e.uid, e]));
}
export async function loadMyEntitlement(uid, year) {
  const s = await getDoc(doc(db, 'leaveEntitlements', `${uid}_${year}`));
  return s.exists() ? s.data() : null;
}

// ---------- Staff: apply and withdraw ----------
const meName = me => String(me.name || me.user?.displayName || me.user?.email || 'Staff').slice(0, 120);
const deptOf = role => String(ROLE_LABEL[role] || role || '').slice(0, 120);

export async function applyLeave({ me, type, from, to, halfDay, note, days }) {
  const err = checkRequest({ type, from, to, halfDay, note, days });
  if (err) throw new Error(err);
  const ref = doc(collection(db, 'attendanceLeave'));
  const data = {
    uid: me.user.uid, name: meName(me), department: deptOf(me.role), type, from, to, halfDay: !!halfDay && from === to,
    days, note: String(note || '').trim(), status: 'pending', byHR: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  };
  const b = writeBatch(db);
  b.set(ref, data);
  audit(b, me, { action: 'leave.apply', entity: `attendanceLeave/${ref.id}`, changes: [{ field: 'leave', to: `${typeLabel(type)} · ${rangeText(data)} · ${daysText(days)}` }] });
  await b.commit();
  // Best effort: the request is saved even if a notification fails.
  const message = `${data.name} asked for ${typeLabel(type)} leave: ${rangeText(data)} (${daysText(days)}).${data.note ? ` Note: ${data.note}` : ''}`;
  const tell = [notifyRole({ recipientRole: 'hr', title: 'Leave request', message, type: 'attendance', link: LEAVE_LINK_HR, refId: ref.id })];
  // Nobody answers their own: when HR asks, the Directors are told too.
  if (me.role === 'hr') tell.push(notifyRole({ recipientRole: 'director', title: 'Leave request', message, type: 'attendance', link: LEAVE_LINK_HR, refId: ref.id }));
  await Promise.allSettled(tell);
  return ref.id;
}

export async function withdrawLeave(req, me) {
  if (req.uid !== me.user.uid || req.status !== 'pending') throw new Error('Only your own waiting request can be withdrawn.');
  const b = writeBatch(db);
  b.update(doc(db, 'attendanceLeave', req.id), { status: 'withdrawn', updatedAt: serverTimestamp() });
  audit(b, me, { action: 'leave.withdraw', entity: `attendanceLeave/${req.id}`, changes: [{ field: 'status', from: 'pending', to: 'withdrawn' }] });
  await b.commit();
}

// ---------- HR / Directors: answer, cancel, add ----------
const ANSWER = {
  approved: { from: 'pending', title: 'Your leave was approved' },
  declined: { from: 'pending', title: 'Your leave request was declined' },
  cancelled: { from: 'approved', title: 'Your leave was cancelled' }
};
export async function answerLeave(req, status, note, me) {
  const a = ANSWER[status];
  if (!a) throw new Error('Unknown answer.');
  if (req.uid === me.user.uid) throw new Error("You can't answer your own leave. Another HR person or a Director does.");
  if (req.status !== a.from) throw new Error('This request has changed. Reload the page.');
  const reason = String(note || '').trim();
  if (status !== 'approved' && reason.length < 3) throw new Error('Write the reason (at least 3 characters).');
  if (reason.length > 300) throw new Error('The reason is 300 characters at most.');
  const upd = { status, resolvedBy: me.user.uid, resolvedByName: meName(me), resolvedAt: serverTimestamp(), updatedAt: serverTimestamp() };
  if (reason) upd.resolveNote = reason;
  const b = writeBatch(db);
  b.update(doc(db, 'attendanceLeave', req.id), upd);
  audit(b, me, { action: `leave.${status}`, entity: `attendanceLeave/${req.id}`,
    changes: [{ field: 'status', from: req.status, to: status }, { field: 'leave', to: `${req.name} · ${typeLabel(req.type)} · ${rangeText(req)}` }], reason });
  await b.commit();
  await Promise.allSettled([notifyUser({ recipientUid: req.uid, title: a.title, type: 'attendance', link: LEAVE_LINK_STAFF, refId: req.id,
    message: `${typeLabel(req.type)} leave, ${rangeText(req)} (${daysText(req.days)}).${reason ? ` Reason: ${reason}` : ''}` })]);
}

// Leave HR adds for someone (saved approved at once, byHR). Not for yourself.
export async function addLeaveFor({ person, type, from, to, halfDay, note, days, me }) {
  if (!person?.uid) throw new Error('Pick the staff member.');
  if (person.uid === me.user.uid) throw new Error("You can't add leave for yourself. Ask another HR person or a Director.");
  const err = checkRequest({ type, from, to, halfDay, note, days });
  if (err) throw new Error(err);
  const ref = doc(collection(db, 'attendanceLeave'));
  const data = {
    uid: person.uid, name: String(person.name || '').slice(0, 120), department: deptOf(person.role), type, from, to,
    halfDay: !!halfDay && from === to, days, note: String(note || '').trim(), status: 'approved', byHR: true,
    resolvedBy: me.user.uid, resolvedByName: meName(me), resolvedAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  };
  const b = writeBatch(db);
  b.set(ref, data);
  audit(b, me, { action: 'leave.add', entity: `attendanceLeave/${ref.id}`, changes: [{ field: 'leave', to: `${data.name} · ${typeLabel(type)} · ${rangeText(data)} · ${daysText(days)}` }] });
  await b.commit();
  await Promise.allSettled([notifyUser({ recipientUid: person.uid, title: 'Leave added for you', type: 'attendance', link: LEAVE_LINK_STAFF, refId: ref.id,
    message: `${meName(me)} added ${typeLabel(type)} leave for you: ${rangeText(data)} (${daysText(days)}).${data.note ? ` Note: ${data.note}` : ''}` })]);
  return ref.id;
}

// ---------- HR / Directors: leave days ----------
// changes: [{ uid, name, days }] (days already cleaned). One batch of up to 200 people at a time, each with an audit line.
export async function saveEntitlements(changes, year, me) {
  const y = Number(year);
  if (!(y >= 2020 && y <= 2100)) throw new Error('Pick a year from 2020 to 2100.');
  if (changes.some(c => c.uid === me.user.uid)) throw new Error("You can't set your own leave days. Another HR person or a Director does.");
  for (let i = 0; i < changes.length; i += 200) {
    const b = writeBatch(db);
    for (const c of changes.slice(i, i + 200)) {
      b.set(doc(db, 'leaveEntitlements', `${c.uid}_${y}`), {
        uid: c.uid, year: y, days: c.days, ...(c.note ? { note: String(c.note).slice(0, 300) } : {}),
        updatedBy: me.user.uid, updatedByName: meName(me), updatedAt: serverTimestamp()
      });
    }
    audit(b, me, { action: 'leave.days', entity: `leaveEntitlements/${y}`,
      changes: changes.slice(i, i + 200).map(c => ({ field: c.name || c.uid, to: allTypes().filter(t => t.key in c.days).map(t => `${t.label} ${c.days[t.key]}`).join(', ') || 'no limits' })) });
    await b.commit();
  }
}

// Copy from last year: the boxes of people with nothing set this year are filled from last year (only in the draft; Save saves).
export function copyDraft(draft, lastYear, staff, savedThisYear) {
  let n = 0;
  const out = { ...draft };
  for (const s of staff) {
    const prev = lastYear[s.uid];
    const empty = allTypes().every(t => (out[s.uid]?.[t.key] ?? '') === '');
    if (!prev || !empty || savedThisYear[s.uid]) continue;
    out[s.uid] = daysInput(prev.days); n++;
  }
  return { draft: out, count: n };
}
// Set for everyone: one value for one type, filling only empty boxes (nobody's own number is overwritten).
export function fillDraft(draft, staff, type, value, skipUid) {
  let n = 0;
  const out = { ...draft };
  for (const s of staff) {
    if (s.uid === skipUid) continue;
    const row = { ...(out[s.uid] || daysInput({})) };
    if ((row[type] ?? '') !== '') continue;
    row[type] = String(value); out[s.uid] = row; n++;
  }
  return { draft: out, count: n };
}

// ---------- Start dates (Attendance: absent counts from each person's own start) ----------
// staffHR/{uid}.joinDate, else users/{uid}.joinDate, else their first clock-in. { uid: 'YYYY-MM-DD' }; '' = not known.
export function startDates(staff, hr, firstClockIns) {
  const ok = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
  return Object.fromEntries(staff.map(s => [s.uid, ok(hr?.[s.uid]?.joinDate) || ok(s.joinDate) || ok(firstClockIns?.[s.uid])]));
}
