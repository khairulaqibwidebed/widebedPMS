// Staff complaints (to HR) and Director complaints (HR to the Directors), in Firestore complaints/{id}.
// The parent document holds only the ref, kind, date and status; subject, details, sender name and file names
// live in complaints/{id}/private/main. A named staff complaint keeps fromId so the sender can follow it under
// My complaints. An anonymous one keeps nothing about the sender, not even in the audit log; the sender's own
// browser remembers which refs they sent (wb.myAnonComplaints) so they can still see the status.
import { db, auth } from '@/lib/firebase.js';
import { collection, doc, getDoc, getDocs, query, where, orderBy, writeBatch, runTransaction, serverTimestamp, limit } from 'firebase/firestore';
import { listen } from '@/lib/use-live.js';
import { audit } from '@/lib/finance-data.js';
import { notifyRole, notifyUser } from '@/services/notificationService';
import { uploadForLink } from '@/lib/drive.js';

export const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const STATUS = { new: ['New', 'amber'], read: ['Read by HR', 'blue'], review: ['In review', 'blue'], closed: ['Closed', 'green'] };
// Director complaints (4 Nov 2026): the Directors set the status like HR does on staff complaints. Ones sent before
// that have only read: true/false, so dirStatus falls back to it.
export const DSTATUS = { new: ['New', 'amber'], read: ['Read by the Directors', 'blue'], review: ['In review', 'blue'], closed: ['Closed', 'green'] };
export const dirStatus = c => c.status || (c.read ? 'read' : 'new');
// Staff complaint refs are SC-0001 (Staff Complaint). They were CP- until 4 Nov 2026; those older saved refs are shown as
// SC- by showRef (same number, the counter carries on), so the old prefix never appears on screen.
const KIND = { staff: { counter: 'staffComplaints', prefix: 'SC-', width: 4 }, director: { counter: 'directorComplaints', prefix: 'DC-', width: 3 } };
const ms = t => (t?.toMillis ? t.toMillis() : 0);
export const showRef = ref => String(ref || '').replace(/^CP-/, 'SC-');

// Parent plus its private/main, newest first.
async function withPrivate(docs) {
  const priv = await Promise.all(docs.map(d => getDoc(doc(db, 'complaints', d.id, 'private', 'main'))));
  return docs.map((d, i) => ({ id: d.id, ...d.data(), subject: '', details: '', fromName: '', files: [], ...(priv[i].exists() ? priv[i].data() : {}) }))
    .map(c => ({ ...c, ref: showRef(c.ref) }))
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt) || b.ref.localeCompare(a.ref));
}

export async function loadComplaints(kind) {
  const snap = await getDocs(query(collection(db, 'complaints'), where('kind', '==', kind)));
  return withPrivate(snap.docs);
}
// HR's "Sent before" (5 Nov 2026): only the Director complaints this person sent (fromId on the main record)
export async function loadMyDirectorComplaints(uid) {
  const snap = await getDocs(query(collection(db, 'complaints'), where('kind', '==', 'director'), where('fromId', '==', uid)));
  return withPrivate(snap.docs);
}

// Live complaint lists (6 Nov 2026): status changes show without a refresh. Listens to the parent records only
// (status, read); the private part (subject, details, name) is read once per complaint and kept.
// who: { kind } for an inbox, { kind, fromId } for "my" complaints. onRows gets the full rows, newest first.
// Returns stop(). Pages merge the rows with mergeRows so an open complaint updates in place.
const LIST_MAX = 300;
export function watchComplaintList(who, onRows, onError) {
  const privs = {};
  const conds = [where('kind', '==', who.kind), ...(who.fromId ? [where('fromId', '==', who.fromId)] : [])];
  let turn = 0;
  return listen(query(collection(db, 'complaints'), ...conds, limit(LIST_MAX)), async parents => {
    const mine = ++turn;
    try {
      await Promise.all(parents.filter(p => !privs[p.id]).map(async p => {
        const d = await getDoc(doc(db, 'complaints', p.id, 'private', 'main'));
        privs[p.id] = d.exists() ? d.data() : {};
      }));
    } catch (e) { return onError?.(e); }
    if (mine !== turn) return;   // a newer snapshot already arrived
    onRows(parents.map(p => ({ subject: '', details: '', fromName: '', files: [], ...p, ...privs[p.id], ref: showRef(p.ref) }))
      .sort((a, b) => ms(b.createdAt) - ms(a.createdAt) || b.ref.localeCompare(a.ref)));
  }, { onError });
}
// Anonymous complaints sent from this browser: one small listener per saved ref (status only)
export function watchMyAnonComplaints(onRows, onError) {
  const rows = {}, list = anonReceipts();
  if (!list.length) { onRows([]); return () => {}; }
  const put = (id, row) => {
    rows[id] = row;
    if (Object.keys(rows).length === list.length) onRows(Object.values(rows).filter(Boolean));
  };
  // 11 Nov 2026: a receipt this account can't read (left in the browser by another account, or no longer anonymous)
  // is skipped instead of failing the whole page. It stays saved, in case the rules were just not published yet.
  const stops = list.map(r => listen(doc(db, 'complaints', r.id), d => {
    put(r.id, d ? { ...r, ...d, id: r.id, subject: r.subject, ref: showRef(d.ref || r.ref) } : null);
  }, { onError: e => { console.warn('[complaints] skipped anonymous receipt', r.id, e?.code); put(r.id, null); } }));
  return () => stops.forEach(stop => stop());
}
// Keeps the same objects for complaints already on screen (so the open one updates too), adds new ones
export function mergeRows(old, rows) {
  const byId = new Map(old.map(c => [c.id, c]));
  return rows.map(r => { const o = byId.get(r.id); return o ? Object.assign(o, r) : r; });
}
export const newestFirst = (a, b) => ms(b.createdAt) - ms(a.createdAt) || String(b.ref).localeCompare(String(a.ref));

// Anonymous refs sent from this browser (the PMS keeps no link to the sender).
const ANON_KEY = 'wb.myAnonComplaints';
const anonReceipts = () => { try { const v = JSON.parse(localStorage.getItem(ANON_KEY)); return Array.isArray(v) ? v : []; } catch { return []; } };
const keepAnonReceipt = r => { try { localStorage.setItem(ANON_KEY, JSON.stringify([r, ...anonReceipts()].slice(0, 50))); } catch {} };

// My complaints: named ones by fromId, anonymous ones from this browser's receipts (status read from the parent).
export async function loadMyComplaints(uid) {
  const snap = await getDocs(query(collection(db, 'complaints'), where('kind', '==', 'staff'), where('fromId', '==', uid)));
  const named = await withPrivate(snap.docs);
  const anon = await Promise.all(anonReceipts().map(async r => {
    try { const d = await getDoc(doc(db, 'complaints', r.id)); return d.exists() ? { ...r, ...d.data(), id: r.id, subject: r.subject, ref: showRef(d.data().ref || r.ref) } : null; }
    catch { return null; }
  }));
  return [...named, ...anon.filter(Boolean)].sort((a, b) => ms(b.createdAt) - ms(a.createdAt) || b.ref.localeCompare(a.ref));
}

// me = useSession(). One transaction takes the next number from counters/{name} (so two people never get
// the same ref) and writes the complaint, its private part and the audit entry. Returns the new ref.
// A new STAFF complaint also puts one notification on the HR bell (role notification, HR only).
export async function createComplaint(me, kind, { subject, details, files, anonymous = false, images = [], docs = [] }) {
  const k = KIND[kind];
  const named = kind === 'director' || !anonymous;
  const c = doc(collection(db, 'complaints'));
  const ref = await runTransaction(db, async tx => {
    const counter = doc(db, 'counters', k.counter);
    const cs = await tx.get(counter);
    const n = cs.exists() ? cs.data().next || 1 : 1;
    const ref = k.prefix + String(n).padStart(k.width, '0');
    tx.set(counter, { next: n + 1 });
    tx.set(c, { ref, kind, date: today(), createdAt: serverTimestamp(),
      ...(kind === 'staff' ? { status: 'new', anonymous: !named } : { read: false }),
      // fromId: the named staff sender, or (5 Nov 2026) the HR person who sent a Director complaint (only they and the Directors read it)
      ...(named ? { fromId: me.user.uid } : {}) });
    // Director complaints also keep the sender's uid (4 Nov 2026) so their profile picture shows. Staff complaints already have fromId.
    tx.set(doc(db, 'complaints', c.id, 'private', 'main'), { subject, details, files, ...(named ? { fromName: me.name } : {}), ...(kind === 'director' ? { fromUid: me.user.uid } : {}) });
    if (named) audit(tx, me, { action: 'complaint.create', entity: `complaints/${c.id}`, changes: [{ field: 'ref', old: null, new: ref }] });
    // Anonymous: a neutral audit entry with no uid, name or role.
    else tx.set(doc(collection(db, 'auditLog')), { at: serverTimestamp(), uid: null, userName: 'Anonymous', role: null,
      action: 'complaint.create', entity: `complaints/${c.id}`, propertyId: null, month: null, changes: [{ field: 'ref', old: null, new: ref }], reason: '' });
    return ref;
  });

  // Staff complaint -> HR's bell. Director complaint (HR to the Directors) -> the Directors' bell.
  // The text never holds the subject, details or sender name. For an anonymous complaint the notification is written
  // with no sender uid or name either (anonymous: true), so it cannot point back to the person.
  // A failed notification must never undo the complaint, so the error is only logged.
  try {
    await notifyRole(kind === 'staff'
      ? { recipientRole: 'hr', type: 'complaint', refId: c.id, link: '/HR/staff-complaints', anonymous: !named,
          title: `New complaint ${ref}`, message: 'A new complaint was sent to HR. Open it to read the details.' }
      : { recipientRole: 'director', type: 'complaint', refId: c.id, link: '/HR/director-complaints', anonymous: false,
          title: `New complaint to the Directors ${ref}`, message: 'HR sent a complaint to the Directors. Open it to read the details.' });
  } catch (e) { console.error('Notification failed:', e.code || '', e.message || e); }

  // Photos (4 Nov 2026): saved after the complaint, one record each. Anonymous: no uid on them either.
  if (images.length) {
    try {
      const b = writeBatch(db);
      for (const im of images.slice(0, MAX_PHOTOS)) b.set(doc(collection(db, 'complaints', c.id, 'images')), imageDoc(im, 'complaint', null, named ? me.user.uid : null));
      await b.commit();
    } catch (e) { console.error('Photos not saved:', e.code || e.message); throw Object.assign(new Error(`Sent as ${ref}, but the photos could not be saved. Add them in a reply.`), { sentRef: ref }); }
  }

  if (!named) keepAnonReceipt({ id: c.id, ref, date: today(), subject, anonymous: true });

  // Documents (11 Nov 2026): uploaded to HR's own Google Drive after the complaint exists, then listed on it
  if (docs.length && kind === 'staff') {
    try { await addDocs(me, { id: c.id, ref, kind, fromId: named ? me.user.uid : null }, docs, named ? 'sender' : 'anon'); }
    catch (e) { console.error('Documents not saved:', e.code || e.message); throw Object.assign(new Error(`Sent as ${ref}, but the documents could not be uploaded (${e.message}). ${named ? 'Add them on the complaint under My complaints.' : 'Send them to HR another way.'}`), { sentRef: ref }); }
  }
  return ref;
}

// ---- Documents (11 Nov 2026) ----
// complaints/{id}/docs: PDF, Word, Excel or image files on a STAFF complaint, stored in HR's own Google Drive
// (api/drive.js kind 'complaints', folder named by the ref only). Read by the same people as the conversation.
// by: 'hr', 'sender' (named sender) or 'anon' (the anonymous sender, only while sending). Never changed or removed.
export const MAX_DOCS = 5, DOC_MAX_MB = 10;
export const DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.txt,image/*';
export function checkDocs(files) {
  if (files.length > MAX_DOCS) return `Up to ${MAX_DOCS} documents at a time.`;
  const big = files.find(f => f.size > DOC_MAX_MB * 1024 * 1024);
  return big ? `${big.name} is larger than ${DOC_MAX_MB} MB.` : '';
}
export async function addDocs(me, c, files, by, onProgress = () => {}) {
  const bad = checkDocs(files); if (bad) throw new Error(bad);
  const up = await uploadForLink('complaints', files, onProgress, c.id, c.ref);
  const b = writeBatch(db);
  for (const u of up) b.set(doc(collection(db, 'complaints', c.id, 'docs')), { name: String(u.name).slice(0, 200), fileId: u.id, mimeType: u.mimeType || '',
    by, ...(by === 'anon' ? {} : { byUid: me.user.uid }), createdAt: serverTimestamp() });
  if (by !== 'anon') audit(b, me, { action: 'complaint.doc', entity: `complaints/${c.id}`, changes: [{ field: 'documents', old: null, new: `${up.length} added` }] });
  await b.commit();
  if (by === 'hr' && c.fromId) tell(notifyUser({ recipientUid: c.fromId, type: 'complaint', refId: c.id, link: `/HR/raise-complaint?id=${c.id}`,
    title: `HR added a document to your complaint ${c.ref}`, message: 'Open My complaints to see it.' }));
  else if (by === 'sender') tell(notifyRole({ recipientRole: 'hr', type: 'complaint', refId: c.id, link: `/HR/staff-complaints?id=${c.id}`,
    title: `New document on complaint ${c.ref}`, message: 'The sender added a document. Open the complaint to see it.' }));
  return up.length;
}
export const watchDocs = (id, onRows, onError) =>
  listen(query(collection(db, 'complaints', id, 'docs'), orderBy('createdAt')), rows => onRows(rows.sort(byTime)), { onError });

// HR opening a NEW staff complaint marks it "Read by HR" (4 Nov 2026), so the sender sees it under My complaints
// (an anonymous sender too, on their own browser). A named sender also gets a notification; an anonymous one can't
// (the PMS doesn't know who they are). The notification holds only the ref, never the subject or details.
export async function markStaffRead(me, c) {
  if (c.kind !== 'staff' || c.status !== 'new') return false;
  const batch = writeBatch(db);
  batch.update(doc(db, 'complaints', c.id), { status: 'read', readAt: serverTimestamp(), readBy: me.user.uid });
  audit(batch, me, { action: 'complaint.hrRead', entity: `complaints/${c.id}`, changes: [{ field: 'status', old: 'new', new: 'read' }] });
  await batch.commit();
  if (c.fromId) notifyUser({ recipientUid: c.fromId, type: 'complaint', refId: c.id, link: '/HR/raise-complaint',
    title: `HR has read your complaint ${c.ref}`, message: 'You can follow it under My complaints.' }).catch(e => console.warn('Notification not sent:', e));
  return true;
}

// A Director opening a Director complaint marks it read (status Read by the Directors); HR and the other Directors are told.
export async function markRead(me, c) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'complaints', c.id), { read: true, readAt: serverTimestamp(), readBy: me.user.uid, ...(c.status ? {} : { status: 'read' }) });
  audit(batch, me, { action: 'complaint.read', entity: `complaints/${c.id}`, changes: [{ field: 'read', old: false, new: true }] });
  await batch.commit();
  tellBoth(c, `The Directors have read complaint ${c.ref}`, `${me.name || 'A Director'} opened it.`);
}

// ---- Follow-up (4 Nov 2026) ----
// complaints/{id}/thread: the conversation between HR and the sender. HR replies; a NAMED sender replies back.
//   The sender sees it under My complaints (an anonymous sender on the browser they sent from).
// complaints/{id}/notes: HR's own notes, only HR reads them.
// HR also sets In review or Closed (closing needs a note, posted to the sender) and can Reopen.
// Nothing is ever edited or deleted. Notifications and audit entries carry the ref only, never the text.
const TEXT_MAX = 2000;
// Photos (4 Nov 2026): complaints/{id}/images, one shrunk JPEG per record (lib/image-shrink.js), readable by the same people
// as the conversation. scope 'complaint' = sent with the complaint; 'thread' = with a reply (threadId). Never changed.
export const MAX_PHOTOS = 5;
function imageDoc(im, scope, threadId, byUid) {
  return { data: im.data, w: im.w || 0, h: im.h || 0, size: im.size || 0, scope, ...(threadId ? { threadId } : {}), ...(byUid ? { byUid } : {}), createdAt: serverTimestamp() };
}
export async function loadImages(id) {
  const snap = await getDocs(query(collection(db, 'complaints', id, 'images'), orderBy('createdAt')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
const byTime = (a, b) => ms(a.createdAt) - ms(b.createdAt);
export async function loadThread(id) {
  const snap = await getDocs(query(collection(db, 'complaints', id, 'thread'), orderBy('createdAt')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byTime);
}
// Live conversation (6 Nov 2026): listens to the thread and photos so a new message shows on every open screen without
// a refresh. onChange gets { thread } or { images }; a message you just sent shows at once with an estimated time.
// Returns a stop function: call it when the complaint is closed or another one is opened.
// Runs on lib/use-live.js listen(), so two screens on the same complaint share one listener and it stops on sign-out.
export function watchConversation(id, onChange, onError) {
  const stops = [
    listen(query(collection(db, 'complaints', id, 'thread'), orderBy('createdAt')), rows => onChange({ thread: rows.sort(byTime) }), { onError }),
    listen(query(collection(db, 'complaints', id, 'images'), orderBy('createdAt')), rows => onChange({ images: rows.sort(byTime) }), { onError })
  ];
  return () => stops.forEach(stop => stop());
}
export async function loadNotes(id) {
  const snap = await getDocs(query(collection(db, 'complaints', id, 'notes'), orderBy('createdAt')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byTime);
}
const clean = t => String(t || '').trim().slice(0, TEXT_MAX);
const tell = p => p.catch(e => console.warn('Notification not sent:', e));
// Director complaints: every update goes to the HR person who sent it and to the Directors (the person who made it never
// sees their own). 5 Nov 2026: only the sender on the HR side, not all of HR.
function tellBoth(c, title, message = 'Open the complaint for the details.', roles = ['hr', 'director']) {
  const link = `/HR/director-complaints?id=${c.id}`;
  for (const r of roles) {
    if (r === 'hr') { if (c.fromId && c.fromId !== auth.currentUser?.uid) tell(notifyUser({ recipientUid: c.fromId, type: 'complaint', refId: c.id, link, title, message })); }
    else tell(notifyRole({ recipientRole: r, type: 'complaint', refId: c.id, link, title, message }));
  }
}

// Staff complaints: by = 'hr' (HR replying) or 'sender' (the named sender replying back).
// Director complaints (HR to the Directors): by = 'hr' or 'director'; each side's bell rings when the other replies.
export async function addReply(me, c, text, by, images = []) {
  const t = clean(text), pics = images.slice(0, MAX_PHOTOS);
  if (!t && !pics.length) throw new Error('Write a reply or add a photo first.');
  const b = writeBatch(db), r = doc(collection(db, 'complaints', c.id, 'thread'));
  const imgs = pics.map(im => ({ ref: doc(collection(db, 'complaints', c.id, 'images')), im }));
  b.set(r, { text: t, by, byName: me.name || '', byUid: me.user.uid, ...(imgs.length ? { imageIds: imgs.map(x => x.ref.id) } : {}), createdAt: serverTimestamp() });
  for (const x of imgs) b.set(x.ref, imageDoc(x.im, 'thread', r.id, me.user.uid));
  audit(b, me, { action: 'complaint.reply', entity: `complaints/${c.id}`, changes: [{ field: 'reply', old: null, new: by === 'hr' ? 'HR' : by === 'director' ? 'Director' : 'Sender' }] });
  await b.commit();
  if (c.kind === 'director') tellBoth(c, by === 'hr' ? `HR replied on complaint ${c.ref}` : `The Directors replied on complaint ${c.ref}`, 'Open the complaint to read it.');
  else if (by === 'hr' && c.fromId) tell(notifyUser({ recipientUid: c.fromId, type: 'complaint', refId: c.id, link: `/HR/raise-complaint?id=${c.id}`,
    title: `HR replied to your complaint ${c.ref}`, message: 'Open My complaints to read it.' }));
  else if (by === 'sender') tell(notifyRole({ recipientRole: 'hr', type: 'complaint', refId: c.id, link: `/HR/staff-complaints?id=${c.id}`,
    title: `New reply on complaint ${c.ref}`, message: 'The sender replied. Open the complaint to read it.' }));
  return { id: r.id, text: t, by, byName: me.name || '', createdAt: null, imageIds: imgs.map(x => x.ref.id),
    images: imgs.map(x => ({ id: x.ref.id, data: x.im.data })) };
}

export async function addNote(me, c, text) {
  const t = clean(text);
  if (!t) throw new Error('Write a note first.');
  const b = writeBatch(db);
  b.set(doc(collection(db, 'complaints', c.id, 'notes')), { text: t, byName: me.name || '', byUid: me.user.uid, createdAt: serverTimestamp() });
  audit(b, me, { action: 'complaint.note', entity: `complaints/${c.id}`, changes: [{ field: 'note', old: null, new: 'added' }] });
  await b.commit();
  // Director complaints: notes are the Directors' own (HR never sees them), so only the other Directors are told
  if (c.kind === 'director') tellBoth(c, `A Director added a note on complaint ${c.ref}`, 'Open the complaint to read it.', ['director']);
  return { text: t, byName: me.name || '', createdAt: null };
}

// HR on a staff complaint, or the Directors on a Director complaint: 'read', 'review' (In review), 'closed' (needs a note,
// which the other side sees) or back to 'review' (Reopen)
export async function setStatus(me, c, status, note = '') {
  const dir = c.kind === 'director', t = clean(note);
  if (status === 'closed' && !t) throw new Error(dir ? 'Add a closing note for HR.' : 'Add a closing note for the sender.');
  const b = writeBatch(db), old = dir ? dirStatus(c) : c.status;
  b.update(doc(db, 'complaints', c.id), { status, statusAt: serverTimestamp(), statusBy: me.user.uid });
  if (t) b.set(doc(collection(db, 'complaints', c.id, 'thread')), { text: t, by: dir ? 'director' : 'hr', byName: me.name || '', byUid: me.user.uid, closing: true, createdAt: serverTimestamp() });
  audit(b, me, { action: 'complaint.status', entity: `complaints/${c.id}`, changes: [{ field: 'status', old, new: status }] });
  await b.commit();
  if (dir) {
    const DTITLE = { read: `Complaint ${c.ref} is marked Read by the Directors`, review: `The Directors are looking into complaint ${c.ref}`, closed: `The Directors closed complaint ${c.ref}` };
    return tellBoth(c, old === 'closed' ? `The Directors reopened complaint ${c.ref}` : DTITLE[status] || `Complaint ${c.ref} was updated`,
      status === 'closed' ? 'Open the complaint to read the closing note.' : 'Open the complaint for the details.');
  }
  // Notification wording per status (edit the sentences here)
  const TITLE = { read: `HR has read your complaint ${c.ref}`, review: `HR is looking into your complaint ${c.ref}`, closed: `Your complaint ${c.ref} is closed` };
  const title = old === 'closed' ? `Your complaint ${c.ref} has been reopened` : TITLE[status] || `Your complaint ${c.ref} was updated`;
  const message = status === 'closed' ? "Open My complaints to read HR's closing note." : 'Open My complaints for the details.';
  if (c.fromId) tell(notifyUser({ recipientUid: c.fromId, type: 'complaint', refId: c.id, link: `/HR/raise-complaint?id=${c.id}`, title, message }));
}
