// HR Announcements (5 Nov 2026): every read and write for /HR/announcements and the dashboard banner.
//   announcements/{id}              title, message, audience (role ids or ['everyone']), pinned, files [{ id, name, type, size }],
//                                   createdAt/By/ByName/ByRole, editedAt/By/ByName, remindedAt
//   announcements/{id}/views/{uid}  viewedAt, name, role: written once by that person the first time they open it
//   announcementReads/{uid}         ids: { <announcementId>: viewedAt }: the person's own list, so the banner and the
//                                   Unread filter need one document read instead of one per announcement
// Files (photos and documents) go to the company Google Drive through api/drive.js, area 'announcements'
// (HR Announcements/<month>/<title> (<id>)). Only HR and Directors may upload or remove there; everyone signed in may view.
import { collection, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db, BUILTIN_ROLES, CUSTOM_ROLES, ROLE_LABEL } from '@/lib/firebase.js';
import { notifyRole, notifyUser } from '@/services/notificationService';
import { uploadFile, removeFile } from '@/lib/drive.js';

export const KIND = 'announcements';
export const MAX_FILES = 10;
export const MAX_BYTES = 4 * 1024 * 1024;            // the in-site viewer and downloads can't serve more (Vercel limit)
const SHRINK_OVER = 1.5 * 1024 * 1024;               // photos bigger than this are shrunk before upload
export const TITLE_MAX = 150, MESSAGE_MAX = 5000;

export const canPost = role => role === 'hr' || role === 'director';
export const ms = t => (t?.toMillis ? t.toMillis() : t instanceof Date ? t.getTime() : 0);
export const audLabel = a => (a === 'everyone' ? 'Everyone' : ROLE_LABEL[a] || a);
export const posterLabel = a => (a.createdByRole === 'director' ? 'A Director' : 'HR');
// Built-in roles plus active roles made on the Roles page
export const activeRoles = () => [...BUILTIN_ROLES, ...Object.keys(CUSTOM_ROLES).filter(r => CUSTOM_ROLES[r].active)];
export const isForMe = (a, role) => (a.audience || []).includes('everyone') || (a.audience || []).includes(role);
// Unread = meant for me, not posted by me, not opened yet
export const isUnread = (a, me, reads) => isForMe(a, me.role) && a.createdBy !== me.user?.uid && !reads[a.id];
// Pinned first, then newest first
export const byPinThenNew = (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || ms(b.createdAt) - ms(a.createdAt);

const rows = snap => snap.docs.map(d => ({ id: d.id, files: [], audience: ['everyone'], ...d.data() }));

// Announcements meant for this role, newest first (n = how many; 0 = all). One query.
export async function loadForRole(role, n = 0) {
  const base = [collection(db, 'announcements'), where('audience', 'array-contains-any', [role, 'everyone']), orderBy('createdAt', 'desc')];
  return rows(await getDocs(query(...base, ...(n ? [limit(n)] : []))));
}
// HR and Directors: every announcement
export async function loadAll() {
  return rows(await getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'))));
}
export async function loadFor(me) { return canPost(me.role) ? loadAll() : loadForRole(me.role); }

// My own viewed list: { <id>: Timestamp }
export async function loadMyReads(uid) {
  const s = await getDoc(doc(db, 'announcementReads', uid));
  return s.exists() ? s.data().ids || {} : {};
}

// First time I open one meant for me: views/{me} and my own list, in one batch. Never written twice.
export async function markViewed(me, a, reads) {
  if (!isForMe(a, me.role) || a.createdBy === me.user.uid || reads[a.id]) return false;
  const b = writeBatch(db);
  b.set(doc(db, 'announcements', a.id, 'views', me.user.uid), { viewedAt: serverTimestamp(), name: me.name || '', role: me.role });
  b.set(doc(db, 'announcementReads', me.user.uid), { ids: { [a.id]: serverTimestamp() } }, { merge: true });
  await b.commit();
  return true;
}

// HR's panel: who has opened it, and the active staff it is for
export async function loadViews(id) {
  const snap = await getDocs(collection(db, 'announcements', id, 'views'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() })).sort((x, y) => ms(y.viewedAt) - ms(x.viewedAt));
}
// HR's list: how many have opened each one. A count costs one read (up to 1,000 views). Includes people who have since
// left a tagged team or been switched off, so it can be a little higher than the opened announcement's panel.
export async function countViews(id) {
  return (await getCountFromServer(collection(db, 'announcements', id, 'views'))).data().count;
}
export async function loadActiveStaff() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.active !== false && u.role)
    .map(u => ({ uid: u.uid, name: u.displayName || u.email || 'Staff', role: u.role }));
}
// The people an announcement is for: active staff in the tagged roles (or everyone), not the person who posted it.
// Someone who joined a tagged role after posting counts too.
export const audienceOf = (a, staff) => staff.filter(u => u.uid !== a.createdBy && isForMe(a, u.role));

// ---- Files ----
// Photos over 1.5 MB are shrunk (longest side 2000px, JPEG); anything still over 4 MB is refused.
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    img.src = url;
  });
}
async function shrink(file) {
  const img = await loadImage(file), k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
  let blob = null;
  for (const q of [0.85, 0.75, 0.65, 0.55]) {
    blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= SHRINK_OVER) break;
  }
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}
export async function prepareFile(file) {
  let f = file;
  if (file.type.startsWith('image/') && file.type !== 'image/gif' && file.size > SHRINK_OVER) {
    try { f = await shrink(file); } catch { f = file; }   // e.g. HEIC on Windows: keep the original if it fits
  }
  if (f.size > MAX_BYTES) throw new Error(`${file.name} is over 4 MB. Make it smaller first (e.g. a smaller PDF or a screenshot).`);
  return f;
}
async function uploadAll(id, title, list, onProgress) {
  const out = [];
  for (const [i, f] of list.entries()) {
    const r = await uploadFile(KIND, id, f, p => onProgress((i + p) / list.length), title);
    out.push({ id: r.file?.id || '', name: r.file?.name || f.name, type: r.file?.mimeType || f.type || '', size: f.size || 0 });
  }
  return out.filter(x => x.id);
}
// Best effort: a file left in Drive is harmless, it just isn't listed anywhere
const trash = files => Promise.allSettled(files.map(f => removeFile(KIND, f.id)))
  .then(r => r.forEach(x => { if (x.status === 'rejected') console.warn('Drive file not removed:', x.reason); }));

const audit = (b, me, action, id, changes, reason) => b.set(doc(collection(db, 'auditLog')), {
  at: serverTimestamp(), uid: me.user.uid, userName: me.name, role: me.role, action, entity: `announcements/${id}`, changes, reason });

// ---- Post / edit / pin / delete (HR and Directors) ----
export async function postAnnouncement(me, f, onProgress = () => {}) {
  const ref = doc(collection(db, 'announcements'));
  const files = await uploadAll(ref.id, f.title.trim(), f.newFiles, onProgress);
  const data = { title: f.title.trim(), message: f.message.trim(), audience: f.audience, pinned: !!f.pinned, files,
    createdAt: serverTimestamp(), createdBy: me.user.uid, createdByName: me.name || '', createdByRole: me.role };
  const b = writeBatch(db);
  b.set(ref, data);
  audit(b, me, 'announcement.post', ref.id, [{ field: 'title', old: null, new: data.title }], 'Announcement posted');
  try { await b.commit(); } catch (e) { trash(files); throw e; }
  // One bell per tagged role; Everyone = every built-in role and every active custom role. Push follows.
  const roles = data.audience.includes('everyone') ? activeRoles() : data.audience;
  const who = me.role === 'director' ? 'A Director' : 'HR';
  Promise.allSettled([...new Set(roles)].map(recipientRole => notifyRole({ recipientRole, type: 'announcement', refId: ref.id,
    link: `/HR/announcements?id=${ref.id}`, title: `${who} posted an announcement`, message: data.title })))
    .then(r => r.forEach(x => { if (x.status === 'rejected') console.warn('Notification not sent:', x.reason); }));
  return { id: ref.id, ...data, createdAt: new Date() };
}

// Edit: title, message, who it's for, pinned, files. Shows "Edited" only when the content changed (not for a pin). No bell.
export async function editAnnouncement(me, a, f, onProgress = () => {}) {
  const added = await uploadAll(a.id, f.title.trim(), f.newFiles, onProgress);
  const kept = a.files.filter(x => !f.removed.includes(x.id)), gone = a.files.filter(x => f.removed.includes(x.id));
  const data = { title: f.title.trim(), message: f.message.trim(), audience: f.audience, pinned: !!f.pinned, files: [...kept, ...added] };
  const changed = ['title', 'message'].filter(k => data[k] !== a[k]);
  if (data.audience.join() !== (a.audience || []).join()) changed.push('audience');
  if (added.length || gone.length) changed.push('files');
  if (changed.length) Object.assign(data, { editedAt: serverTimestamp(), editedBy: me.user.uid, editedByName: me.name || '' });
  if (!changed.length && data.pinned === !!a.pinned) return a;
  const b = writeBatch(db);
  b.update(doc(db, 'announcements', a.id), data);
  audit(b, me, changed.length ? 'announcement.edit' : 'announcement.pin', a.id,
    [...changed.map(field => ({ field, old: field === 'title' ? a.title : null, new: field === 'title' ? data.title : null })),
      ...(data.pinned !== !!a.pinned ? [{ field: 'pinned', old: !!a.pinned, new: data.pinned }] : [])],
    changed.length ? 'Announcement edited' : data.pinned ? 'Announcement pinned' : 'Announcement unpinned');
  try { await b.commit(); } catch (e) { trash(added); throw e; }
  trash(gone);
  return { ...a, ...data, ...(data.editedAt ? { editedAt: new Date() } : {}) };
}

export async function setPinned(me, a, pinned) {
  const b = writeBatch(db);
  b.update(doc(db, 'announcements', a.id), { pinned });
  audit(b, me, 'announcement.pin', a.id, [{ field: 'pinned', old: !!a.pinned, new: pinned }], pinned ? 'Announcement pinned' : 'Announcement unpinned');
  await b.commit();
}

// Delete with a reason: the announcement and its views in one batch, then its Drive files.
export async function deleteAnnouncement(me, a, reason) {
  const views = await getDocs(collection(db, 'announcements', a.id, 'views'));
  const b = writeBatch(db);
  views.docs.forEach(v => b.delete(v.ref));
  b.delete(doc(db, 'announcements', a.id));
  audit(b, me, 'announcement.delete', a.id, [{ field: 'title', old: a.title, new: null }], reason.trim());
  await b.commit();
  await trash(a.files || []);
}

// A bell to each person who hasn't opened it yet
export async function remind(me, a, people) {
  const r = await Promise.allSettled(people.map(p => notifyUser({ recipientUid: p.uid, type: 'announcement', refId: a.id,
    link: `/HR/announcements?id=${a.id}`, title: 'Reminder: please read this announcement', message: a.title })));
  const b = writeBatch(db);
  b.update(doc(db, 'announcements', a.id), { remindedAt: serverTimestamp() });
  await b.commit();
  return r.filter(x => x.status === 'fulfilled').length;
}
