// POST /api/drive   Authorization: Bearer <Firebase ID token>
//   { action: 'session', kind, recordId, name, mimeType }  -> { uploadUrl, folderId, folderLink }
//       Makes (or finds) the folder <root>/<kind>/<recordId> and opens a resumable upload. The browser then PUTs the file to uploadUrl.
//   { action: 'file', kind, fileId }                        -> the file's bytes (max 4 MB) for the in-site viewer and downloads
//   { action: 'list', kind, recordId }                      -> { folderLink, files: [{ id, name, mimeType, size, link }] }
//   { action: 'ocr', name, data }                           -> { text } of a printed (picture-only) PDF, read by Drive (24 Nov 2026)
// Company Drive (11 Nov 2026): DRIVE_SCRIPT_URL + DRIVE_SCRIPT_KEY. A small Apps Script under the company account
// (apps-script-uploads/Code.gs, set up like Neo's Agreements script) hands this function a Drive access token and the
// uploads folder ID; everything else below works as before. When those two are set, the GOOGLE_* and DRIVE_ROOT_FOLDER_ID
// settings are not used.
// HR's Drive (11 Nov 2026): kind 'complaints' (documents on staff complaints) goes to HR's own Google account through a
// second copy of the same script: DRIVE_HR_SCRIPT_URL + DRIVE_HR_SCRIPT_KEY. Only people who can read that complaint in
// Firestore (HR, and its sender) may upload, list or open its files; folders are named by the complaint ref only.
// Owner Files (17 Nov 2026): each state set up on Settings > States (config/driveStates) has a Drive folder (e.g. "Owner Files
// (SA, Statements)" for KL). Issue uploads on a customer ticket go to <state folder>/<property>/Owner/<unit>/Maintenance/
// "<title> <date> (<tag>)"; missing pieces are made, names matched without spaces, dashes or capitals. No state link, no
// property or unit: the old Widebed PMS Files/Issues folder. Every upload is tagged (appProperties.pms = its kind); the
// PMS opens or removes a file only when it carries that tag or sits in its own <root>/<kind>/ folder.
// Older options: GOOGLE_SERVICE_ACCOUNT_JSON (company: Shared Drive) or GOOGLE_OAUTH_CLIENT_ID/_SECRET/_REFRESH_TOKEN (testing on one person's Drive), DRIVE_ROOT_FOLDER_ID, FIREBASE_API_KEY. The folder must sit in a Shared Drive
// the service account is a member of. Anyone with a PMS login may use it; the files themselves stay inside the Shared Drive.
import { createSign } from 'node:crypto';

const KINDS = { 'offline-payments': 'Offline Payments', 'utility-bills': 'Utility Bills',
  expenses: 'Expenses', issues: 'Issues', listings: 'New Owner Listings', sops: 'HR SOPs', 'owner-payments': 'Owner Payments',
  announcements: 'HR Announcements', complaints: 'Staff Complaints', dcomplaints: 'Director Complaints',
  agents: 'Agent Business Cards', terminations: 'Tenancy Notices' };   // agents: 20 Nov 2026 (Marketing > Agent Database); terminations: 20 Nov 2026 (the tenant's notice on an early termination)
// Which Google account an area uses: 'hr' = HR's own Drive (DRIVE_HR_SCRIPT_*), everything else the company Drive.
const ACCOUNT = { complaints: 'hr', dcomplaints: 'hr' };
// 11 Nov 2026: which complaint kind each area holds, and its ref format
const COMPLAINT = { complaints: { kind: 'staff', ref: /^SC-\d{1,6}$/ }, dcomplaints: { kind: 'director', ref: /^DC-\d{1,6}$/ } };
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

// ---------- Owner Files (17 Nov 2026) ----------
const OWNER_SUB = 'Owner', MAINT = 'Maintenance';
// Google Drive Folders access (17 Nov 2026): 'edit', 'view' or ''. As lib/access.js: Directors always; otherwise the person's
// own ticks, else their role's saved list (Roles page), else the built-in preset (Operations: Full). KEEP IN STEP.
async function driveAccess(user) {
  const u = await readDoc(user, `users/${user.uid}`);
  if (!u || u.active?.booleanValue === false) return '';
  const role = u.role?.stringValue || '';
  if (role === 'director') return 'edit';
  const listOf = f => (f?.perms?.arrayValue?.values || []).map(v => v.stringValue);
  let perms = u.perms ? listOf(u) : null;
  if (!perms) { const r = role ? await readDoc(user, `roles/${role}`) : null; perms = r?.perms ? listOf(r) : null; }
  if (!perms) perms = role === 'operations' ? ['driveFolders.view', 'driveFolders.edit'] : [];
  return perms.includes('driveFolders.edit') ? 'edit' : perms.includes('driveFolders.view') ? 'view' : '';
}
const FOLDER = 'application/vnd.google-apps.folder';
// "DM 13-11", "dm1311" and "DM 1311" are the same name
const nameKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const projectId = () => process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'widebed-pmsdashboard';
// A Firestore record read with the person's own sign-in (the rules decide); null when missing or refused
async function readDoc(user, path) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId()}/databases/(default)/documents/${path}`, { headers: { Authorization: `Bearer ${user.idToken}` } });
  return r.ok ? (await r.json()).fields || {} : null;
}
// The Drive folder set up for a state on Settings > States, '' when none
async function stateFolder(user, state) {
  if (!state) return '';
  const f = await readDoc(user, 'config/driveStates');
  return f?.states?.mapValue?.fields?.[state]?.mapValue?.fields?.folderId?.stringValue || '';
}
async function propertyOf(user, propertyId) {
  if (!SAFE.test(propertyId || '')) return null;
  const f = await readDoc(user, `properties/${propertyId}`);
  if (!f) return null;
  return { name: f.name?.stringValue || '', code: f.code?.stringValue || '', state: f.state?.stringValue || f.info?.mapValue?.fields?.state?.stringValue || '' };
}
// 17 Nov 2026: a property whose unit folders sit somewhere else than <property>/Owner (e.g. D Majestic: "Profit Sharing").
// Set on the property's Overview (Directors, Operations), saved in config/driveUnits { props: { propertyId: { folderId, ... } } }.
// Used for issue uploads, the unit folder link and the States link check. { propertyId: folderId }
async function unitsFolders(user) {
  const f = await readDoc(user, 'config/driveUnits');
  const props = f?.props?.mapValue?.fields || {}, out = {};
  for (const [pid, v] of Object.entries(props)) { const id = v?.mapValue?.fields?.folderId?.stringValue; if (id) out[pid] = id; }
  return out;
}
// Every folder directly inside a folder: [{ id, name }]
async function subfolders(tok, parent) {
  const out = []; let page = '';
  do {
    const url = `${API}/files?q=${encodeURIComponent(`'${parent}' in parents and mimeType='${FOLDER}' and trashed=false`)}&fields=nextPageToken,files(id,name)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`;
    const j = await (await g(url, tok)).json();
    out.push(...(j.files || [])); page = j.nextPageToken || '';
  } while (page);
  return out;
}
// 17 Nov 2026 (Khairul): Drive folders may carry a note the PMS code can't, e.g. "TR G-01 (Duplex)" for unit TR G-01.
// An exact match wins; otherwise the folder name is matched with anything in brackets left out.
const bareKey = s => nameKey(String(s || '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' '));
// 17 Nov 2026: when two folders match (e.g. "DM 15-13 (Mr Bobby)" and "DM 15-13 (Old owner)"), one whose note says
// old or terminated loses to the other. If every match is old, the first is still used (nothing new is made).
const OLD_NOTE = /\((?=[^)]*\b(old|terminat|ended|former|previous))[^)]*\)/i;
const findByKey = (list, name) => {
  if (!nameKey(name)) return null;
  const exact = list.find(f => nameKey(f.name) === nameKey(name));
  if (exact) return exact;
  const bare = list.filter(f => bareKey(f.name) === nameKey(name));
  return bare.find(f => !OLD_NOTE.test(f.name)) || bare[0] || null;
};
async function makeFolder(tok, parent, name) {
  const r = await g(`${API}/files?supportsAllDrives=true&fields=id`, tok, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }) });
  return (await r.json()).id;
}
// A unit folder: as findByKey, then (17 Nov 2026, Khairul) without the property code in front, since some folders leave
// it out, e.g. unit "LK A1-25-07" in folder "A1-25-07". Never shorter than 3 letters/digits, so "01" can't match.
function findUnit(list, code) {
  const hit = findByKey(list, code);
  if (hit) return hit;
  const parts = String(code || '').trim().split(/\s+/), rest = parts.slice(1).join(' ');
  return parts.length > 1 && nameKey(rest).length >= 3 ? findByKey(list, rest) : null;
}
async function findOrMake(tok, parent, name, newName = name, find = findByKey) {
  const hit = find(await subfolders(tok, parent), name);
  return hit ? hit.id : makeFolder(tok, parent, newName);
}
// A new unit folder in the Drive's style: "DM 1311" -> "DM 13-11", "DM 13A08" -> "DM 13A-08"; otherwise as written
function driveUnitName(code) {
  const parts = String(code || '').trim().replace(/\s+/g, ' ').split(' '), last = parts.pop() || '';
  const m = /^(\d+[A-Za-z]?)(\d{2})$/.exec(last);
  return [...parts, m ? `${m[1]}-${m[2]}` : last].join(' ').trim();
}
const link = id => `https://drive.google.com/drive/folders/${id}`;

// ---------- Unit folders in each property's own style (17 Nov 2026) ----------
// A property's unit folders show how it names them, e.g. D Majestic "DM 13-11" for unit DM 1311 (dash before the last two
// digits), LK "A1-25-07" for unit LK A1-25-07 (no property code). The style most existing folders follow is used for a new
// one; with no folders yet the PMS name is used as it is.
const STYLES = [{ drop: false, dash: false }, { drop: false, dash: true }, { drop: true, dash: false }, { drop: true, dash: true }];
const tidyName = s => String(s || '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
function styled(code, st) {
  let parts = String(code || '').trim().replace(/\s+/g, ' ').split(' ');
  if (st.drop && parts.length > 1) parts = parts.slice(1);
  if (st.dash) { const m = /^(\d+[A-Za-z]?)(\d{2})$/.exec(parts[parts.length - 1] || ''); if (m) parts = [...parts.slice(0, -1), `${m[1]}-${m[2]}`]; }
  return parts.join(' ').replace(/[\\/]/g, ' ').trim();
}
function learnStyle(folders, codes) {
  const votes = STYLES.map(() => 0);
  for (const c of codes || []) {
    const f = findUnit(folders, c);
    if (!f) continue;
    const name = tidyName(f.name).toLowerCase();
    STYLES.forEach((st, i) => { if (styled(c, st).toLowerCase() === name) votes[i]++; });
  }
  let best = 0;
  votes.forEach((v, i) => { if (v > votes[best]) best = i; });   // a tie keeps the earlier one ("as in the PMS" first)
  return { ...STYLES[best], seen: votes[best] };
}
// The property's unit codes, read with the person's own sign-in ([] when the rules refuse)
async function unitCodesOf(user, propertyId) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId()}/databases/(default)/documents:runQuery`, {
    method: 'POST', headers: { Authorization: `Bearer ${user.idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'units' }], where: { fieldFilter: { field: { fieldPath: 'propertyId' }, op: 'EQUAL', value: { stringValue: propertyId } } } } }) });
  if (!r.ok) return [];
  return (await r.json()).map(x => x.document?.fields?.unitCode?.stringValue).filter(Boolean);
}
// The state's folder id and name (Settings > States)
async function stateInfo(user, state) {
  if (!state) return { id: '', name: '' };
  const f = await readDoc(user, 'config/driveStates');
  const s = f?.states?.mapValue?.fields?.[state]?.mapValue?.fields || {};
  return { id: s.folderId?.stringValue || '', name: s.folderName?.stringValue || state };
}
// What would be made for one property: { id, path: [{ name, new }], parentId, folders, style, create: [{ unit, name }], skip }
// p = { id, units: [every unit code], only: [the codes to make] (default: every unit) }. Reads Drive only.
async function unitPlanOne(tok, user, p, own) {
  const id = String(p.id || ''), codes = (Array.isArray(p.units) ? p.units : []).map(String).slice(0, 1000);
  const only = Array.isArray(p.only) ? p.only.map(String).slice(0, 1000) : codes;
  const prop = await propertyOf(user, id);
  if (!prop?.name) return { id, skip: 'property' };
  const path = []; let parentId = '';
  if (own[id]) {
    const meta = await (await g(`${API}/files/${own[id]}?fields=name&supportsAllDrives=true`, tok)).json();
    path.push({ name: meta.name || 'Units folder' }); parentId = own[id];
  } else {
    const st = await stateInfo(user, prop.state);
    if (!st.id) return { id, name: prop.name, skip: 'state', state: prop.state };
    path.push({ name: st.name });
    const hit = findByKey(await subfolders(tok, st.id), prop.name);
    if (!hit) path.push({ name: prop.name.replace(/[\\/]/g, ' ').trim(), new: true }, { name: OWNER_SUB, new: true });
    else {
      path.push({ name: hit.name });
      const owner = findByKey(await subfolders(tok, hit.id), OWNER_SUB);
      if (owner) { path.push({ name: owner.name }); parentId = owner.id; } else path.push({ name: OWNER_SUB, new: true });
    }
  }
  const folders = parentId ? await subfolders(tok, parentId) : [];
  const style = learnStyle(folders, codes.length ? codes : only);
  const names = new Set(folders.map(f => nameKey(f.name))), create = [];
  for (const c of only) {
    if (findUnit(folders, c)) continue;
    const name = styled(c, style);
    if (!name || names.has(nameKey(name))) continue;   // two codes that would give the same folder: made once
    names.add(nameKey(name)); create.push({ unit: c, name });
  }
  const sample = codes[0] || only[0] || '';
  return { id, name: prop.name, path, parentId, style: { drop: style.drop, dash: style.dash, seen: style.seen, example: sample ? styled(sample, style) : '' }, create };
}
// A property's folder under its state's folder. make: create it (with Owner inside) when missing.
// { id, made } or { id: '', why } when it can't be found
async function propertyFolder(tok, user, propertyId, make = false) {
  const p = await propertyOf(user, propertyId);
  if (!p?.name) return { id: '', why: 'property' };
  const root = await stateFolder(user, p.state);
  if (!root) return { id: '', why: 'state', state: p.state };
  const hit = findByKey(await subfolders(tok, root), p.name);
  if (hit) return { id: hit.id, name: hit.name };
  if (!make) return { id: '', why: 'folder' };
  const id = await makeFolder(tok, root, p.name.replace(/[\\/]/g, ' ').trim());
  await makeFolder(tok, id, OWNER_SUB);
  return { id, name: p.name, made: true };
}
// The folder that holds a property's unit folders: its own units folder when set, else <property>/Owner.
// make: create the property folder and Owner when missing. { id, why }
async function unitsParent(tok, user, propertyId, make = false) {
  const own = (await unitsFolders(user))[propertyId];
  if (own) return { id: own, own: true };
  const pf = await propertyFolder(tok, user, propertyId, make);
  if (!pf.id) return { id: '', why: pf.why };
  if (make) return { id: await findOrMake(tok, pf.id, OWNER_SUB) };
  const owner = findByKey(await subfolders(tok, pf.id), OWNER_SUB);
  return owner ? { id: owner.id } : { id: '', why: 'unit' };
}
// Issues: <property>/Owner/<unit>/Maintenance/"<title> <date> (<tag>)". '' when the ticket has no property or unit,
// or its state has no Drive folder (the upload then goes to Widebed PMS Files/Issues).
async function issueFolder(tok, user, b) {
  const unit = String(b.unit || '').trim().slice(0, 40);
  if (!b.propertyId || !unit || !SAFE.test(b.recordId || '')) return '';
  // (or <units folder>/<unit>/Maintenance/... for a property with its own units folder, 17 Nov 2026)
  const parent = await unitsParent(tok, user, b.propertyId, true);
  if (!parent.id) return '';
  // A new unit folder follows the names already there (17 Nov 2026); with none yet, the PMS name as it is
  const sibs = await subfolders(tok, parent.id), hitUnit = findUnit(sibs, unit);
  const unitId = hitUnit ? hitUnit.id : await makeFolder(tok, parent.id, styled(unit, learnStyle(sibs, await unitCodesOf(user, b.propertyId))) || unit);
  const maint = await findOrMake(tok, unitId, MAINT);
  const tag = b.recordId.slice(-5);
  // Drive's "name contains" only matches word starts, so the "(tag)" ending is checked here instead
  const found = (await subfolders(tok, maint)).find(f => String(f.name || '').endsWith(`(${tag})`));
  if (found) return found.id;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const title = String(b.label || '').replace(/[\\/'"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Issue';
  return makeFolder(tok, maint, `${title} ${day} (${tag})`);
}
// The file sits in <root>/<kind>/ (up to 3 folders down)
async function insideKind(tok, parents, kindId) {
  let ids = parents || [];
  for (let depth = 0; depth < 3 && ids.length; depth++) {
    if (ids.includes(kindId)) return true;
    ids = (await (await g(`${API}/files/${ids[0]}?fields=parents&supportsAllDrives=true`, tok)).json()).parents || [];
  }
  return false;
}

// Staff complaint files: the person must be able to read complaints/{recordId} under the Firestore rules (HR, or the
// complaint's sender), and it must be a staff complaint. Read with their own sign-in, so the rules decide.
// Director complaints (11 Nov 2026): the Directors and the HR person who sent it. Closed: only HR (staff) or the
// Directors (director) may still add.
async function checkComplaint(user, recordId, action, area) {
  if (!SAFE.test(recordId || '')) throw new HttpError(400, 'Bad complaint id.');
  const project = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'widebed-pmsdashboard';
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/complaints/${recordId}`, { headers: { Authorization: `Bearer ${user.idToken}` } });
  if (!r.ok) throw new HttpError(403, 'You cannot open files on this complaint.');
  const f = (await r.json()).fields || {};
  const kind = COMPLAINT[area].kind;
  if (f.kind?.stringValue !== kind) throw new HttpError(403, 'That complaint is not in this area.');
  if (action === 'session' && f.status?.stringValue === 'closed' && (await roleOf(user)) !== (kind === 'staff' ? 'hr' : 'director'))
    throw new HttpError(403, 'This complaint is closed.');
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
      await checkComplaint(user, b.recordId, b.action, b.kind);
      b.label = COMPLAINT[b.kind].ref.test(String(b.label || '')) ? b.label : '';
    }
    const tok = await driveToken(acct);
    // ---- Read a printed PDF (24 Nov 2026, Bulk Upload > Cancel bookings) ----
    // { action: 'ocr', name, data: <PDF as base64> } -> { text }. eZee's Cancelled Reservation report can only be printed to PDF,
    // which holds pictures of the pages, not text. Drive reads the text (OCR) when the PDF is saved as a Google Doc; the
    // Doc is read as plain text and deleted at once. Accounting and Directors only (the people who may cancel eZee bookings).
    if (b.action === 'ocr') {
      if (!['director', 'finance'].includes(await roleOf(user))) throw new HttpError(403, 'Only Accounting and Directors can read cancellation reports.');
      const data = String(b.data || '');
      if (!data || data.length > 4200000) throw new HttpError(400, 'The PDF is too big to read (3 MB at most). Print fewer pages at a time.');
      const bytes = Buffer.from(data, 'base64');
      if (bytes.subarray(0, 4).toString() !== '%PDF') throw new HttpError(400, 'That file is not a PDF.');
      const boundary = 'pmsocr' + Date.now();
      const meta = { name: `PMS reading ${String(b.name || 'report').replace(/[^\w .-]/g, '').slice(0, 60)} ${Date.now()}`,
        mimeType: 'application/vnd.google-apps.document', parents: [rootId(acct)], appProperties: { pms: 'ocr' } };
      const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
        bytes, Buffer.from(`\r\n--${boundary}--`)]);
      const made = await (await g(`${UPLOAD}/files?uploadType=multipart&ocrLanguage=en&supportsAllDrives=true&fields=id`, tok,
        { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })).json();
      try {
        const text = await (await g(`${API}/files/${made.id}/export?mimeType=text/plain`, tok)).text();
        return res.status(200).json({ text });
      } finally {
        // Never left behind: deleted, or put in the trash when the account may not delete
        await g(`${API}/files/${made.id}?supportsAllDrives=true`, tok, { method: 'DELETE' })
          .catch(() => g(`${API}/files/${made.id}?supportsAllDrives=true`, tok, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }).catch(() => {}));
      }
    }
    // ---- Owner Files (17 Nov 2026) ----
    if (b.action === 'checkFolder' && await driveAccess(user) !== 'edit')
      throw new HttpError(403, 'You need Full access to Google Drive Folders to set a folder.');
    if (b.action === 'linkCheck' && !await driveAccess(user))
      throw new HttpError(403, 'You need access to Google Drive Folders.');
    if (b.action === 'checkFolder') {
      // A link pasted on Settings > States: is it a folder this Drive account can open?
      if (!SAFE.test(b.folderId || '')) throw new HttpError(400, 'That is not a Google Drive folder link.');
      const r = await fetch(`${API}/files/${b.folderId}?fields=id,name,mimeType,capabilities(canAddChildren)&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${tok}` } });
      if (!r.ok) throw new HttpError(404, 'The PMS cannot open that folder. Share it with support@widebed.com as Editor, then try again.');
      const f = await r.json();
      if (f.mimeType !== FOLDER) throw new HttpError(400, 'That link is a file, not a folder.');
      if (f.capabilities && f.capabilities.canAddChildren === false) throw new HttpError(403, `The PMS can see "${f.name}" but cannot add to it. Give support@widebed.com Editor access.`);
      return res.status(200).json({ id: f.id, name: f.name, link: link(f.id) });
    }
    if (b.action === 'linkCheck') {
      // Read-only: which of a state's properties (and their units) have a folder. Nothing is made.
      const root = await stateFolder(user, String(b.state || ''));
      if (!root) throw new HttpError(400, 'This state has no Drive folder yet.');
      const list = (Array.isArray(b.properties) ? b.properties : []).slice(0, 300);
      const folders = await subfolders(tok, root), own = await unitsFolders(user);
      const one = async p => {
        const hit = findByKey(folders, p.name), row = { id: String(p.id || ''), link: hit ? link(hit.id) : '', folderName: hit?.name || '', ownerLink: '', units: {} };
        if (hit || own[row.id]) {
          // The property's own units folder when set (17 Nov 2026), else its Owner folder
          const owner = own[row.id] ? { id: own[row.id] } : findByKey(await subfolders(tok, hit.id), OWNER_SUB);
          if (owner) {
            row.ownerLink = link(owner.id);
            const unitFolders = await subfolders(tok, owner.id);
            for (const code of (Array.isArray(p.units) ? p.units : []).slice(0, 1000)) { const u = findUnit(unitFolders, code); row.units[code] = u ? link(u.id) : ''; }
          }
        }
        return row;
      };
      const out = [];
      for (let i = 0; i < list.length; i += 8) out.push(...await Promise.all(list.slice(i, i + 8).map(one)));   // 8 at a time
      return res.status(200).json({ properties: out });
    }
    if (b.action === 'propertyLinks') {
      // Properties list (17 Nov 2026): which properties have a folder. One folder listing per state; read-only.
      // [{ id, name, state }] -> { status: { id: 'linked' | 'missing' | 'state' }, links: { id: link } }
      const list = (Array.isArray(b.properties) ? b.properties : []).slice(0, 500), status = {}, links = {}, byState = {};
      for (const p of list) (byState[String(p.state || '')] ||= []).push(p);
      for (const [st, ps] of Object.entries(byState)) {
        const root = await stateFolder(user, st);
        if (!root) { for (const p of ps) status[p.id] = 'state'; continue; }
        const folders = await subfolders(tok, root);
        for (const p of ps) { const hit = findByKey(folders, p.name); status[p.id] = hit ? 'linked' : 'missing'; if (hit) links[p.id] = link(hit.id); }
      }
      return res.status(200).json({ status, links });
    }
    if (b.action === 'propertyFolder') {
      // A property's folder link (Overview); make: create it with Owner inside when missing (Add property)
      const pf = await propertyFolder(tok, user, b.propertyId, !!b.make);
      return res.status(200).json(pf.id ? { link: link(pf.id), made: !!pf.made } : { link: '', why: pf.why, state: pf.state || '' });
    }
    if (b.action === 'unitPlan' || b.action === 'makeUnitFolders') {
      // 17 Nov 2026: unit folders in each property's style. unitPlan only reads Drive (the preview); makeUnitFolders makes
      // the folders the plan lists (and a missing property / Owner folder). properties = [{ id, units, only }].
      // One unit of one property (Add unit): anyone who can read the property. More (Settings > States): Directors, Operations.
      const list = (Array.isArray(b.properties) ? b.properties : []).slice(0, 300);
      const many = list.length > 1 || list.some(p => (Array.isArray(p.only) ? p.only : p.units || []).length > 1);
      if (many && await driveAccess(user) !== 'edit') throw new HttpError(403, 'You need Full access to Google Drive Folders to make folders for many units at once.');
      const own = await unitsFolders(user), out = [];
      for (let i = 0; i < list.length; i += 6) out.push(...await Promise.all(list.slice(i, i + 6).map(p => unitPlanOne(tok, user, p, own))));
      if (b.action === 'unitPlan') return res.status(200).json({ properties: out.map(({ parentId, ...r }) => r) });
      const made = [];
      for (const r of out) {
        if (r.skip || !r.create.length) continue;
        const parent = await unitsParent(tok, user, r.id, true);
        if (!parent.id) continue;
        const now = await subfolders(tok, parent.id);
        for (const c of r.create) {
          if (findUnit(now, c.unit)) continue;   // made by someone else meanwhile
          const fid = await makeFolder(tok, parent.id, c.name);
          made.push({ id: r.id, unit: c.unit, name: c.name, link: link(fid) });
        }
      }
      return res.status(200).json({ made });
    }
    if (b.action === 'unitFolder') {
      // A unit's folder link (Unit view): <property>/Owner/<unit>, or <units folder>/<unit>. Read-only.
      const parent = await unitsParent(tok, user, b.propertyId, false);
      if (!parent.id) return res.status(200).json({ link: '', why: parent.why });
      const u = findUnit(await subfolders(tok, parent.id), b.unit);
      return res.status(200).json({ link: u ? link(u.id) : '', why: u ? '' : 'unit' });
    }
    if (b.action === 'remove') {
      // Moves one file to the Drive trash (restorable there). Only a file the PMS uploaded to this area (tagged), or
      // one inside <root>/<kind>/, can be removed.
      if (!KINDS[b.kind] || !SAFE.test(b.fileId || '')) throw new HttpError(400, 'Bad request.');
      const root = rootId(acct);
      const kindId = await folder(tok, root, KINDS[b.kind]);
      const meta = await (await g(`${API}/files/${b.fileId}?fields=parents,appProperties&supportsAllDrives=true`, tok)).json();
      const ok = meta.appProperties?.pms === b.kind || await insideKind(tok, meta.parents, kindId);
      if (!ok) throw new HttpError(403, 'That file is not in this area.');
      await g(`${API}/files/${b.fileId}?supportsAllDrives=true`, tok, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'file') {
      // One file back to a signed-in user (in-site viewer and downloads). Only files inside <root>/<kind>/ are served. Vercel caps a reply at ~4.5 MB.
      if (!KINDS[b.kind] || !SAFE.test(b.fileId || '')) throw new HttpError(400, 'Bad request.');
      const root = rootId(acct);
      const kindId = await folder(tok, root, KINDS[b.kind]);
      const meta = await (await g(`${API}/files/${b.fileId}?fields=name,mimeType,size,parents,appProperties&supportsAllDrives=true`, tok)).json();
      // A complaint file must sit in that complaint's own folder ("SC-0013 (<last 5 of its id>)")
      if (acct === 'hr') {
        const p = meta.parents?.[0] && await (await g(`${API}/files/${meta.parents[0]}?fields=name&supportsAllDrives=true`, tok)).json();
        if (!p || !String(p.name || '').endsWith(`(${b.recordId.slice(-5)})`)) throw new HttpError(403, 'That file is not on this complaint.');
      }
      // A file the PMS uploaded to this area (tagged, e.g. issue photos in Owner Files), or one inside <root>/<kind>/
      const ok = (acct !== 'hr' && meta.appProperties?.pms === b.kind) || await insideKind(tok, meta.parents, kindId);
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
    // Issue uploads on a customer ticket: the unit's Maintenance folder in Owner Files when it can be reached (17 Nov 2026)
    let folderId = '', note = '';
    if (b.action === 'session' && b.kind === 'issues' && b.propertyId) {
      try { folderId = await issueFolder(tok, user, b); }
      catch (e) { console.error('[drive] issue folder:', e.message); note = `Could not reach the unit's folder in Owner Files (${String(e.message || e).slice(0, 160)}), so this went to Widebed PMS Files.`; }
      if (!folderId && !note) note = 'This property\'s state or unit has no Owner Files folder, so this went to Widebed PMS Files.';
    }
    // 18 Nov 2026: a ticket's own folder without uploading (raise time / Mark completed), so the ticket keeps its link
    if (b.action === 'issueFolder') {
      if (b.kind !== 'issues') throw new HttpError(400, 'Only issue folders.');
      try { folderId = b.propertyId ? await issueFolder(tok, user, b) : ''; }
      catch (e) { console.error('[drive] issue folder:', e.message); note = 'Could not reach the unit\'s folder in Owner Files, so the ticket folder is in Widebed PMS Files.'; }
    }
    if (!folderId) folderId = await recordFolder(tok, b.kind, b.recordId, b.label);
    const folderLink = `https://drive.google.com/drive/folders/${folderId}`;
    if (b.action === 'issueFolder') return res.status(200).json({ folderId, folderLink, note });
    if (b.action === 'session') {
      const name = String(b.name || 'file').replace(/[\\/]/g, '_').slice(0, 200);
      const r = await g(`${UPLOAD}/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink`, tok, { method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': b.mimeType || 'application/octet-stream', ...(req.headers.origin ? { Origin: req.headers.origin } : {}) },
        body: JSON.stringify({ name, parents: [folderId], appProperties: { pms: b.kind } }) });
      return res.status(200).json({ uploadUrl: r.headers.get('location'), folderId, folderLink, note });
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
