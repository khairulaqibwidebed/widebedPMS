// lib/agreements/drive.js — files (templates, IC copies, finished agreements) live in a Google Drive folder.
// The browser talks to a small Apps Script web app (apps-script/Code.gs) that runs under the company Google
// account. Every call carries the person's Firebase sign-in, and the script checks it against their staff record.
import { auth } from '@/lib/firebase.js';
import { bytesToBase64, base64ToBytes } from './bytes.js';

export const DRIVE_URL = import.meta.env.VITE_AGREEMENTS_DRIVE_URL || '';
export const MAX_UPLOAD = 15 * 1024 * 1024;
export const driveReady = () => !!DRIVE_URL;

export async function call(action, body) {
  if (!DRIVE_URL) throw new Error('Google Drive isn\'t connected yet. Add VITE_AGREEMENTS_DRIVE_URL (see apps-script/SETUP.md).');
  if (!auth.currentUser) throw new Error('Sign in again to use files.');
  const idToken = await auth.currentUser.getIdToken();
  let res;
  // Sent as plain text so the browser makes a simple request (Apps Script can't answer a CORS preflight).
  try { res = await fetch(DRIVE_URL, { method: 'POST', body: JSON.stringify({ action, idToken, ...body }) }); }
  catch (_) { throw new Error('Couldn\'t reach Google Drive. Check the internet connection and try again.'); }
  let data;
  try { data = await res.json(); } catch (_) { throw new Error('Google Drive sent back something unexpected. Check the Apps Script is deployed for "Anyone".'); }
  if (!data.ok) throw new Error(data.error || 'Google Drive refused the request.');
  return data;
}

// kind: 'templates' (setup staff only), 'attachments' or 'agreements'.
export async function uploadBytes(kind, bytes, name, mime) {
  if (bytes.length > MAX_UPLOAD) throw new Error('This file is larger than 15 MB.');
  const r = await call('upload', { kind, name, mime, data: bytesToBase64(bytes) });
  return { id: r.id, name: r.name, mime: r.mime, size: r.size };
}

// Files don't change once uploaded, so each is fetched once per visit.
const cache = new Map();
export function loadFile(id) {
  if (!cache.has(id)) {
    cache.set(id, call('get', { id })
      .then(r => ({ bytes: base64ToBytes(r.data), mime: r.mime, name: r.name }))
      .catch(e => { cache.delete(id); throw e; }));
  }
  return cache.get(id);
}

// ---- Master files (Word / Google Docs in "Master File (DO NOT EDIT)") ----
// A Word file (bytes) or a Google Docs link becomes a Google Doc in the master folder: { docId, url, name }.
export async function importMaster({ name, bytes, mime, docUrl }) {
  if (bytes && bytes.length > MAX_UPLOAD) throw new Error('This file is larger than 15 MB.');
  return call('masterImport', docUrl ? { name, docUrl } : { name, mime, data: bytesToBase64(bytes) });
}
// A working copy to edit in Google Docs: { copyId, url, shared: 'you' | 'link' }.
export const editMaster = docId => call('masterEdit', { docId });
// mode: 'copy' | 'replace' | 'discard'.
export const finishMaster = (mode, { docId, copyId, name }) => call('masterFinish', { mode, docId, copyId, name });
// The master as a PDF in Templates: { id, name }.
export const masterToPdf = (docId, name) => call('masterPdf', { docId, name });
export async function masterAsWord(docId) {
  const r = await call('masterWord', { docId });
  return { bytes: base64ToBytes(r.data), name: r.name, mime: r.mime };
}
