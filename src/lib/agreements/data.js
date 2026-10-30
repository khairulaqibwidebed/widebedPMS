// lib/agreements/data.js — every Firestore read and write for Agreements, in one place.
//
// agreementForms/{id}      { name, fields: [...], archived }               form fields, formulas, column-only fields
// agreementTemplates/{id}  { name, formId, version, fileId, fileName, pages, versions: [...], mappings: [...], archived }
// agreementRecords/{id}    { formId, title, status: draft|submitted|completed|archived, values: { fieldId: value }, source? }
// agreementMasters/{id}    { name, docId, url, versions: [...], editing: { copyId, url, by, byName, at } | null, archived }
// agreementLinks/{slug}    { slug, kind: open|personal, formId, templateId, recordId?, title, intro, passSalt, passHash,
//                            active, expiresAt, lockFilled, allowDownload, submissions, submittedAt? }
// agreementViews/{id}      { formId, name, view: { order, hidden, widths, sort, filters, search } }
// generatedAgreements/{id} { recordId, formId, templateId, templateName, templateVersion, fileId, fileName, title, by, at }
//
// Formula answers are never saved: they are worked out from the values each time, so a changed formula updates
// every record. A generated PDF keeps the values it was made with.
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, query, where, serverTimestamp, writeBatch, getCountFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { useSession } from '@/stores/session.js';

const me = () => useSession();
function stamp(created) {
  const s = me();
  const base = { updatedAt: serverTimestamp(), updatedBy: s.user.uid, updatedByName: s.name };
  return created ? { ...base, createdAt: serverTimestamp(), createdBy: s.user.uid, createdByName: s.name } : base;
}
const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
const one = async ref => { const s = await getDoc(ref); return s.exists() ? { id: s.id, ...s.data() } : null; };
export const millis = t => (t?.toMillis ? t.toMillis() : typeof t === 'number' ? t : 0);
const byName = (a, b) => String(a.name).localeCompare(String(b.name));
const byUpdated = (a, b) => millis(b.updatedAt) - millis(a.updatedAt);

// ---- Forms ----
export const listForms = async () => rows(await getDocs(collection(db, 'agreementForms'))).filter(f => !f.archived).sort(byName);
export const getForm = id => one(doc(db, 'agreementForms', id));
export async function createForm(name, fields = []) {
  const ref = doc(collection(db, 'agreementForms'));
  await setDoc(ref, { name, fields, archived: false, ...stamp(true) });
  audit('agreement.form.create', `agreementForms/${ref.id}`, name);
  return ref.id;
}
export const saveForm = (id, patch) => updateDoc(doc(db, 'agreementForms', id), { ...patch, ...stamp() });

// ---- Templates ----
export async function listTemplates(formId) {
  const q = formId ? query(collection(db, 'agreementTemplates'), where('formId', '==', formId)) : collection(db, 'agreementTemplates');
  return rows(await getDocs(q)).filter(t => !t.archived).sort(byName);
}
export const getTemplate = id => one(doc(db, 'agreementTemplates', id));
// file = { id, name, pages } from uploadTemplateFile.
// masterId: the master file (Google Doc) the PDF was made from, so it can be updated from it later.
export async function createTemplate({ name, formId, file, mappings = [], masterId = '' }) {
  const s = me(), ref = doc(collection(db, 'agreementTemplates'));
  const version = { v: 1, fileId: file.id, fileName: file.name, pages: file.pages, at: Date.now(), byName: s.name };
  await setDoc(ref, { name, formId, masterId, version: 1, fileId: file.id, fileName: file.name, pages: file.pages, versions: [version], mappings, archived: false, ...stamp(true) });
  audit('agreement.template.create', `agreementTemplates/${ref.id}`, name);
  return ref.id;
}
export const saveTemplate = (id, patch) => updateDoc(doc(db, 'agreementTemplates', id), { ...patch, ...stamp() });
// A new file for a template: the old versions stay, so agreements made earlier are unaffected.
export async function addTemplateVersion(t, file) {
  const s = me(), v = Math.max(0, ...(t.versions || []).map(x => x.v)) + 1;
  const version = { v, fileId: file.id, fileName: file.name, pages: file.pages, at: Date.now(), byName: s.name };
  const patch = { version: v, fileId: file.id, fileName: file.name, pages: file.pages, versions: [...(t.versions || []), version] };
  await saveTemplate(t.id, patch);
  audit('agreement.template.version', `agreementTemplates/${t.id}`, `${t.name}: version ${v} (${file.name})`);
  return { ...t, ...patch };
}
export async function restoreTemplateVersion(t, v) {
  const x = (t.versions || []).find(y => y.v === v);
  const patch = { version: x.v, fileId: x.fileId, fileName: x.fileName, pages: x.pages };
  await saveTemplate(t.id, patch);
  audit('agreement.template.restore', `agreementTemplates/${t.id}`, `${t.name}: back to version ${v}`);
  return { ...t, ...patch };
}

// ---- Records ----
export const listRecords = async formId => rows(await getDocs(query(collection(db, 'agreementRecords'), where('formId', '==', formId)))).sort(byUpdated);
export const getRecord = id => one(doc(db, 'agreementRecords', id));
export async function createRecord(formId, values, extra = {}) {
  const ref = doc(collection(db, 'agreementRecords'));
  await setDoc(ref, { formId, values, status: 'draft', title: 'Untitled', ...extra, ...stamp(true) });
  return ref.id;
}
// patch may use paths like { 'values.f_abc': 1500 }.
export const updateRecord = (id, patch) => updateDoc(doc(db, 'agreementRecords', id), { ...patch, ...stamp() });
export async function createRecords(formId, list) {
  for (let i = 0; i < list.length; i += 400) {
    const batch = writeBatch(db);
    for (const r of list.slice(i, i + 400)) batch.set(doc(collection(db, 'agreementRecords')), { formId, status: 'draft', ...r, ...stamp(true) });
    await batch.commit();
  }
  audit('agreement.record.import', `agreementForms/${formId}`, `${list.length} rows imported`);
}

// Record counts per status without reading the records (cheap on the free plan).
export async function countRecords(formId, status) {
  const parts = [where('formId', '==', formId)];
  if (status) parts.push(where('status', '==', status));
  return (await getCountFromServer(query(collection(db, 'agreementRecords'), ...parts))).data().count;
}

// ---- Master files ----
export const listMasters = async () => rows(await getDocs(collection(db, 'agreementMasters'))).filter(m => !m.archived).sort(byName);
export const getMaster = id => one(doc(db, 'agreementMasters', id));
export async function createMaster({ name, docId, url, source }) {
  const ref = doc(collection(db, 'agreementMasters'));
  await setDoc(ref, { name, docId, url, source: source || '', versions: [], editing: null, archived: false, ...stamp(true) });
  audit('agreement.master.create', `agreementMasters/${ref.id}`, name);
  return ref.id;
}
export const saveMaster = (id, patch) => updateDoc(doc(db, 'agreementMasters', id), { ...patch, ...stamp() });

// ---- Fill-in links (the link name is the document id, so names are unique) ----
export const listLinks = async formId => rows(await getDocs(query(collection(db, 'agreementLinks'), where('formId', '==', formId))))
  .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
export const getLink = slug => one(doc(db, 'agreementLinks', slug));
export async function createLink(slug, data) {
  await setDoc(doc(db, 'agreementLinks', slug), { slug, active: true, submissions: 0, ...data, ...stamp(true) });
  audit('agreement.link.create', `agreementLinks/${slug}`, `${data.kind} link for ${data.formId}`);
}
export const saveLink = (slug, patch) => updateDoc(doc(db, 'agreementLinks', slug), { ...patch, ...stamp() });

// ---- Saved table views ----
export const listViews = async formId => rows(await getDocs(query(collection(db, 'agreementViews'), where('formId', '==', formId)))).sort(byName);
export async function saveView(id, data) {
  const ref = id ? doc(db, 'agreementViews', id) : doc(collection(db, 'agreementViews'));
  await setDoc(ref, { ...data, ...stamp(!id) }, { merge: true });
  return ref.id;
}
export const deleteView = id => deleteDoc(doc(db, 'agreementViews', id));

// ---- Generated agreements (history) ----
export const listGenerated = async recordId => rows(await getDocs(query(collection(db, 'generatedAgreements'), where('recordId', '==', recordId))))
  .sort((a, b) => millis(b.at) - millis(a.at));
export async function addGenerated(data) {
  const s = me();
  await addDoc(collection(db, 'generatedAgreements'), { ...data, by: s.user.uid, byName: s.name, at: serverTimestamp() });
  audit('agreement.generate', `agreementRecords/${data.recordId}`, `${data.templateName} v${data.templateVersion} → ${data.fileName}`);
}

// ---- Audit log (same collection as the rest of the PMS) ----
export async function audit(action, entity, details = '') {
  try {
    const s = me();
    await addDoc(collection(db, 'auditLog'), { at: serverTimestamp(), uid: s.user.uid, userName: s.name, role: s.role, action, entity, changes: [], reason: String(details).slice(0, 300) });
  } catch (e) { console.warn('audit', e); }
}
