// HR > SOPs (6 Nov 2026): one page lists every SOP; each opens at /HR/sops/<key>. HR (sops Edit tick) and Directors
// edit, add documents and make new SOPs; everyone reads. All Firestore reads and writes for SOPs live here.
//
// sops/{key}: { title, sub, icon, stepsTitle, steps: [..], docs: [{ name, on, by, fileId, url }], log: [{ what, when }],
//               updatedAt, updatedBy, updatedByUid }
// The first four (attendance, advance, allowance, socso) show the starter text in sops.js until HR saves them once;
// they may have no title saved yet, so the title then comes from sops.js. New SOPs always save their own title.
import { collection, doc, getDoc, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { audit } from '@/lib/finance-data.js';
import { SOPS } from './sops.js';

export const fmt = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const today = () => fmt(new Date());
const LOG_MAX = 20;
export const TITLE_MAX = 80;
export const SUB_MAX = 200;

// Icons HR can pick for an SOP (names from NavIcons.js). The first four start with their old sidebar icons.
export const SOP_ICONS = ['fileText', 'clipboard', 'listChecks', 'clock', 'calendar', 'wallet', 'coins', 'gift', 'receipt', 'shieldCheck',
  'badgeCheck', 'home', 'building', 'users', 'briefcase', 'key', 'package', 'sparkle', 'megaphone', 'alert'];
const STARTER_ICON = { attendance: 'clock', advance: 'wallet', allowance: 'gift', socso: 'shieldCheck' };
const iconFor = (key, icon) => SOP_ICONS.includes(icon) ? icon : (STARTER_ICON[key] || 'fileText');

function starter(key) {
  const c = SOPS[key];
  return { key, title: c.title, sub: c.sub, icon: iconFor(key), stepsTitle: c.stepsTitle, steps: [...c.steps],
    docs: c.docs.map(([name, on]) => ({ name, on, by: 'HR' })), log: [], editedBy: '', editedOn: '', saved: false };
}
function fromDoc(key, d) {
  const c = SOPS[key];
  return { key, title: d.title || c?.title || key, sub: d.sub ?? c?.sub ?? '', icon: iconFor(key, d.icon), stepsTitle: d.stepsTitle || c?.stepsTitle || 'Steps to follow',
    steps: d.steps || [], docs: d.docs || [], log: d.log || [], editedBy: d.updatedBy || '',
    editedOn: d.updatedAt?.toDate ? fmt(d.updatedAt.toDate()) : '', saved: true };
}

// Every SOP, by title: the saved ones plus any of the first four not saved yet. Deleted SOPs are left out
// (a deleted one of the first four stays deleted: its saved record says so, so the starter text doesn't come back).
export async function listSops() {
  const snap = await getDocs(collection(db, 'sops'));
  const byKey = {}, gone = new Set();
  for (const d of snap.docs) { if (d.data().deleted) gone.add(d.id); else byKey[d.id] = fromDoc(d.id, d.data()); }
  for (const k of Object.keys(SOPS)) if (!byKey[k] && !gone.has(k)) byKey[k] = starter(k);
  return Object.values(byKey).sort((a, b) => a.title.localeCompare(b.title));
}

// One SOP, or null if there is no such SOP (or it was deleted).
export async function loadSop(key) {
  const s = await getDoc(doc(db, 'sops', key));
  if (s.exists()) return s.data().deleted ? null : fromDoc(key, s.data());
  return SOPS[key] ? starter(key) : null;
}

// Delete (6 Nov 2026): HR and Directors, with a reason. Like tickets, nothing is really removed: the SOP is marked
// deleted and leaves the list, and the Audit Log keeps who and why. Its documents stay in Google Drive.
export async function deleteSop(me, sop, reason) {
  const why = String(reason || '').trim();
  if (!why) throw new Error('Give a reason for deleting the SOP.');
  const batch = writeBatch(db);
  batch.set(doc(db, 'sops', sop.key), { title: sop.title, sub: sop.sub, icon: sop.icon, stepsTitle: sop.stepsTitle, steps: sop.steps.length ? sop.steps : ['(deleted)'],
    docs: sop.docs, log: [{ what: `Deleted · ${me.name}: ${why}`, when: today() }, ...sop.log].slice(0, LOG_MAX),
    deleted: true, deletedAt: serverTimestamp(), deletedBy: me.name, deleteReason: why,
    updatedAt: serverTimestamp(), updatedBy: me.name, updatedByUid: me.user.uid });
  audit(batch, me, { action: 'sop.delete', entity: `sops/${sop.key}`, changes: [{ field: 'sop', old: sop.title, new: null }], reason: why });
  await batch.commit();
}

// Writes the whole SOP with a change-log line and an audit entry. Returns the SOP as saved. next: { steps, docs, icon? }.
export async function saveSop(me, sop, what, action, next, reason = '') {
  const log = [{ what: `${what} · ${me.name}`, when: today() }, ...sop.log].slice(0, LOG_MAX);
  const batch = writeBatch(db);
  const icon = iconFor(sop.key, next.icon || sop.icon);
  batch.set(doc(db, 'sops', sop.key), { title: sop.title, sub: sop.sub, icon, stepsTitle: sop.stepsTitle, steps: next.steps, docs: next.docs, log,
    updatedAt: serverTimestamp(), updatedBy: me.name, updatedByUid: me.user.uid });
  audit(batch, me, { action, entity: `sops/${sop.key}`, changes: [{ field: 'sop', old: null, new: what }], reason });
  await batch.commit();
  return { ...sop, ...next, icon, log, editedBy: me.name, editedOn: today(), saved: true };
}

// "Attendance SOP" -> "attendance-sop": the SOP's address. Lower case, digits and dashes (rules check the same).
const slugOf = title => title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36);

// New SOP: a title, a short line and one placeholder step (the rules need at least one); HR then edits the steps.
export async function createSop(me, { title, sub, icon }, takenKeys) {
  const t = String(title || '').trim(), s = String(sub || '').trim();
  if (!t) throw new Error('Give the SOP a title.');
  if (t.length > TITLE_MAX) throw new Error(`Keep the title to ${TITLE_MAX} characters.`);
  if (s.length > SUB_MAX) throw new Error(`Keep the short line to ${SUB_MAX} characters.`);
  let base = slugOf(t); if (base.length < 2) base = `sop-${base || 'new'}`;
  let key = base, n = 2;
  while (takenKeys.has(key) || (await getDoc(doc(db, 'sops', key))).exists()) key = `${base}-${n++}`;
  const sop = { key, title: t, sub: s, icon: iconFor(key, icon), stepsTitle: 'Steps to follow', steps: [], docs: [], log: [], editedBy: '', editedOn: '', saved: false };
  return saveSop(me, sop, `Made the SOP "${t}"`, 'sop.create', { steps: ['Write the first step here.'], docs: [] });
}
