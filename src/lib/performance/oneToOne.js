// lib/performance/oneToOne.js — the One To One Session form (12 Nov 2026).
// For each employee in a quarter: their details and, per Code of Honor (COH) question, the average mark they got from
// everyone who rated them. Only HR and Directors can read the marks (firestore.rules: cohEvaluations/{id}/private/scores),
// so this page is for them only.
//
// config/oneToOne   { venues: [string], lastVenue: string, updatedBy, updatedAt }   (rules Draft 0.62: HR and Directors)
// users/{uid}.joinDate   'YYYY-MM-DD', entered once on this page (HR can't set their own or a Director's: users rules)
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, ROLE_LABEL } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';
import { listParticipants } from './quarters.js';
import { listQuestions, listAllForQuarter } from './coh.js';

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
// should (the other active participants).
export function sessionRows(participants, evaluations, people = {}) {
  const active = participants.filter(p => p.participationStatus === 'active');
  const expected = Math.max(0, active.length - 1);
  return active.map(p => {
    const mine = evaluations.filter(e => e.evaluateeId === p.employeeId);
    const done = mine.filter(isValid).length;
    const u = people[p.employeeId] || {};
    return { uid: p.employeeId, name: u.name || p.employeeName || 'Staff', role: u.role || p.role || '', position: u.position || '', joinDate: u.joinDate || '',
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
// The downloaded file's name, as HR names them: "One To One - Aina Sofea (Q4 2026).pdf"
export const fileName = (staffName, quarterName) => `One To One - ${String(staffName || 'Staff').replace(/[\\/:*?"<>|]+/g, ' ').trim()} (${String(quarterName || '').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Quarter'}).pdf`;
// Everything the PDF needs for one person. Filled in from the records; `edits` ({ staffName, position, topic }) are what
// HR typed over them on the page for this form (an empty or missing one keeps the record's value; the topic's default is TOPIC).
export function formData({ row, questions, date, venue, edits = {} }) {
  const coh = cohAverages(questions, row.evaluations);
  const typed = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, 120) : fallback);
  return { company: COMPANY, topic: typed(edits.topic, TOPIC), date: shortDate(date), venue: String(venue || '').trim(), staffName: typed(edits.staffName, row.name),
    joinDate: longDate(row.joinDate), position: typed(edits.position, row.position),
    questions: coh.lines.map(l => ({ title: l.title, mark: l.average == null ? '' : l.average.toFixed(1) })), average: coh.average == null ? '' : coh.average.toFixed(2),
    raters: coh.raters, expected: row.expected };
}

// ---------- Firestore ----------
const positionOf = (u, hr) => String(hr?.position || '').trim() || `${ROLE_LABEL[u.role] || u.role || ''}${u.intern ? ' Intern' : ''}`.trim();

// Everything the page shows for a quarter: its questions and one row per active participant.
export async function loadSession(quarterId) {
  const [participants, questions, evaluations, usersSnap] = await Promise.all([
    listParticipants(quarterId), listQuestions(quarterId), listAllForQuarter(quarterId), getDocs(collection(db, 'users'))]);
  const users = Object.fromEntries(usersSnap.docs.map(d => [d.id, d.data()]));
  // Positions HR saved (staffHR). Not everyone who opens this page may read them: then the role name is used.
  let hr = {};
  try { hr = Object.fromEntries((await getDocs(collection(db, 'staffHR'))).docs.map(d => [d.id, d.data()])); } catch (_) { hr = {}; }
  const people = {};
  for (const [uid, u] of Object.entries(users)) people[uid] = { name: u.displayName || u.email || '', role: u.role || '', position: positionOf(u, hr[uid]), joinDate: u.joinDate || '' };
  return { questions, rows: sessionRows(participants, evaluations, people), unreadable: evaluations.filter(e => (e.status === 'submitted' || e.status === 'approved') && !Array.isArray(e.ratings)).length };
}

export async function saveJoinDate(uid, date) {
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Pick a date.');
  await updateDoc(doc(db, 'users', uid), { joinDate: date || '' });
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
