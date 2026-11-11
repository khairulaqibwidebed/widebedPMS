// POST /api/staff-token   Authorization: Bearer <PMS Firebase ID token>   body {}
// Bridge for the Widebed Staff (attendance) mobile app, 5 Nov 2026.
// The app signs in with the person's normal PMS email and password, then calls this. It checks the PMS login, reads
// users/{uid} (active, role, name) and avatars/{uid}, and returns a sign-in pass (a Firebase custom token) for the
// separate attendance project widebed-staff-app. The pass carries the person's PMS uid, name, role and staff id, so the
// attendance project's security rules can trust them. Nothing in the PMS is written or changed.
// A switched-off record (active == false) or a record with no role gets no pass. The app asks for a fresh pass every time
// it opens and before every clock in / out, so a change on the Staff accounts page applies straight away.
// No packages: Node's crypto signs in as the service accounts, like api/push.js.
// Vercel variables (never in git or in chat):
//   FIREBASE_ADMIN_JSON     already set for api/push.js (PMS service account: reads users and avatars)
//   FIREBASE_API_KEY        already set for api/drive.js (checks who is calling)
//   STAFF_APP_ADMIN_JSON    NEW: widebed-staff-app service account key (that project's console > Project settings >
//                           Service accounts > Generate new private key). Used only to sign the pass.
import { createSign } from 'node:crypto';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const b64 = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const STAFF_PROJECT = 'widebed-staff-app';
const AUDIENCE = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

function serviceKey(envName) {
  try { const k = JSON.parse(process.env[envName] || ''); if (k.client_email && k.private_key && k.project_id) return k; } catch { /* below */ }
  throw new HttpError(500, `${envName} is missing or not valid on the server.`);
}

let cached = { token: '', exp: 0 };
async function googleToken(key) {
  if (cached.token && cached.exp > Date.now() + 60000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64({ iss: key.client_email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore' });
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }) });
  const j = await r.json();
  if (!r.ok) throw new HttpError(500, `Google sign-in failed: ${j.error_description || j.error || r.status}`);
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

// Who is calling (their PMS uid and email), from their PMS Firebase ID token
async function caller(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) throw new HttpError(401, 'Sign in again.');
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) throw new HttpError(500, 'FIREBASE_API_KEY is not set on the server.');
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: m[1] }) });
  const j = await r.json().catch(() => ({}));
  const u = j.users?.[0];
  if (!r.ok || !u?.localId) throw new HttpError(401, 'Sign in again.');
  if (u.disabled) throw new HttpError(403, 'This account has been switched off. Please contact HR.');
  return { uid: u.localId, email: u.email || '' };
}

// ---- Firestore REST (PMS, read only) ----
const val = v => v == null ? null : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null
  : 'timestampValue' in v ? v.timestampValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(val) : undefined;
const plain = doc => Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, val(v)]));
const base = key => `https://firestore.googleapis.com/v1/projects/${key.project_id}/databases/(default)/documents`;

async function getDoc(key, tok, path) {
  const r = await fetch(`${base(key)}/${path}`, { headers: { Authorization: `Bearer ${tok}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new HttpError(502, `Firestore refused (${r.status}).`);
  return plain(await r.json());
}

// ---- The pass for widebed-staff-app (Firebase custom token, valid 1 hour to sign in with) ----
const str = (v, max = 120) => (typeof v === 'string' ? v : '').trim().slice(0, max);
function customToken(staffKey, uid, claims) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64({ iss: staffKey.client_email, sub: staffKey.client_email, aud: AUDIENCE, iat: now, exp: now + 3600, uid, claims });
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(staffKey.private_key, 'base64url');
  return `${head}.${body}.${sig}`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST only.');
    const who = await caller(req);
    const pmsKey = serviceKey('FIREBASE_ADMIN_JSON'), staffKey = serviceKey('STAFF_APP_ADMIN_JSON');
    if (staffKey.project_id !== STAFF_PROJECT) throw new HttpError(500, `STAFF_APP_ADMIN_JSON is not for ${STAFF_PROJECT}.`);
    const tok = await googleToken(pmsKey);

    const u = await getDoc(pmsKey, tok, `users/${who.uid}`);
    // Same test as role() in the PMS rules: a record, not switched off, with a role
    if (!u) throw new HttpError(403, 'No staff record for this login. Please ask HR to add you on the Staff accounts page.');
    if (u.active === false) throw new HttpError(403, 'Your staff account is switched off. Please contact HR.');
    if (!str(u.role, 40)) throw new HttpError(403, 'Your staff account has no role yet. Please contact HR.');

    const avatar = await getDoc(pmsKey, tok, `avatars/${who.uid}`).catch(() => null);
    const profile = {
      uid: who.uid,
      email: str(u.email, 200) || who.email,
      name: str(u.name, 80) || str(u.displayName, 80) || str(u.fullName, 80) || who.email.slice(0, 80),
      staffId: str(u.staffId, 40) || str(u.employeeId, 40) || str(u.staffNo, 40),
      role: str(u.role, 40),
      department: str(u.department, 80),
      position: str(u.position, 80) || str(u.jobTitle, 80),
      officeId: str(u.officeId, 64),
      photo: typeof avatar?.src === 'string' && avatar.src.startsWith('data:image/') ? avatar.src : null,
    };
    // Kept small: Firebase allows 1000 bytes of claims. The attendance rules read these.
    const claims = { pms: true, staffActive: true, staffRole: profile.role, staffName: profile.name,
      staffId: profile.staffId, officeId: profile.officeId };

    res.status(200).json({ token: customToken(staffKey, who.uid, claims), profile });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Sign-in failed.' });
    if (!e.status) console.error('[staff-token]', e);
  }
}
