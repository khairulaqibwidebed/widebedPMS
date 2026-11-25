// lib/performance/oneToOne.js — the One To One Session form (12 Nov 2026).
// For each employee in a quarter: their details and, per Code of Honor (COH) question, the average mark they got from
// everyone who rated them. Only HR and Directors can read the marks (firestore.rules: cohEvaluations/{id}/private/scores),
// so this page is for them only.
//
// config/oneToOne   { venues: [string], lastVenue: string, updatedBy, updatedAt }   (rules Draft 0.62: HR and Directors)
// oneToOneForms/{quarterId}_{uid}   one person's saved form (25 Nov 2026, rules Draft 1.13: HR and Directors):
//   { quarterId, uid, date, venue, topic, staffName, position, ic, leave: { mc, unpaid, annual, other }, notes (see emptyNotes),
//     updatedBy, updatedByName, updatedAt }
// staffHR/{uid}.joinDate 'YYYY-MM-DD', from Staff accounts › HR details (18 Nov 2026; no longer typed on this page).
// users/{uid}.joinDate (the old field typed here) is read only until HR copies it across (HR details › Copy join dates).
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db, ROLE_LABEL } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { listParticipants } from './quarters.js';
import { listQuestions, listAllForQuarter, loadAssignment } from './coh.js';
import { ratersOf } from '@/lib/housekeeping.js';

export const COMPANY = '1 World Short Stay Sdn Bhd';
export const TOPIC = 'Performance Evaluation / Confirmation';
export const DEFAULT_VENUES = ['183 Site Office'];
export const MAX_VENUES = 50;

// ---------- Pure helpers (tested in __tests__/oneToOne.test.js) ----------
const round = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp;
// An evaluation counts once it is sent in (submitted, or approved by HR / a Director) and its marks could be read.
export const isValid = e => (e.status === 'submitted' || e.status === 'approved') && Array.isArray(e.ratings);

// One line per question, in the quarter's order: the average of the marks this person got for it (1 decimal),
// null when nobody has answered it yet. `average` = the average of those question averages (2 decimals).
export function cohAverages(questions, evaluations) {
  const valid = evaluations.filter(isValid);
  const lines = questions.map(q => {
    const marks = valid.flatMap(e => e.ratings.filter(r => r.questionId === q.id && Number.isFinite(Number(r.score))).map(r => Number(r.score)));
    return { id: q.id, title: q.title, count: marks.length, average: marks.length ? round(marks.reduce((s, m) => s + m, 0) / marks.length, 1) : null, exact: marks.length ? marks.reduce((s, m) => s + m, 0) / marks.length : null };
  });
  const have = lines.filter(l => l.exact != null);
  return { lines: lines.map(({ exact, ...l }) => l), raters: valid.length, average: have.length ? round(have.reduce((s, l) => s + l.exact, 0) / have.length, 2) : null };
}

// The staff list of a quarter: every active participant, with how many colleagues have rated them out of those who
// should (the other active participants; for housekeeping pairs, only the ones HR assigned: pairs, 17 Nov 2026).
// 19 Nov 2026: interns (people[uid].intern) and General (general) are assigned too.
export function sessionRows(participants, evaluations, people = {}, pairs = null, general = []) {
  const active = participants.filter(p => p.participationStatus === 'active');
  const uids = active.map(p => p.employeeId), roleOf = uid => people[uid]?.role || active.find(p => p.employeeId === uid)?.role || '';
  return active.map(p => {
    const expected = pairs ? ratersOf(p.employeeId, uids, roleOf, pairs, uid => people[uid]?.intern === true || general.includes(uid)).length : Math.max(0, active.length - 1);
    const mine = evaluations.filter(e => e.evaluateeId === p.employeeId);
    const done = mine.filter(isValid).length;
    const u = people[p.employeeId] || {};
    return { uid: p.employeeId, name: u.name || p.employeeName || 'Staff', role: u.role || p.role || '', position: u.position || '', joinDate: u.joinDate || '', ic: u.ic || '',
      done, expected, complete: expected > 0 && done >= expected, evaluations: mine };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// "2026-12-10" -> "10/12/26" (the way the form writes the date) and "03/02/2025" for the join date.
export const shortDate = key => (/^\d{4}-\d{2}-\d{2}$/.test(key || '') ? `${key.slice(8)}/${key.slice(5, 7)}/${key.slice(2, 4)}` : '');
export const longDate = key => (/^\d{4}-\d{2}-\d{2}$/.test(key || '') ? `${key.slice(8)}/${key.slice(5, 7)}/${key.slice(0, 4)}` : '');
// The venue list, tidied: trimmed, no empty ones, no repeats (case ignored), 80 characters each at most.
export function cleanVenues(list) {
  const seen = new Set(), out = [];
  for (const v of list || []) {
    const t = String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, 80), k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k); out.push(t);
  }
  return out.slice(0, MAX_VENUES);
}
// Leave taken this year (17 Nov 2026), typed in by HR for this form only (not saved anywhere).
export const LEAVE_TYPES = [{ key: 'mc', label: 'MC' }, { key: 'unpaid', label: 'Unpaid' }, { key: 'annual', label: 'Annual' }, { key: 'other', label: 'Others' }];
export const emptyLeave = () => Object.fromEntries(LEAVE_TYPES.map(t => [t.key, '']));
// "2.5" -> 2.5; empty, negative or not a number -> null (the cell is left blank). Half days are allowed.
export const leaveDays = v => { const t = String(v ?? '').trim(); if (!t) return null; const n = Number(t); return Number.isFinite(n) && n >= 0 && n <= 366 ? Math.round(n * 2) / 2 : null; };
// For the form: each type as text ('' when blank) and the total ('' when nothing was typed).
export function leaveSummary(leave = {}) {
  const days = LEAVE_TYPES.map(t => leaveDays(leave[t.key]));
  const fmt = n => (n == null ? '' : String(n));
  const typed = days.filter(n => n != null);
  return { cells: LEAVE_TYPES.map((t, k) => ({ label: t.label, days: fmt(days[k]) })), total: typed.length ? fmt(typed.reduce((a, n) => a + n, 0)) : '' };
}

// The downloaded file's name, as HR names them: "One To One - Aina Sofea (Q4 2026).pdf"
export const fileName = (staffName, quarterName) => `One To One - ${String(staffName || 'Staff').replace(/[\\/:*?"<>|]+/g, ' ').trim()} (${String(quarterName || '').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Quarter'}).pdf`;
// Everything the PDF needs for one person. Filled in from the records; `edits` ({ staffName, position, ic, topic, leave }) are what
// HR typed over them on the page for this form (an empty or missing one keeps the record's value; the topic's default is TOPIC).
export function formData({ row, questions, date, venue, edits = {} }) {
  const coh = cohAverages(questions, row.evaluations);
  const typed = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, 120) : fallback);
  return { company: COMPANY, topic: typed(edits.topic, TOPIC), date: shortDate(date), venue: String(venue || '').trim(), staffName: typed(edits.staffName, row.name),
    joinDate: longDate(row.joinDate), position: typed(edits.position, row.position), ic: typed(edits.ic, row.ic || ''),
    leaveYear: /^\d{4}/.test(date || '') ? String(date).slice(0, 4) : '', leaveUntil: longDate(date), leave: leaveSummary(edits.leave),
    notes: cleanNotes(edits.notes, typed(edits.staffName, row.name)),
    questions: coh.lines.map(l => ({ title: l.title, mark: l.average == null ? '' : l.average.toFixed(1) })), average: coh.average == null ? '' : coh.average.toFixed(2),
    raters: coh.raters, expected: row.expected };
}

// ---------- The write-in boxes (25 Nov 2026) ----------
// Everything left empty on HR's template, typed on the page and printed on the PDF.
export const BEHAVIOURS = [{ key: 'positive', label: 'Positive' }, { key: 'passionate', label: 'Passionate' }, { key: 'accountability', label: 'Accountability' }];
export const ACTIONS = [{ key: 'confirmation', label: 'Confirmation' }, { key: 'extend', label: 'Extend' }, { key: 'training', label: 'Need Training' }, { key: 'other', label: 'Other' }];
const TEXT_KEYS = { selfRating: 4, superiorRating: 4, workingInd: 1500, notWorkingInd: 1500, workingCo: 1500, notWorkingCo: 1500, otherAction: 80,
  recommendation: 120, ifYes: 200, quarterlyReview: 1500, attendedBy: 120, acknowledgedBy: 120 };
export const emptyNotes = (staffName = '') => ({
  selfRating: '', superiorRating: '', workingInd: '', notWorkingInd: '', workingCo: '', notWorkingCo: '',
  behaviour: Object.fromEntries(BEHAVIOURS.map(b => [b.key, { self: '', superior: '', remark: '' }])),
  actions: Object.fromEntries(ACTIONS.map(a => [a.key, false])), otherAction: '',
  recommendation: 'N/A', ifYes: '', quarterlyReview: '', attendedBy: staffName, acknowledgedBy: ''
});
const str = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').slice(0, max);
// Tidied to the shape above (unknown keys dropped, text cut to its length). `staffName` fills Attended by when it was never set.
export function cleanNotes(n = {}, staffName = '') {
  const out = emptyNotes(staffName);
  for (const [k, max] of Object.entries(TEXT_KEYS)) if (n?.[k] != null) out[k] = str(n[k], max);
  for (const b of BEHAVIOURS) {
    const v = n?.behaviour?.[b.key] || {};
    out.behaviour[b.key] = { self: str(v.self ?? '', 2), superior: str(v.superior ?? '', 2), remark: str(v.remark ?? '', 200) };
  }
  for (const a of ACTIONS) out.actions[a.key] = n?.actions?.[a.key] === true;
  return out;
}
// How many of the write-in boxes have something in them (shown next to "Write-in boxes" while it is closed).
export function notesFilled(n = {}) {
  const c = cleanNotes(n);
  let k = ['selfRating', 'superiorRating', 'workingInd', 'notWorkingInd', 'workingCo', 'notWorkingCo', 'ifYes', 'quarterlyReview', 'acknowledgedBy', 'otherAction'].filter(x => c[x].trim()).length;
  for (const b of BEHAVIOURS) k += ['self', 'superior', 'remark'].filter(x => c.behaviour[b.key][x].trim()).length;
  return k + ACTIONS.filter(a => c.actions[a.key]).length;
}
// What one person's form saves (oneToOneForms): the page's state, tidied.
export function formRecord({ quarterId, uid, date, venue, topic, edit }) {
  const leave = Object.fromEntries(LEAVE_TYPES.map(t => [t.key, str(edit?.leave?.[t.key] ?? '', 6)]));
  return { quarterId, uid, date: /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : '', venue: str(venue, 80).trim(), topic: str(topic, 120),
    staffName: str(edit?.staffName, 120), position: str(edit?.position, 120), ic: str(edit?.ic, 40), leave, notes: cleanNotes(edit?.notes, edit?.staffName || '') };
}

// ---------- Firestore ----------
// Saved forms of a quarter, by person: { uid: record }. Throws when the rules (Draft 1.13) aren't deployed yet.
export async function loadForms(quarterId) {
  const snap = await getDocs(query(collection(db, 'oneToOneForms'), where('quarterId', '==', quarterId)));
  return Object.fromEntries(snap.docs.map(d => [d.data().uid, d.data()]));
}
export async function saveForm(rec) {
  const s = useSession();
  const data = { ...formRecord(rec), updatedBy: s.user.uid, updatedByName: String(s.name || '').slice(0, 120), updatedAt: serverTimestamp() };
  await setDoc(doc(db, 'oneToOneForms', `${data.quarterId}_${data.uid}`), data);
  return { ...data, updatedAt: new Date() };
}

// Join date (18 Nov 2026): HR details first, then the old One To One field until it is copied across.
const isKey = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
export const joinOf = (u = {}, hr) => (isKey(hr?.joinDate) ? hr.joinDate : isKey(u.joinDate) ? u.joinDate : '');
const positionOf = (u, hr) => String(hr?.position || '').trim() || `${ROLE_LABEL[u.role] || u.role || ''}${u.intern ? ' Intern' : ''}`.trim();

// Everything the page shows for a quarter: its questions and one row per active participant.
export async function loadSession(quarterId) {
  const [participants, questions, evaluations, usersSnap, { pairs, general }] = await Promise.all([
    listParticipants(quarterId), listQuestions(quarterId), listAllForQuarter(quarterId), getDocs(collection(db, 'users')), loadAssignment(quarterId)]);
  const users = Object.fromEntries(usersSnap.docs.map(d => [d.id, d.data()]));
  // Positions HR saved (staffHR). Not everyone who opens this page may read them: then the role name is used.
  let hr = {};
  try { hr = Object.fromEntries((await getDocs(collection(db, 'staffHR'))).docs.map(d => [d.id, d.data()])); } catch (_) { hr = {}; }
  const people = {};
  for (const [uid, u] of Object.entries(users)) people[uid] = { name: u.displayName || u.email || '', role: u.role || '', position: positionOf(u, hr[uid]), joinDate: joinOf(u, hr[uid]), intern: u.intern === true,
    ic: String(hr[uid]?.ic || '').trim() };   // IC from Staff accounts › HR details (17 Nov 2026)
  return { questions, rows: sessionRows(participants, evaluations, people, pairs, general), unreadable: evaluations.filter(e => (e.status === 'submitted' || e.status === 'approved') && !Array.isArray(e.ratings)).length };
}


// Venues HR has used before, and the one picked last time. Falls back to the default list until one is saved
// (or when the rules for config/oneToOne aren't deployed yet).
export async function loadVenues() {
  try {
    const s = await getDoc(doc(db, 'config', 'oneToOne'));
    const d = s.exists() ? s.data() : {};
    const venues = cleanVenues(d.venues);
    return { venues: venues.length ? venues : [...DEFAULT_VENUES], lastVenue: d.lastVenue || '' };
  } catch (_) { return { venues: [...DEFAULT_VENUES], lastVenue: '' }; }
}
export async function saveVenues(venues, lastVenue) {
  const list = cleanVenues(venues);
  await setDoc(doc(db, 'config', 'oneToOne'), { venues: list, lastVenue: list.includes(lastVenue) ? lastVenue : '', updatedBy: useSession().user.uid, updatedAt: serverTimestamp() });
  return list;
}
