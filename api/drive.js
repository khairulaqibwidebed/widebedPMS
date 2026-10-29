// POST /api/drive   Authorization: Bearer <Firebase ID token>
//   { action: 'session', kind, recordId, name, mimeType }  -> { uploadUrl, folderId, folderLink }
//       Makes (or finds) the folder <root>/<kind>/<recordId> and opens a resumable upload. The browser then PUTs the file to uploadUrl.
//   { action: 'file', kind, fileId }                        -> the file's bytes (max 4 MB) for the in-site viewer and downloads
//   { action: 'list', kind, recordId }                      -> { folderLink, files: [{ id, name, mimeType, size, link }] }
// Needs env: GOOGLE_SERVICE_ACCOUNT_JSON (company: Shared Drive) or GOOGLE_OAUTH_CLIENT_ID/_SECRET/_REFRESH_TOKEN (testing on one person's Drive), DRIVE_ROOT_FOLDER_ID, FIREBASE_API_KEY. The folder must sit in a Shared Drive
// the service account is a member of. Anyone with a PMS login may use it; the files themselves stay inside the Shared Drive.
import { createSign } from 'node:crypto';

const KINDS = { 'offline-payments': 'Offline Payments', 'utility-bills': 'Utility Bills',
  expenses: 'Expenses', issues: 'Issues', listings: 'New Owner Listings', sops: 'HR SOPs' };
const SAFE = /^[A-Za-z0-9_-]{1,64}$/;
const API = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const b64 = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

let cached = { token: '', exp: 0 };
async function driveToken() {
  if (cached.token && cached.exp > Date.now() + 60000) return cached.token;
  // Testing mode: act as one person's own Google account (their refresh token), so files go to their personal Drive
  if (process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || '', client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '', refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN }) });
    const j = await r.json();
    if (!r.ok) throw new HttpError(500, `Google sign-in failed: ${j.error_description || j.error || r.status}`);
    cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
    return cached.token;
  }
  let key;
  try { key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || ''); } catch { throw new HttpError(500, 'GOOGLE_SERVICE_ACCOUNT_JSON is missing or not valid JSON.'); }
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' }), body = b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }) });
  const j = await r.json();
  if (!r.ok) throw new HttpError(500, `Google sign-in failed: ${j.error_description || j.error || r.status}`);
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

// Only signed-in PMS staff may call this
async function checkUser(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) throw new HttpError(401, 'Sign in again.');
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) throw new HttpError(500, 'FIREBASE_API_KEY is not set on the server.');
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: m[1] }) });
  if (!r.ok) throw new HttpError(401, 'Sign in again.');
}

async function g(path, tok, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { Authorization: `Bearer ${tok}`, ...(opts.headers || {}) } });
  if (!r.ok) { const t = await r.text(); throw new HttpError(502, `Drive refused this (${r.status}). ${t.slice(0, 200)}`); }
  return r;
}
const q = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// Finds a folder by name inside a parent, or makes it
async function folder(tok, parent, name) {
  const url = `${API}/files?q=${encodeURIComponent(`'${parent}' in parents and name='${q(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const found = (await (await g(url, tok)).json()).files?.[0];
  if (found) return found.id;
  const made = await g(`${API}/files?supportsAllDrives=true&fields=id`, tok, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }) });
  return (await made.json()).id;
}
async function recordFolder(tok, kind, recordId) {
  const root = process.env.DRIVE_ROOT_FOLDER_ID;
  if (!root) throw new HttpError(500, 'DRIVE_ROOT_FOLDER_ID is not set on the server.');
  if (!KINDS[kind]) throw new HttpError(400, 'Unknown folder type.');
  if (!SAFE.test(recordId || '')) throw new HttpError(400, 'Bad record id.');
  const kindId = await folder(tok, root, KINDS[kind]);
  return folder(tok, kindId, recordId);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST only.');
    await checkUser(req);
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const tok = await driveToken();
    if (b.action === 'file') {
      // One file back to a signed-in user (in-site viewer and downloads). Only files inside <root>/<kind>/ are served. Vercel caps a reply at ~4.5 MB.
      if (!KINDS[b.kind] || !SAFE.test(b.fileId || '')) throw new HttpError(400, 'Bad request.');
      const root = process.env.DRIVE_ROOT_FOLDER_ID;
      if (!root) throw new HttpError(500, 'DRIVE_ROOT_FOLDER_ID is not set on the server.');
      const kindId = await folder(tok, root, KINDS[b.kind]);
      const meta = await (await g(`${API}/files/${b.fileId}?fields=name,mimeType,size,parents&supportsAllDrives=true`, tok)).json();
      const parent = meta.parents?.[0] ? await (await g(`${API}/files/${meta.parents[0]}?fields=parents&supportsAllDrives=true`, tok)).json() : {};
      if (!(meta.parents || []).includes(kindId) && !(parent.parents || []).includes(kindId)) throw new HttpError(403, 'That file is not in this area.');
      if (+meta.size > 4 * 1024 * 1024) throw new HttpError(413, 'Too large to preview here. Open it in Drive.');
      const data = Buffer.from(await (await g(`${API}/files/${b.fileId}?alt=media&supportsAllDrives=true`, tok)).arrayBuffer());
      res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
      return res.status(200).send(data);
    }
    const folderId = await recordFolder(tok, b.kind, b.recordId);
    const folderLink = `https://drive.google.com/drive/folders/${folderId}`;
    if (b.action === 'session') {
      const name = String(b.name || 'file').replace(/[\\/]/g, '_').slice(0, 200);
      const r = await g(`${UPLOAD}/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink`, tok, { method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': b.mimeType || 'application/octet-stream', ...(req.headers.origin ? { Origin: req.headers.origin } : {}) },
        body: JSON.stringify({ name, parents: [folderId] }) });
      return res.status(200).json({ uploadUrl: r.headers.get('location'), folderId, folderLink });
    }
    if (b.action === 'list') {
      const url = `${API}/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&fields=files(id,name,mimeType,size,webViewLink,createdTime)&orderBy=createdTime desc&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      const files = (await (await g(url, tok)).json()).files || [];
      return res.status(200).json({ folderLink, files: files.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: +f.size || 0, link: f.webViewLink })) });
    }
    throw new HttpError(400, 'Unknown action.');
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Something went wrong.' });
  }
}
