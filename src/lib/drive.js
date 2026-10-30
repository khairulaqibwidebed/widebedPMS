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
export const listFiles = (kind, recordId, label = '') => call({ action: 'list', kind, recordId, label });

// Sends one file straight from the browser to Drive. onProgress gets 0..1.
const parse = t => { try { return JSON.parse(t); } catch { return {}; } };
export async function uploadFile(kind, recordId, file, onProgress = () => {}, label = '') {
  const { uploadUrl, folderLink } = await call({ action: 'session', kind, recordId, name: file.name, mimeType: file.type, label });
  const file_ = await new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', uploadUrl);
    x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve(parse(x.responseText)) : reject(new Error(`Drive upload failed (${x.status}).`)));
    x.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    x.send(file);
  });
  return Object.assign(new String(folderLink), { file: file_ });
}

// The file as a blob URL for the in-site viewer (images, PDFs and small videos; the server refuses files over 4 MB)
export async function fileBlob(kind, fileId) {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Sign in again.');
  const r = await fetch('/api/drive', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ action: 'file', kind, fileId }) });
  if (!r.ok) { let j = {}; try { j = await r.json(); } catch { /* ignore */ } throw new Error(j.error || `Could not open the file (${r.status}).`); }
  return URL.createObjectURL(await r.blob());
}

// Uploads files into this month's folder of this kind (inside a record folder when recordId is given) and gives back [{ name, url }] for pages that keep links.
export async function uploadForLink(kind, files, onProgress = () => {}, recordId = '', label = '') {
  const out = [];
  for (const [i, f] of files.entries()) {
    const r = await uploadFile(kind, recordId, f, p => onProgress((i + p) / files.length), label);
    out.push({ name: r.file?.name || f.name, url: r.file?.webViewLink || String(r), id: r.file?.id || '', mimeType: r.file?.mimeType || f.type });
  }
  return out;
}

// Drive file id from a link like https://drive.google.com/file/d/<id>/view
export const driveId = url => (/\/d\/([A-Za-z0-9_-]{10,})/.exec(url || '') || [])[1] || '';
// Saves a file from the app to the person's computer
export async function downloadFile(kind, fileId, name) {
  const u = await fileBlob(kind, fileId), a = document.createElement('a');
  a.href = u; a.download = name || 'file'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}
