// lib/drive.js: file uploads to the company Google Drive through /api/drive (a Vercel function with a service account).
import { getAuth } from 'firebase/auth';

async function call(body) {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Sign in again.');
  const r = await fetch('/api/drive', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify(body) });
  let j = {};
  try { j = await r.json(); } catch { /* not JSON, e.g. running on localhost without the function */ }
  if (!r.ok) throw new Error(j.error || (r.status === 404 ? 'File upload only works on the live site (the /api/drive function is not running here).' : `Upload service error (${r.status}).`));
  return j;
}

// Makes every page folder (with this month inside) once per visit
let setUp = false;
export const ensureFolders = () => { if (!setUp) { setUp = true; call({ action: 'setup' }).catch(() => { setUp = false; }); } };
export const removeFile = (kind, fileId) => call({ action: 'remove', kind, fileId });
export const listFiles = (kind, recordId, label = '') => call({ action: 'list', kind, recordId, label });
// 18 Nov 2026: a ticket's Drive folder, made if needed, without uploading: { folderId, folderLink, note }.
// extra = { propertyId, unit, date } as for uploads (customer tickets go to the unit's Maintenance folder).
export const ticketFolder = (recordId, label = '', extra = {}) => call({ ...extra, action: 'issueFolder', kind: 'issues', recordId, label });

// Sends one file straight from the browser to Drive. onProgress gets 0..1.
const parse = t => { try { return JSON.parse(t); } catch { return {}; } };
// extra (17 Nov 2026, Issues): { propertyId, unit, date } so the file goes to the unit's Maintenance folder in Owner Files
export async function uploadFile(kind, recordId, file, onProgress = () => {}, label = '', extra = {}) {
  const { uploadUrl, folderLink, note } = await call({ ...extra, action: 'session', kind, recordId, name: file.name, mimeType: file.type, label });
  const file_ = await new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', uploadUrl);
    x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve(parse(x.responseText)) : reject(new Error(`Drive upload failed (${x.status}).`)));
    x.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    x.send(file);
  });
  return Object.assign(new String(folderLink), { file: file_, note: note || '' });
}

// The file as a blob URL for the in-site viewer (images, PDFs and small videos; the server refuses files over 4 MB)
// recordId: needed for staff complaint files (the server checks you can read that complaint)
export async function fileBlob(kind, fileId, recordId = '') {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Sign in again.');
  const r = await fetch('/api/drive', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ action: 'file', kind, fileId, recordId }) });
  if (!r.ok) { let j = {}; try { j = await r.json(); } catch { /* ignore */ } throw new Error(j.error || `Could not open the file (${r.status}).`); }
  return URL.createObjectURL(await r.blob());
}

// Uploads files into this month's folder of this kind (inside a record folder when recordId is given) and gives back [{ name, url }] for pages that keep links.
// out.note: why the files went to Widebed PMS Files instead of Owner Files ('' when they didn't)
export async function uploadForLink(kind, files, onProgress = () => {}, recordId = '', label = '', extra = {}) {
  const out = [];
  for (const [i, f] of files.entries()) {
    const r = await uploadFile(kind, recordId, f, p => onProgress((i + p) / files.length), label, extra);
    out.note = r.note;
    out.folderLink = String(r);   // 18 Nov 2026: the folder the files went to (Issues keep it on the ticket)
    out.push({ name: r.file?.name || f.name, url: r.file?.webViewLink || String(r), id: r.file?.id || '', mimeType: r.file?.mimeType || f.type });
  }
  return out;
}

// Drive file id from a link like https://drive.google.com/file/d/<id>/view
export const driveId = url => (/\/d\/([A-Za-z0-9_-]{10,})/.exec(url || '') || [])[1] || '';
// Saves a file from the app to the person's computer
export async function downloadFile(kind, fileId, name, recordId = '') {
  const u = await fileBlob(kind, fileId, recordId), a = document.createElement('a');
  a.href = u; a.download = name || 'file'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}

// ---------- Owner Files (17 Nov 2026) ----------
// The folder id in a Drive link (https://drive.google.com/drive/folders/<id>?usp=... or ...?id=<id>), or a bare id
export const folderIdOf = v => {
  const s = String(v || '').trim();
  return (/\/folders\/([A-Za-z0-9_-]{10,})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s) || /^([A-Za-z0-9_-]{10,})$/.exec(s) || [])[1] || '';
};
// Is this a folder the PMS's Drive account can add to? { id, name, link }
export const checkFolder = folderId => call({ action: 'checkFolder', folderId });
// A property's folder: { link, why } (why: 'state' no state folder, 'folder' not found, 'property'). make: create it with Owner.
export const propertyFolder = (propertyId, make = false) => call({ action: 'propertyFolder', propertyId, make });
// Properties list: { status: { id: 'linked' | 'missing' | 'state' }, links } for [{ id, name, state }]
export const propertyLinks = properties => call({ action: 'propertyLinks', properties });
// A unit's folder under <property>/Owner: { link }
export const unitFolder = (propertyId, unit) => call({ action: 'unitFolder', propertyId, unit });
// Read-only check of a state's properties: [{ id, name, units: [codes] }] -> { properties: [{ id, link, folderName, ownerLink, units: { code: link } }] }
export const linkCheck = (state, properties) => call({ action: 'linkCheck', state, properties });
// Unit folders in each property's own style (17 Nov 2026). properties = [{ id, units: [every unit code], only: [codes to make] }]
// unitPlan: the preview, nothing made: { properties: [{ id, name, path: [{ name, new }], style: { example }, create: [{ unit, name }], skip }] }
// makeUnitFolders: makes them: { made: [{ id, unit, name, link }] }
export const unitPlan = properties => call({ action: 'unitPlan', properties });
export const makeUnitFolders = properties => call({ action: 'makeUnitFolders', properties });
