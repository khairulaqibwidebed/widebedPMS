// lib/drive-states.js (17 Nov 2026): the states set up on Settings > States, each with its Google Drive folder
// (e.g. W.P. Kuala Lumpur -> "Owner Files (SA, Statements)"). One record: config/driveStates
//   { states: { 'W.P. Kuala Lumpur': { folderId, folderName, link, by, byName, at } }, updatedBy, updatedByName, updatedAt }
// A property can only be added in a set-up state (Add property, Bulk Upload). api/drive.js reads the same record.
// Directors and Operations edit it; everyone signed in reads it.
import { doc, getDoc, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { audit } from '@/lib/finance-data.js';
import { STATES } from '@/lib/states.js';
import { can } from '@/lib/access.js';

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
// Full (edit) on Google Drive Folders (Staff accounts / Roles access; Directors and Operations by default)
export const canSetUpStates = me => can(me, 'driveFolders.edit');

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

// Properties once linked to a Drive folder (config/driveSeen { props: { propertyId: { link, folderName, at } } }), so
// Settings > States can show orange when one is no longer found. Written by the States page (Directors, Operations).
export async function loadDriveSeen() {
  try { const s = await getDoc(doc(db, 'config', 'driveSeen')); return (s.exists() && s.data().props) || {}; }
  catch (e) { console.error('Drive seen:', e); return {}; }
}
export const saveDriveSeen = (me, props) => setDoc(doc(db, 'config', 'driveSeen'), { props, updatedBy: me.user.uid, updatedAt: serverTimestamp() }, { merge: true });

// A property's own units folder (17 Nov 2026), for a property whose unit folders are not in <property>/Owner
// (e.g. D Majestic: "Profit Sharing"). config/driveUnits { props: { propertyId: { folderId, folderName, link, by, byName, at } } }.
// api/drive.js reads it for issue uploads, unit links and the States check. Directors and Operations set it on Overview.
export async function loadDriveUnits() {
  try { const s = await getDoc(doc(db, 'config', 'driveUnits')); return (s.exists() && s.data().props) || {}; }
  catch (e) { console.error('Drive units:', e); return {}; }
}
// folder = { id, name, link }, or null to go back to <property>/Owner
export async function saveDriveUnits(me, propertyId, propertyName, folder) {
  const props = { ...(await loadDriveUnits()) }, before = props[propertyId] || null;
  if (folder) props[propertyId] = { folderId: folder.id, folderName: folder.name, link: folder.link, by: me.user.uid, byName: me.name || '', at: new Date().toISOString() };
  else delete props[propertyId];
  const b = writeBatch(db);
  b.set(doc(db, 'config', 'driveUnits'), { props, updatedBy: me.user.uid, updatedAt: serverTimestamp() });
  audit(b, me, { action: folder ? 'driveUnits.set' : 'driveUnits.remove', entity: 'config/driveUnits',
    changes: [{ field: propertyName || propertyId, old: before ? before.folderName : null, new: folder ? folder.name : null }] });
  await b.commit();
  return props[propertyId] || null;
}
