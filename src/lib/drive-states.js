// lib/drive-states.js (17 Nov 2026): the states set up on Settings > States, each with its Google Drive folder
// (e.g. W.P. Kuala Lumpur -> "Owner Files (SA, Statements)"). One record: config/driveStates
//   { states: { 'W.P. Kuala Lumpur': { folderId, folderName, link, by, byName, at } }, updatedBy, updatedByName, updatedAt }
// A property can only be added in a set-up state (Add property, Bulk Upload). api/drive.js reads the same record.
// Directors and Operations edit it; everyone signed in reads it.
import { doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { audit } from '@/lib/finance-data.js';
import { STATES } from '@/lib/states.js';

let cache = null;
// { 'W.P. Kuala Lumpur': { folderId, folderName, link, ... } }
export async function loadDriveStates(fresh = false) {
  if (cache && !fresh) return cache;
  try { const s = await getDoc(doc(db, 'config', 'driveStates')); cache = (s.exists() && s.data().states) || {}; }
  catch (e) { console.error('Drive states:', e); cache = {}; }
  return cache;
}
// The states a new property may get: set up, in the usual order
export const setUpStates = map => STATES.filter(s => map?.[s]?.folderId);
export const canSetUpStates = role => ['director', 'operations'].includes(role);

// Saves one state's folder (folder = { id, name, link }) or removes it (folder = null)
export async function saveDriveState(me, state, folder) {
  const now = await loadDriveStates(true), before = now[state] || null;
  const states = { ...now };
  if (folder) states[state] = { folderId: folder.id, folderName: folder.name, link: folder.link, by: me.user.uid, byName: me.name || '', at: new Date().toISOString() };
  else delete states[state];
  const b = writeBatch(db);
  b.set(doc(db, 'config', 'driveStates'), { states, updatedBy: me.user.uid, updatedByName: me.name || '', updatedAt: serverTimestamp() });
  audit(b, me, { action: folder ? 'driveState.set' : 'driveState.remove', entity: 'config/driveStates',
    changes: [{ field: state, old: before ? before.folderName : null, new: folder ? folder.name : null }] });
  await b.commit();
  cache = states;
  return states;
}
