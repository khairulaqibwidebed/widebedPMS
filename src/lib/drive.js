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

export const listFiles = (kind, recordId) => call({ action: 'list', kind, recordId });

// Sends one file straight from the browser to Drive. onProgress gets 0..1.
export async function uploadFile(kind, recordId, file, onProgress = () => {}) {
  const { uploadUrl, folderLink } = await call({ action: 'session', kind, recordId, name: file.name, mimeType: file.type });
  await new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', uploadUrl);
    x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`Drive upload failed (${x.status}).`)));
    x.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    x.send(file);
  });
  return folderLink;
}

// The file as a blob URL for the in-site viewer (images, PDFs and small videos; the server refuses files over 4 MB)
export async function fileBlob(kind, recordId, fileId) {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Sign in again.');
  const r = await fetch('/api/drive', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ action: 'file', kind, recordId, fileId }) });
  if (!r.ok) { let j = {}; try { j = await r.json(); } catch { /* ignore */ } throw new Error(j.error || `Could not open the file (${r.status}).`); }
  return URL.createObjectURL(await r.blob());
}
