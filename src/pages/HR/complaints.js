// Staff complaints (to HR) and Director complaints (HR to the Directors), in Firestore complaints/{id}.
// The parent document holds only the ref, kind, date and status; subject, details, sender name and file names
// live in complaints/{id}/private/main. A named staff complaint keeps fromId so the sender can follow it under
// My complaints. An anonymous one keeps nothing about the sender, not even in the audit log; the sender's own
// browser remembers which refs they sent (wb.myAnonComplaints) so they can still see the status.
import { db } from '@/lib/firebase.js';
import { collection, doc, getDoc, getDocs, query, where, writeBatch, runTransaction, serverTimestamp } from 'firebase/firestore';
import { audit } from '@/lib/finance-data.js';
import { notifyRole } from '@/services/notificationService';

export const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const STATUS = { new: ['New', 'amber'], review: ['In review', 'blue'], closed: ['Closed', 'green'] };
const KIND = { staff: { counter: 'staffComplaints', prefix: 'CP-', width: 4 }, director: { counter: 'directorComplaints', prefix: 'DC-', width: 3 } };
const ms = t => (t?.toMillis ? t.toMillis() : 0);

// Parent plus its private/main, newest first.
async function withPrivate(docs) {
  const priv = await Promise.all(docs.map(d => getDoc(doc(db, 'complaints', d.id, 'private', 'main'))));
  return docs.map((d, i) => ({ id: d.id, ...d.data(), subject: '', details: '', fromName: '', files: [], ...(priv[i].exists() ? priv[i].data() : {}) }))
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt) || b.ref.localeCompare(a.ref));
}

export async function loadComplaints(kind) {
  const snap = await getDocs(query(collection(db, 'complaints'), where('kind', '==', kind)));
  return withPrivate(snap.docs);
}

// Anonymous refs sent from this browser (the PMS keeps no link to the sender).
const ANON_KEY = 'wb.myAnonComplaints';
const anonReceipts = () => { try { const v = JSON.parse(localStorage.getItem(ANON_KEY)); return Array.isArray(v) ? v : []; } catch { return []; } };
const keepAnonReceipt = r => { try { localStorage.setItem(ANON_KEY, JSON.stringify([r, ...anonReceipts()].slice(0, 50))); } catch {} };

// My complaints: named ones by fromId, anonymous ones from this browser's receipts (status read from the parent).
export async function loadMyComplaints(uid) {
  const snap = await getDocs(query(collection(db, 'complaints'), where('kind', '==', 'staff'), where('fromId', '==', uid)));
  const named = await withPrivate(snap.docs);
  const anon = await Promise.all(anonReceipts().map(async r => {
    try { const d = await getDoc(doc(db, 'complaints', r.id)); return d.exists() ? { ...r, ...d.data(), id: r.id, subject: r.subject } : null; }
    catch { return null; }
  }));
  return [...named, ...anon.filter(Boolean)].sort((a, b) => ms(b.createdAt) - ms(a.createdAt) || b.ref.localeCompare(a.ref));
}

// me = useSession(). One transaction takes the next number from counters/{name} (so two people never get
// the same ref) and writes the complaint, its private part and the audit entry. Returns the new ref.
// A new STAFF complaint also puts one notification on the HR bell (role notification, HR only).
export async function createComplaint(me, kind, { subject, details, files, anonymous = false }) {
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
      ...(kind === 'staff' && named ? { fromId: me.user.uid } : {}) });
    tx.set(doc(db, 'complaints', c.id, 'private', 'main'), { subject, details, files, ...(named ? { fromName: me.name } : {}) });
    if (named) audit(tx, me, { action: 'complaint.create', entity: `complaints/${c.id}`, changes: [{ field: 'ref', old: null, new: ref }] });
    // Anonymous: a neutral audit entry with no uid, name or role.
    else tx.set(doc(collection(db, 'auditLog')), { at: serverTimestamp(), uid: null, userName: 'Anonymous', role: null,
      action: 'complaint.create', entity: `complaints/${c.id}`, propertyId: null, month: null, changes: [{ field: 'ref', old: null, new: ref }], reason: '' });
    return ref;
  });

  // Tell HR (and only HR). The text never holds the subject, details or sender name. For an anonymous complaint the
  // notification is written with no sender uid or name either (anonymous: true), so it cannot point back to the person.
  // A failed notification must never undo the complaint, so the error is only logged.
  if (kind === 'staff') {
    try {
      await notifyRole({
        recipientRole: 'hr',
        type: 'complaint',
        refId: c.id,
        link: '/HR/staff-complaints',
        anonymous: !named,
        title: `New complaint ${ref}`,
        message: 'A new complaint was sent to HR. Open it to read the details.'
      });
    } catch (e) { console.error('Notification failed:', e); }
  }

  if (!named) keepAnonReceipt({ id: c.id, ref, date: today(), subject, anonymous: true });
  return ref;
}

// A Director opening a Director complaint marks it read.
export async function markRead(me, c) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'complaints', c.id), { read: true, readAt: serverTimestamp(), readBy: me.user.uid });
  audit(batch, me, { action: 'complaint.read', entity: `complaints/${c.id}`, changes: [{ field: 'read', old: false, new: true }] });
  await batch.commit();
}