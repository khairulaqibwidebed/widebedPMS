// POST /api/drive   Authorization: Bearer <Firebase ID token>
//   { action: 'session', kind, recordId, name, mimeType }  -> { uploadUrl, folderId, folderLink }
//       Makes (or finds) the folder <root>/<kind>/<recordId> and opens a resumable upload. The browser then PUTs the file to uploadUrl.
//   { action: 'file', kind, fileId }                        -> the file's bytes (max 4 MB) for the in-site viewer and downloads
//   { action: 'list', kind, recordId }                      -> { folderLink, files: [{ id, name, mimeType, size, link }] }
// Company Drive (11 Nov 2026): DRIVE_SCRIPT_URL + DRIVE_SCRIPT_KEY. A small Apps Script under the company account
// (apps-script-uploads/Code.gs, set up like Neo's Agreements script) hands this function a Drive access token and the
// uploads folder ID; everything else below works as before. When those two are set, the GOOGLE_* and DRIVE_ROOT_FOLDER_ID
// settings are not used.
// HR's Drive (11 Nov 2026): kind 'complaints' (documents on staff complaints) goes to HR's own Google account through a
// second copy of the same script: DRIVE_HR_SCRIPT_URL + DRIVE_HR_SCRIPT_KEY. Only people who can read that complaint in
// Firestore (HR, and its sender) may upload, list or open its files; folders are named by the complaint ref only.
// Older options: GOOGLE_SERVICE_ACCOUNT_JSON (company: Shared Drive) or GOOGLE_OAUTH_CLIENT_ID/_SECRET/_REFRESH_TOKEN (testing on one person's Drive), DRIVE_ROOT_FOLDER_ID, FIREBASE_API_KEY. The folder must sit in a Shared Drive
// the service account is a member of. Anyone with a PMS login may use it; the files themselves stay inside the Shared Drive.
import { createSign } from 'node:crypto';

const KINDS = { 'offline-payments': 'Offline Payments', 'utility-bills': 'Utility Bills',
  expenses: 'Expenses', issues: 'Issues', listings: 'New Owner Listings', sops: 'HR SOPs', 'owner-payments': 'Owner Payments',
  announcements: 'HR Announcements', complaints: 'Staff Complaints' };
// Which Google account an area uses: 'hr' = HR's own Drive (DRIVE_HR_SCRIPT_*), everything else the company Drive.
const ACCOUNT = { complaints: 'hr' };
const acctOf = kind => ACCOUNT[kind] || 'main';
// Areas where only some roles may upload or remove (5 Nov 2026). Everyone signed in may still view and download.
const WRITERS = { announcements: ['hr', 'director'] };
const SAFE = /^[A-Za-z0-9_-]{1,64}$/;
const API = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const b64 = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

let cached = { token: '', exp: 0, root: '' };
const hrCached = { token: '', exp: 0, root: '' };
// A token from one of the Apps Scripts (apps-script-uploads/Code.gs): the company one, or HR's copy
async function scriptToken(url, key, into, who) {
  if (into.token && into.exp > Date.now() + 60000) return into.token;
  let j;
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'token', key: key || '' }) });
    j = await r.json();
  } catch { throw new HttpError(502, `Could not reach the ${who} Drive script. Check its URL and that it is deployed for "Anyone".`); }
  if (!j.ok || !j.token) throw new HttpError(500, `${who} Drive script: ${j.error || 'no token'}`);
  Object.assign(into, { token: j.token, exp: Date.now() + (j.expiresIn || 2700) * 1000, root: j.rootFolderId || '' });
  return into.token;
}
async function driveToken(acct = 'main') {
  if (acct === 'hr') {
    if (!process.env.DRIVE_HR_SCRIPT_URL) throw new HttpError(500, "HR's Drive is not connected yet (DRIVE_HR_SCRIPT_URL is not set).");
    return scriptToken(process.env.DRIVE_HR_SCRIPT_URL, process.env.DRIVE_HR_SCRIPT_KEY, hrCached, 'HR');
  }
  if (cached.token && cached.exp > Date.now() + 60000) return cached.token;
  // Company Drive through the uploads Apps Script
  if (process.env.DRIVE_SCRIPT_URL) return scriptToken(process.env.DRIVE_SCRIPT_URL, process.env.DRIVE_SCRIPT_KEY, cached, 'company');
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

// The uploads folder: from the company Drive script when it is used, otherwise DRIVE_ROOT_FOLDER_ID. Call after driveToken().
function rootId(acct = 'main') {
  if (acct === 'hr') { if (!hrCached.root) throw new HttpError(500, "HR's Drive script has no ROOT_FOLDER_ID."); return hrCached.root; }
  const root = process.env.DRIVE_SCRIPT_URL ? cached.root : process.env.DRIVE_ROOT_FOLDER_ID;
  if (!root) throw new HttpError(500, process.env.DRIVE_SCRIPT_URL ? 'The company Drive script has no ROOT_FOLDER_ID.' : 'DRIVE_ROOT_FOLDER_ID is not set on the server.');
  return root;
}

// Only signed-in PMS staff may call this
async function checkUser(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) throw new HttpError(401, 'Sign in again.');
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) throw new HttpError(500, 'FIREBASE_API_KEY is not set on the server.');
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: m[1] }) });
  if (!r.ok) throw new HttpError(401, 'Sign in again.');
  const uid = ((await r.json()).users || [])[0]?.localId;
  if (!uid) throw new HttpError(401, 'Sign in again.');
  return { uid, idToken: m[1] };
}

// The person's role from their own staff record (read with their own sign-in, so the Firestore rules apply).
// A switched-off record counts as no role, like the rules.
async function roleOf(user) {
  const project = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'widebed-pmsdashboard';
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/users/${user.uid}`, { headers: { Authorization: `Bearer ${user.idToken}` } });
  if (!r.ok) return null;
  const f = (await r.json()).fields || {};
  return f.active?.booleanValue === false ? null : f.role?.stringValue || null;
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
// Month folder name in Malaysia time, e.g. "2026-10 October", so folders sort by month
const monthName = () => { const d = new Date(Date.now() + 8 * 3600e3); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')} ${['January','February','March','April','May','June','July','August','September','October','November','December'][d.getUTCMonth()]}`; };
// Root / Page / Month / [record]. Pages that keep one folder per record (recordId) get it inside the month; the others put files straight in the month.
async function recordFolder(tok, kind, recordId, label = '') {
  const root = rootId(acctOf(kind));
  if (!KINDS[kind]) throw new HttpError(400, 'Unknown folder type.');
  if (recordId && !SAFE.test(recordId)) throw new HttpError(400, 'Bad record id.');
  const kindId = await folder(tok, root, KINDS[kind]);
  const monthId = await folder(tok, kindId, monthName());
  if (!recordId) return monthId;
  // Named "<label> (<last 5 of id>)"; found again by the id part so a changed label never makes a second folder
  const tag = recordId.slice(-5), clean = String(label || '').replace(/[\\/'"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const url = `${API}/files?q=${encodeURIComponent(`'${monthId}' in parents and name contains '(${tag})' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const found = (await (await g(url, tok)).json()).files?.[0];
  if (found) return found.id;
  return folder(tok, monthId, `${clean || kind} (${tag})`);
}

// Staff complaint files: the person must be able to read complaints/{recordId} under the Firestore rules (HR, or the
// complaint's sender), and it must be a staff complaint. Read with their own sign-in, so the rules decide.
async function checkComplaint(user, recordId, action) {
  if (!SAFE.test(recordId || '')) throw new HttpError(400, 'Bad complaint id.');
  const project = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'widebed-pmsdashboard';
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/complaints/${recordId}`, { headers: { Authorization: `Bearer ${user.idToken}` } });
  if (!r.ok) throw new HttpError(403, 'You cannot open files on this complaint.');
  const f = (await r.json()).fields || {};
  if (f.kind?.stringValue !== 'staff') throw new HttpError(403, 'Files can only be added to staff complaints.');
  if (action === 'session' && f.status?.stringValue === 'closed' && (await roleOf(user)) !== 'hr') throw new HttpError(403, 'This complaint is closed.');
  return f;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST only.');
    const user = await checkUser(req);
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (WRITERS[b.kind] && (b.action === 'session' || b.action === 'remove') && !WRITERS[b.kind].includes(await roleOf(user)))
      throw new HttpError(403, 'Only HR and Directors can add or remove files here.');
    const acct = acctOf(b.kind);
    if (acct === 'hr') {
      // Staff complaints: nothing is removed, and the folder is named by the ref only (never the sender)
      if (!['session', 'list', 'file'].includes(b.action)) throw new HttpError(403, 'Complaint files cannot be removed.');
      await checkComplaint(user, b.recordId, b.action);
      b.label = /^SC-\d{1,6}$/.test(String(b.label || '')) ? b.label : '';
    }
    const tok = await driveToken(acct);
    if (b.action === 'remove') {
      // Moves one file to the Drive trash (restorable there). Only files inside <root>/<kind>/ can be removed.
      if (!KINDS[b.kind] || !SAFE.test(b.fileId || '')) throw new HttpError(400, 'Bad request.');
      const root = rootId(acct);
      const kindId = await folder(tok, root, KINDS[b.kind]);
      let ok = false, ids = (await (await g(`${API}/files/${b.fileId}?fields=parents&supportsAllDrives=true`, tok)).json()).parents || [];
      for (let depth = 0; depth < 3 && !ok && ids.length; depth++) {
        ok = ids.includes(kindId);
        if (!ok) ids = (await (await g(`${API}/files/${ids[0]}?fields=parents&supportsAllDrives=true`, tok)).json()).parents || [];
      }
      if (!ok) throw new HttpError(403, 'That file is not in this area.');
      await g(`${API}/files/${b.fileId}?supportsAllDrives=true`, tok, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'file') {
      // One file back to a signed-in user (in-site viewer and downloads). Only files inside <root>/<kind>/ are served. Vercel caps a reply at ~4.5 MB.
      if (!KINDS[b.kind] || !SAFE.test(b.fileId || '')) throw new HttpError(400, 'Bad request.');
      const root = rootId(acct);
      const kindId = await folder(tok, root, KINDS[b.kind]);
      const meta = await (await g(`${API}/files/${b.fileId}?fields=name,mimeType,size,parents&supportsAllDrives=true`, tok)).json();
      // A complaint file must sit in that complaint's own folder ("SC-0013 (<last 5 of its id>)")
      if (acct === 'hr') {
        const p = meta.parents?.[0] && await (await g(`${API}/files/${meta.parents[0]}?fields=name&supportsAllDrives=true`, tok)).json();
        if (!p || !String(p.name || '').endsWith(`(${b.recordId.slice(-5)})`)) throw new HttpError(403, 'That file is not on this complaint.');
      }
      let ok = false, ids = meta.parents || [];
      for (let depth = 0; depth < 3 && !ok && ids.length; depth++) {
        ok = ids.includes(kindId);
        if (!ok) ids = (await (await g(`${API}/files/${ids[0]}?fields=parents&supportsAllDrives=true`, tok)).json()).parents || [];
      }
      if (!ok) throw new HttpError(403, 'That file is not in this area.');
      if (+meta.size > 4 * 1024 * 1024) throw new HttpError(413, 'Too large to preview here. Open it in Drive.');
      const data = Buffer.from(await (await g(`${API}/files/${b.fileId}?alt=media&supportsAllDrives=true`, tok)).arrayBuffer());
      res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
      return res.status(200).send(data);
    }
    if (b.action === 'setup') { // makes every page folder and this month's folder inside it
      const root = rootId(acct);
      for (const [k, name] of Object.entries(KINDS)) if (acctOf(k) === 'main') await folder(tok, await folder(tok, root, name), monthName());
      return res.status(200).json({ ok: true });
    }
    const folderId = await recordFolder(tok, b.kind, b.recordId, b.label);
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
