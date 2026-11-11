// Salary advances (5 Nov 2026, rules Draft 0.42).
//
// staffHR/{uid}        { ic, position, salary, updatedAt, updatedBy, updatedByName }   HR and Directors only (PDPA).
// advanceLimits/{uid}  { limit, updatedAt }   50% of salary, written in the same save as staffHR. The person reads their own
//                      limit here, never their salary or IC.
// users/{uid}.intern   ticked on HR details: no HR details, no Salary Advance page, the rules refuse their requests.
// advances/{id}        the request: ref SA-0001, uid, name, amount, reason, status, history (older requests may also have neededBy) [...], plus each step's fields.
//   Flow: submitted (staff) -> reviewed (HR: amount, Director told (tick only, 5 Nov 2026), form made with her signature) -> signed (staff draws or
//   uploads; or HR marks it signed outside the PMS with the fully signed document) -> approved = pending payment (HR)
//   -> paid (HR: payment type, date, screenshot). Staff withdraw only while submitted; HR rejects at submitted or signed.
// advances/{id}/notes        HR's own notes (HR writes, HR and Directors read).
// advances/{id}/form/main    what the PDF shows, frozen at review (IC, salary, signer name, Director's signature).
// advances/{id}/signed/main  how the staff member signed: { method: drawn | upload | outside, image? }.
// advances/{id}/signed/copy  the fully signed document HR uploads (required for 'outside', can be added or replaced later).
//                            form + signed: that staff member, HR and Directors read.
// advances/{id}/payment/main the payment screenshot (HR and Directors only, for the record).
// signatures/director        { signerName (default Miss Chloe), image, ... }   HR and Directors.
// signatureUses/{advanceId}  one line per form that carries the signature.
// Nothing is deleted. Audit entries and notifications hold the ref and status only, never amounts, salary or IC.
import { db, ROLE_LABEL } from '@/lib/firebase.js';
import { collection, doc, getDoc, getDocs, query, where, orderBy, writeBatch, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import { audit } from '@/lib/finance-data.js';
import { listen } from '@/lib/use-live.js';
import { notifyRole, notifyUser } from '@/services/notificationService';

export const LIMIT_SHARE = 0.5;   // 50% of the monthly salary, per request
export const DEFAULT_SIGNER = 'Miss Chloe';
// [label for HR, label for the staff member, pill colour]
export const STATUS = {
  submitted: ['Submitted', 'Submitted', 'amber'],
  withdrawn: ['Withdrawn', 'Withdrawn', 'grey'],
  rejected: ['Rejected', 'Not approved', 'red'],
  reviewed: ['Waiting for staff signature', 'Sign your form', 'amber'],
  signed: ['Signed by staff', 'Signed, waiting for HR', 'blue'],
  approved: ['Pending payment', 'Approved, pending payment', 'blue'],
  paid: ['Paid', 'Paid', 'green']
};
// History words for the step lines (the action names the step, not the status)
export const STEP = { submitted: 'Submitted', withdrawn: 'Withdrawn', rejected: 'Rejected', reviewed: 'Reviewed by HR, form made',
  signed: 'Signed by staff', hrCreated: 'Form made by HR (paper signing)', signedOutside: 'Marked signed outside the PMS', copy: 'Fully signed copy uploaded', approved: 'Approved', paid: 'Paid' };
export const PAY_TYPES = { tng: "Touch 'n Go", bank: 'Bank Transfer' };
export const SIGN_METHOD = { drawn: 'Signed on screen', upload: 'Signed copy uploaded by staff', outside: 'Signed outside the PMS' };
const TEXT_MAX = 1000;
const clean = t => String(t || '').trim().slice(0, TEXT_MAX);
const ms = t => (t?.toMillis ? t.toMillis() : 0);
const money = n => Math.round((Number(n) || 0) * 1000) / 1000;   // 3 decimals kept, 2 shown
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// Not rounded: the rules check limit == salary * 0.5 exactly (the salary itself is kept to 3 decimals).
export const limitOf = salary => (Number(salary) || 0) * LIMIT_SHARE;
const tell = p => p.catch(e => console.warn('Notification not sent:', e));
// One history line. Timestamp.now() because serverTimestamp() can't go inside a list.
const step = (me, action, note = '') => ({ at: Timestamp.now(), by: me.user.uid, byName: me.name || '', action, ...(note ? { note } : {}) });
const link = id => `/HR/salary-advance?tab=requests&id=${id}`, myLink = id => `/HR/salary-advance?id=${id}`;
// Forms HR made for the staff member (byHR, 5 Nov 2026) go to them on WhatsApp, so no bell for those.
const tellStaff = (a, title, message = 'Open My advances for the details.') => a.byHR ? null :
  tell(notifyUser({ recipientUid: a.uid, type: 'advance', refId: a.id, link: myLink(a.id), title, message }));
const tellHR = (a, title, message = 'Open the request for the details.') =>
  tell(notifyRole({ recipientRole: 'hr', type: 'advance', refId: a.id, link: link(a.id), title, message }));
const imageDoc = (me, im, extra = {}) => ({ image: im.data, w: im.w || 0, h: im.h || 0, size: im.size || 0, by: me.user.uid, byName: me.name || '', at: serverTimestamp(), ...extra });

// ---------------------------------------------------------------- HR details (staffHR + advanceLimits + intern)
export async function loadStaffHR() {
  const snap = await getDocs(collection(db, 'staffHR'));
  return Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
}
export async function getStaffHR(uid) {
  const d = await getDoc(doc(db, 'staffHR', uid));
  return d.exists() ? d.data() : null;
}
// The department printed on the form: the staff member's role name from Staff accounts (5 Nov 2026).
export const deptOf = role => ROLE_LABEL[role] || role || '';
export async function getDept(uid) {
  const d = await getDoc(doc(db, 'users', uid));
  return d.exists() ? deptOf(d.data().role) : '';
}
// HR or a Director saves one person's IC and salary (limit in the same batch); position is filled with their role name
// (the rules still expect it). intern: true clears them,
// sets the limit to 0 and ticks users/{uid}.intern, so they lose the Salary Advance page.
export async function saveStaffHR(me, user, before, { ic, salary, intern }) {
  const uid = user.id, wasIntern = user.intern === true;
  const next = intern ? { ic: '', position: '', salary: 0 } : { ic: String(ic || '').trim().slice(0, 40), position: deptOf(user.role).slice(0, 100), salary: money(salary) };
  if (!intern && !(next.salary > 0)) throw new Error('Enter the monthly salary.');
  const changed = ['ic', 'salary'].filter(k => (before?.[k] ?? '') !== next[k]);
  if (!changed.length && wasIntern === !!intern) throw new Error('Nothing changed.');
  const b = writeBatch(db);
  b.set(doc(db, 'staffHR', uid), { ...next, updatedAt: serverTimestamp(), updatedBy: me.user.uid, updatedByName: me.name || '' });
  b.set(doc(db, 'advanceLimits', uid), { limit: limitOf(next.salary), updatedAt: serverTimestamp() });
  if (wasIntern !== !!intern) b.update(doc(db, 'users', uid), { intern: !!intern });
  // The audit log is read by Accounting and IT too, so it names the fields that changed, never the values.
  const changes = changed.map(f => ({ field: f === 'ic' ? 'IC number' : f, old: null, new: 'changed' }));
  if (wasIntern !== !!intern) changes.push({ field: 'intern', old: wasIntern, new: !!intern });
  audit(b, me, { action: 'staffHR.update', entity: `staffHR/${uid}`, changes });
  await b.commit();
  return next;
}
export async function getMyLimit(uid) {
  const d = await getDoc(doc(db, 'advanceLimits', uid));
  return d.exists() ? Number(d.data().limit) || 0 : null;
}

// ---------------------------------------------------------------- Requests
const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.createdAt) - ms(a.createdAt) || String(b.ref).localeCompare(String(a.ref)));
export async function loadAdvances() { return rows(await getDocs(collection(db, 'advances'))); }
// Live list (6 Nov 2026, lib/use-live.js): new requests and status changes show without a refresh. Returns stop().
export const watchAdvances = (onRows, onError) => listen(collection(db, 'advances'), r => onRows([...r].sort(byNewest)), { onError });
const byNewest = (a, b) => ms(b.createdAt) - ms(a.createdAt) || String(b.ref).localeCompare(String(a.ref));
export async function loadMyAdvances(uid) { return rows(await getDocs(query(collection(db, 'advances'), where('uid', '==', uid)))); }

export async function createAdvance(me, limit, { amount, reason }) {
  const a = money(amount), r = clean(reason);
  if (me.intern) throw new Error('Salary advances are not available for interns.');
  if (!(a > 0)) throw new Error('Enter the amount you need.');
  if (limit == null || !(limit > 0)) throw new Error('HR has not set up your salary details yet. Ask HR first.');
  if (a > limit) throw new Error(`The most you can ask for is RM ${limit.toFixed(2)} (50% of your monthly salary).`);
  if (!r) throw new Error('Give a reason.');
  const ref = doc(collection(db, 'advances'));
  const no = await runTransaction(db, async tx => {
    const counter = doc(db, 'counters', 'advances');
    const cs = await tx.get(counter);
    const n = cs.exists() ? cs.data().next || 1 : 1;
    const no = 'SA-' + String(n).padStart(4, '0');
    tx.set(counter, { next: n + 1 });
    tx.set(ref, { ref: no, uid: me.user.uid, name: me.name || '', amount: a, reason: r, status: 'submitted',
      history: [step(me, 'submitted')], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    audit(tx, me, { action: 'advance.create', entity: `advances/${ref.id}`, changes: [{ field: 'ref', old: null, new: no }] });
    return no;
  });
  tellHR({ id: ref.id }, `New salary advance request ${no}`, `${me.name || 'A staff member'} asked for a salary advance. Open it to review.`);
  return no;
}

// ---- HR makes the form for a staff member (5 Nov 2026): no request first, straight to Waiting for staff signature.
// The staff member signs the paper copy (sent on WhatsApp); HR then marks it signed outside the PMS as usual.
// Who can get one: active, not interns, not HR themselves, with IC and salary on HR details.
export async function loadFormStaff(myUid) {
  const [snap, hr] = await Promise.all([getDocs(collection(db, 'users')), loadStaffHR()]);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(u => u.active !== false && u.intern !== true && u.id !== myUid && hr[u.id]?.ic && hr[u.id]?.salary > 0)
    .map(u => ({ id: u.id, name: u.displayName || u.email || '', role: u.role, dept: deptOf(u.role), hr: hr[u.id] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
export async function createByHR(me, staff, { amount, reason, description, told, sig }) {
  const a = money(amount), r = clean(reason), dsc = String(description || '').trim().slice(0, 1000), hr = staff?.hr;
  if (!staff) throw new Error('Pick the staff member.');
  if (staff.id === me.user.uid) throw new Error("You can't make a form for yourself.");
  if (!hr || !(hr.salary > 0) || !hr.ic) throw new Error("Add this staff member's IC number and salary on HR details first.");
  const limit = limitOf(hr.salary);
  if (!(a > 0)) throw new Error('Enter the total.');
  if (a > limit) throw new Error(`The most is RM ${limit.toFixed(2)} (50% of the salary).`);
  if (!r) throw new Error('Give a reason.');
  if (!sig?.image) throw new Error('There is no saved signature yet. Add it on the Signature tab first.');
  const signer = sig.signerName || DEFAULT_SIGNER, date = todayIso();
  if (!told) throw new Error(`Tick that ${signer} has been told.`);
  const ref = doc(collection(db, 'advances'));
  const form = await runTransaction(db, async tx => {
    const counter = doc(db, 'counters', 'advances');
    const cs = await tx.get(counter);
    const n = cs.exists() ? cs.data().next || 1 : 1;
    const no = 'SA-' + String(n).padStart(4, '0');
    tx.set(counter, { next: n + 1 });
    tx.set(ref, { ref: no, uid: staff.id, name: staff.name, amount: a, reason: r, ...(dsc ? { description: dsc } : {}), status: 'reviewed', byHR: true,
      approvedAmount: a, reviewedAt: serverTimestamp(), reviewedBy: me.user.uid, reviewedByName: me.name || '', reviewedDate: date,
      chloeTold: { by: me.user.uid, byName: me.name || '', at: serverTimestamp(), signerName: signer },
      history: [step(me, 'hrCreated')], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    const form = { ref: no, uid: staff.id, name: staff.name, ic: hr.ic, position: staff.dept || hr.position || '', salary: money(hr.salary), limit,
      amount: a, approvedAmount: a, reason: r, description: dsc, requestDate: null, byHR: true,
      formNote: '', approvedDate: date, preparedByName: me.name || '', signerName: signer, signature: sig.image,
      createdAt: serverTimestamp(), createdBy: me.user.uid };
    tx.set(doc(db, 'advances', ref.id, 'form', 'main'), form);
    tx.set(doc(db, 'signatureUses', ref.id), { advanceId: ref.id, ref: no, staffName: staff.name, signerName: signer,
      createdBy: me.user.uid, createdByName: me.name || '', at: serverTimestamp() });
    audit(tx, me, { action: 'advance.hrCreated', entity: `advances/${ref.id}`, changes: [{ field: 'ref', old: null, new: no }] });
    return form;
  });
  return { id: ref.id, form };
}

// Common shape of every step: status (unchanged for a copy upload), one history line, the step's own fields, an audit entry.
function move(b, me, a, to, extra, { action = to, note = '' } = {}) {
  b.update(doc(db, 'advances', a.id), { status: to, history: [...(a.history || []), step(me, action, note)], updatedAt: serverTimestamp(), ...extra });
  audit(b, me, { action: `advance.${action}`, entity: `advances/${a.id}`, changes: [{ field: 'status', old: a.status, new: to }] });
}

export async function withdrawAdvance(me, a) {
  if (a.status !== 'submitted') throw new Error('Only a request still waiting for HR can be withdrawn.');
  const b = writeBatch(db);
  move(b, me, a, 'withdrawn', { withdrawnAt: serverTimestamp() });
  await b.commit();
  tellHR(a, `Salary advance ${a.ref} was withdrawn`, `${a.name || 'The staff member'} withdrew the request.`);
}

// HR, at submitted or signed
export async function rejectAdvance(me, a, reason) {
  const r = clean(reason);
  if (!['submitted', 'signed'].includes(a.status)) throw new Error('This request can no longer be rejected.');
  if (!r) throw new Error('Give the reason (the staff member sees it).');
  const b = writeBatch(db);
  move(b, me, a, 'rejected', { rejectReason: r, rejectedAt: serverTimestamp(), rejectedBy: me.user.uid, rejectedByName: me.name || '' }, { note: r });
  await b.commit();
  tellStaff(a, `Your salary advance ${a.ref} was not approved`, "Open My advances to read HR's reason.");
}

// Review: amount, Director told, and the form (with her signature) made for the staff member to sign. One batch with the
// frozen form and the signature-use line. hr = the staff member's staffHR record; sig = signatures/director.
export async function reviewAdvance(me, a, { approvedAmount, formNote, told, hr, sig, dept }) {
  const amt = money(approvedAmount), limit = limitOf(hr?.salary);
  if (!hr || !(hr.salary > 0)) throw new Error('This staff member has no salary on HR details. Add it first.');
  if (!hr.ic) throw new Error("Add this staff member's IC number on HR details first (it goes on the form).");
  if (!(amt > 0)) throw new Error('Enter the amount to approve.');
  if (amt > limit) throw new Error(`The most that can be approved is RM ${limit.toFixed(2)} (50% of the salary).`);
  if (!sig?.image) throw new Error('There is no saved signature yet. Add it on the Signature tab first.');
  if (!told) throw new Error(`Tick that ${sig.signerName || DEFAULT_SIGNER} has been told.`);
  const signer = sig.signerName || DEFAULT_SIGNER, date = todayIso();
  const b = writeBatch(db);
  move(b, me, a, 'reviewed', {
    approvedAmount: amt, reviewedAt: serverTimestamp(), reviewedBy: me.user.uid, reviewedByName: me.name || '', reviewedDate: date,
    chloeTold: { by: me.user.uid, byName: me.name || '', at: serverTimestamp(), signerName: signer }
  });
  b.set(doc(db, 'advances', a.id, 'form', 'main'), {
    ref: a.ref, uid: a.uid, name: a.name || '', ic: hr.ic, position: dept || hr.position || '', salary: money(hr.salary), limit,
    amount: money(a.amount), approvedAmount: amt, reason: a.reason || '', requestDate: a.createdAt || null,
    formNote: clean(formNote), approvedDate: date, preparedByName: me.name || '', signerName: signer, signature: sig.image,
    createdAt: serverTimestamp(), createdBy: me.user.uid
  });
  b.set(doc(db, 'signatureUses', a.id), { advanceId: a.id, ref: a.ref, staffName: a.name || '', signerName: signer,
    createdBy: me.user.uid, createdByName: me.name || '', at: serverTimestamp() });
  await b.commit();
  tellStaff(a, `Please sign your salary advance form ${a.ref}`, 'Open My advances: sign it on screen, or download it, sign it and upload a scan or photo.');
}

// Staff sign: method 'drawn' (image = the signature drawn on screen) or 'upload' (image = scan (PDF) or photo of the signed paper form)
export async function signAdvance(me, a, method, im) {
  if (a.status !== 'reviewed') throw new Error('This form is not waiting for your signature.');
  if (a.byHR) throw new Error('HR made this form: sign the paper copy HR sent you and return it to HR.');
  if (!['drawn', 'upload'].includes(method) || !im?.data) throw new Error(method === 'drawn' ? 'Sign in the box first.' : 'Choose the signed form (PDF or photo) first.');
  const b = writeBatch(db);
  b.set(doc(db, 'advances', a.id, 'signed', 'main'), imageDoc(me, im, { method }));
  move(b, me, a, 'signed', { signMethod: method, signedAt: serverTimestamp() });
  await b.commit();
  tellHR(a, `${a.name || 'The staff member'} signed salary advance ${a.ref}`, 'Open it to approve.');
}

// HR: the staff member signed outside the PMS; the fully signed document is required
export async function markSignedOutside(me, a, im) {
  if (a.status !== 'reviewed') throw new Error('This form is not waiting for a signature.');
  if (!im?.data) throw new Error('Upload the fully signed document first.');
  if (fileKind(im.data) !== 'PDF') throw new Error('The fully signed document must be a PDF.');
  const b = writeBatch(db);
  b.set(doc(db, 'advances', a.id, 'signed', 'main'), { method: 'outside', by: me.user.uid, byName: me.name || '', at: serverTimestamp() });
  b.set(doc(db, 'advances', a.id, 'signed', 'copy'), imageDoc(me, im));
  move(b, me, a, 'signed', { signMethod: 'outside', signedAt: serverTimestamp(), signedCopyAt: serverTimestamp() }, { action: 'signedOutside' });
  await b.commit();
  tellStaff(a, `HR recorded your signed form for ${a.ref}`, 'Open My advances for the details.');
}

// HR: add or replace the fully signed document later (signed, approved or paid). Status stays the same.
export async function uploadSignedCopy(me, a, im) {
  if (!['signed', 'approved', 'paid'].includes(a.status)) throw new Error('The form has not been signed yet.');
  if (!im?.data) throw new Error('Choose the fully signed document first.');
  const b = writeBatch(db);
  b.set(doc(db, 'advances', a.id, 'signed', 'copy'), imageDoc(me, im));
  move(b, me, a, a.status, { signedCopyAt: serverTimestamp() }, { action: 'copy' });
  await b.commit();
}

export async function approveAdvance(me, a) {
  if (a.status !== 'signed') throw new Error('Only a signed form can be approved.');
  const b = writeBatch(db);
  move(b, me, a, 'approved', { approvedAt: serverTimestamp(), approvedBy: me.user.uid, approvedByName: me.name || '' });
  await b.commit();
  tellStaff(a, `Your salary advance ${a.ref} is approved`, 'It is now pending payment.');
}

// HR: paid, with the payment type, date and a screenshot (HR and Directors only)
export async function markPaid(me, a, { paidDate, paymentType, im }) {
  if (a.status !== 'approved') throw new Error('Only an approved advance can be marked paid.');
  if (!PAY_TYPES[paymentType]) throw new Error('Pick the payment type.');
  if (!paidDate) throw new Error('Pick the date it was paid.');
  if (!im?.data) throw new Error('Add the payment screenshot.');
  const b = writeBatch(db);
  b.set(doc(db, 'advances', a.id, 'payment', 'main'), imageDoc(me, im));
  move(b, me, a, 'paid', { paidDate, paymentType, paidAt: serverTimestamp(), paidBy: me.user.uid, paidByName: me.name || '' });
  await b.commit();
  tellStaff(a, `Salary advance ${a.ref} has been paid`, `Paid by ${PAY_TYPES[paymentType]}. Open My advances for the details.`);
}

const one = async (...path) => { const d = await getDoc(doc(db, ...path)); return d.exists() ? d.data() : null; };
export const loadForm = id => one('advances', id, 'form', 'main');
export const loadSigned = id => one('advances', id, 'signed', 'main');
export const loadSignedCopy = id => one('advances', id, 'signed', 'copy');
export const loadPayment = id => one('advances', id, 'payment', 'main');

// ---------------------------------------------------------------- HR notes
export async function loadNotes(id) {
  const snap = await getDocs(query(collection(db, 'advances', id, 'notes'), orderBy('createdAt')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function addNote(me, a, text) {
  const t = clean(text);
  if (!t) throw new Error('Write a note first.');
  const b = writeBatch(db);
  b.set(doc(collection(db, 'advances', a.id, 'notes')), { text: t, byName: me.name || '', byUid: me.user.uid, createdAt: serverTimestamp() });
  audit(b, me, { action: 'advance.note', entity: `advances/${a.id}`, changes: [{ field: 'note', old: null, new: 'added' }] });
  await b.commit();
  return { text: t, byName: me.name || '', byUid: me.user.uid, createdAt: null };
}

// ---------------------------------------------------------------- Signature
export const loadSignature = () => one('signatures', 'director');
export async function saveSignature(me, before, { signerName, image }) {
  const name = String(signerName || '').trim().slice(0, 100);
  if (!name) throw new Error('Enter the name printed under the signature.');
  if (!image?.data && !before?.image) throw new Error('Choose the signature image.');
  const b = writeBatch(db);
  b.set(doc(db, 'signatures', 'director'), { signerName: name, image: image?.data || before.image,
    updatedAt: serverTimestamp(), updatedBy: me.user.uid, updatedByName: me.name || '' });
  const changes = [];
  if (!before || before.signerName !== name) changes.push({ field: 'signerName', old: before?.signerName || null, new: name });
  if (image?.data) changes.push({ field: 'image', old: before?.image ? 'set' : null, new: 'replaced' });
  audit(b, me, { action: 'signature.update', entity: 'signatures/director', changes });
  await b.commit();
}
export async function loadSignatureUses() {
  const snap = await getDocs(collection(db, 'signatureUses'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.at) - ms(a.at));
}

// A saved image (data URL) as a file download
// PDF or image? (documents can be either since 5 Nov 2026)
export const fileKind = dataUrl => String(dataUrl || '').startsWith('data:application/pdf') ? 'PDF' : 'IMG';
export function imageFile(dataUrl, name) {
  const [head, b64] = String(dataUrl).split(',');
  const type = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { name: `${name}.${type.includes('pdf') ? 'pdf' : type.includes('png') ? 'png' : 'jpg'}`, blob: new Blob([bytes], { type }) };
}
