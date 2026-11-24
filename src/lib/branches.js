// lib/branches.js (23 Nov 2026, Khairul): Settings > Branch Management.
// branches/{id}: { name, state, active, propertyIds: [propertyId], driveLink, sheetLink, links: [{ label, url }],
//   createdAt, createdBy, createdByName, updatedAt, updatedBy, updatedByName }
// A property is in one branch at most (the page moves it). Staff are set to branches on Settings > Staff accounts
// (users/{uid}.branches); their property access is still users/{uid}.properties, so the security rules are unchanged.
// Rules Draft 1.05: every staff member reads branches; Google Drive Folders Full (driveFolders.edit) writes them.
import { collection, doc, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { audit } from '@/lib/finance-data.js';
import { can } from '@/lib/access.js';

export const MAX_LINKS = 12;
export const canEditBranches = me => can(me, 'driveFolders.edit');
export const newBranchId = () => doc(collection(db, 'branches')).id;

let cache = null;
export async function loadBranches(fresh = false) {
  if (cache && !fresh) return cache;
  const snap = await getDocs(collection(db, 'branches'));
  cache = snap.docs.map(d => normBranch(d.id, d.data())).sort((a, b) => (a.active === b.active ? a.name.localeCompare(b.name) : a.active ? -1 : 1));
  return cache;
}
export const forgetBranches = () => { cache = null; };

export function normBranch(id, d = {}) {
  return {
    id, name: d.name || '', state: d.state || '', active: d.active !== false,
    propertyIds: Array.isArray(d.propertyIds) ? d.propertyIds.filter(Boolean) : [],
    driveLink: d.driveLink || '', sheetLink: d.sheetLink || '',
    links: Array.isArray(d.links) ? d.links.map(l => ({ label: l.label || '', url: l.url || '' })) : [],
    updatedByName: d.updatedByName || '', updatedAt: d.updatedAt || null
  };
}
// The branch a property is in ({ id, name } or null)
export const branchOfProperty = (branches, pid) => (branches || []).find(b => b.propertyIds.includes(pid)) || null;

const url = v => /^https?:\/\/\S+$/i.test(String(v || '').trim());
export function branchProblem(b, all) {
  const name = (b.name || '').trim();
  if (!name) return 'Give the branch a name.';
  if (name.length > 60) return 'The name is too long (60 characters at most).';
  if ((all || []).some(x => x.id !== b.id && x.name.trim().toLowerCase() === name.toLowerCase())) return `There is already a branch called ${name}.`;
  if (b.driveLink && !url(b.driveLink)) return 'The Google Drive link should start with https://';
  if (b.sheetLink && !url(b.sheetLink)) return 'The Google Sheet link should start with https://';
  if (b.links.length > MAX_LINKS) return `${MAX_LINKS} other links at most.`;
  for (const l of b.links) {
    if (!l.label.trim() && !l.url.trim()) continue;
    if (!l.label.trim()) return 'Give every other link a name.';
    if (!url(l.url)) return `The link "${l.label}" should start with https://`;
  }
  return '';
}

// Saves one branch. Properties picked here are taken out of any other branch in the same batch (one branch per property).
// hidden: property ids already on the branch that this person can't see; they stay on it.
export async function saveBranch(me, b, { all = [], isNew = false, hidden = [] } = {}) {
  const ids = [...new Set([...b.propertyIds, ...hidden])].sort();
  const data = {
    name: b.name.trim(), state: b.state || '', active: b.active !== false, propertyIds: ids,
    driveLink: (b.driveLink || '').trim(), sheetLink: (b.sheetLink || '').trim(),
    links: b.links.filter(l => l.label.trim() || l.url.trim()).map(l => ({ label: l.label.trim(), url: l.url.trim() })),
    updatedAt: serverTimestamp(), updatedBy: me.user.uid, updatedByName: me.name || ''
  };
  if (isNew) Object.assign(data, { createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name || '' });
  const batch = writeBatch(db), before = all.find(x => x.id === b.id);
  batch.set(doc(db, 'branches', b.id), data, { merge: true });
  const moved = [];
  for (const o of all) {
    if (o.id === b.id) continue;
    const keep = o.propertyIds.filter(id => !ids.includes(id));
    if (keep.length !== o.propertyIds.length) {
      moved.push(...o.propertyIds.filter(id => ids.includes(id)).map(id => `${id} from ${o.name}`));
      batch.set(doc(db, 'branches', o.id), { propertyIds: keep, updatedAt: serverTimestamp(), updatedBy: me.user.uid, updatedByName: me.name || '' }, { merge: true });
    }
  }
  const changes = [];
  if (!before) changes.push({ field: 'branch', old: null, new: data.name });
  else {
    for (const k of ['name', 'state', 'active', 'driveLink', 'sheetLink']) if (String(before[k] ?? '') !== String(data[k] ?? '')) changes.push({ field: k, old: before[k] ?? null, new: data[k] ?? null });
    if (before.propertyIds.join() !== ids.join()) changes.push({ field: 'properties', old: before.propertyIds.length, new: ids.length });
    if (JSON.stringify(before.links) !== JSON.stringify(data.links)) changes.push({ field: 'links', old: before.links.length, new: data.links.length });
  }
  if (moved.length) changes.push({ field: 'moved', old: null, new: moved.join(', ').slice(0, 400) });
  audit(batch, me, { action: isNew ? 'branch.create' : 'branch.update', entity: `branches/${b.id}`, changes });
  await batch.commit();
  cache = null;
}

// First set-up: one branch per state that has a Drive folder (or has properties), with its properties and folder link
export async function branchesFromStates(me, { driveStates = {}, properties = [], stateOf, shortState }) {
  const byState = new Map();
  for (const p of properties) { const s = stateOf(p); if (s) { if (!byState.has(s)) byState.set(s, []); byState.get(s).push(p.id); } }
  for (const s of Object.keys(driveStates)) if (!byState.has(s)) byState.set(s, []);
  const batch = writeBatch(db), made = [];
  for (const [state, ids] of byState) {
    const id = newBranchId(), name = shortState(state);
    batch.set(doc(db, 'branches', id), { name, state, active: true, propertyIds: ids.sort(), driveLink: driveStates[state]?.link || '', sheetLink: '', links: [],
      createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name || '', updatedAt: serverTimestamp(), updatedBy: me.user.uid, updatedByName: me.name || '' });
    made.push(name);
  }
  if (!made.length) return [];
  audit(batch, me, { action: 'branch.fromStates', entity: 'branches', changes: [{ field: 'branches', old: null, new: made.join(', ') }] });
  await batch.commit();
  cache = null;
  return made;
}
