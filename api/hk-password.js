// POST /api/hk-password   Authorization: Bearer <PMS Firebase ID token>   body { uid, password }
// Housekeeping accounts (17 Nov 2026): HR or a Director sets a new password for a housekeeper, who has no email to reset
// it with (they sign in with a username, lib/housekeeping.js). The server checks, with the service account:
//   - the caller is an active HR or Director (users/{caller}), and HR never their own account;
//   - the account is a housekeeping sign-in (…@housekeeping.widebed.com) and not a Director's.
// Then it sets the password in Firebase Authentication. The password is never stored or logged; the page writes the
// audit line ("set a new password for …").
// Vercel variables (already set for api/push.js and api/drive.js, nothing new):
//   FIREBASE_ADMIN_JSON   PMS service account (reads users, changes the sign-in password)
//   FIREBASE_API_KEY      checks who is calling
import { createSign } from 'node:crypto';

const HK_DOMAIN = 'housekeeping.widebed.com';   // same as lib/housekeeping.js
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const b64 = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

function serviceKey() {
  try { const k = JSON.parse(process.env.FIREBASE_ADMIN_JSON || ''); if (k.client_email && k.private_key && k.project_id) return k; } catch { /* below */ }
  throw new HttpError(500, 'FIREBASE_ADMIN_JSON is missing or not valid on the server.');
}

let cached = { token: '', exp: 0 };
async function googleToken(key) {
  if (cached.token && cached.exp > Date.now() + 60000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64({ iss: key.client_email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform' });
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }) });
  const j = await r.json();
  if (!r.ok) throw new HttpError(500, `Google sign-in failed: ${j.error_description || j.error || r.status}`);
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

async function caller(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) throw new HttpError(401, 'Sign in again.');
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) throw new HttpError(500, 'FIREBASE_API_KEY is not set on the server.');
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: m[1] }) });
  const j = await r.json().catch(() => ({}));
  const u = j.users?.[0];
  if (!r.ok || !u?.localId || u.disabled) throw new HttpError(401, 'Sign in again.');
  return u.localId;
}

const val = v => v == null ? null : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null : 'arrayValue' in v ? (v.arrayValue.values || []).map(val) : undefined;   // arrays: 24 Nov 2026 (branches)
async function userDoc(key, tok, uid) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${key.project_id}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
    { headers: { Authorization: `Bearer ${tok}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new HttpError(502, `Firestore refused (${r.status}).`);
  const d = await r.json();
  return Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, val(v)]));
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST only.');
    const me = await caller(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const uid = String(body.uid || ''), password = String(body.password || '');
    if (!/^[A-Za-z0-9]{10,64}$/.test(uid)) throw new HttpError(400, 'Pick an account.');
    if (password.length < 8 || password.length > 64 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
      throw new HttpError(400, 'Use 8 to 64 characters with letters and at least one number.');

    const key = serviceKey(), tok = await googleToken(key);
    const mine = await userDoc(key, tok, me);
    const myRole = mine && mine.active !== false ? mine.role : null;
    if (myRole !== 'director' && myRole !== 'hr' && myRole !== 'branchDirector') throw new HttpError(403, 'Only HR or a Director can set a password.');
    if (myRole === 'hr' && uid === me) throw new HttpError(403, "You can't set your own password here.");

    const target = await userDoc(key, tok, uid);
    if (!target) throw new HttpError(404, 'No staff record for that account.');
    if (!String(target.email || '').toLowerCase().endsWith('@' + HK_DOMAIN)) throw new HttpError(400, 'Only housekeeping (username) accounts get a password set here. Others use the reset email.');
    if (target.role === 'director' || target.role === 'branchDirector') throw new HttpError(403, "A Director's password can't be set here.");
    // 24 Nov 2026: a Branch Director only for staff in their own branches
    if (myRole === 'branchDirector' && !(Array.isArray(target.branches) && target.branches.length && target.branches.every(b => (mine.branches || []).includes(b))))
      throw new HttpError(403, 'Only staff in your own branches.');

    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${key.project_id}/accounts:update`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify({ localId: uid, password }) });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new HttpError(502, `Firebase refused the change: ${j.error?.message || r.status}`);
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not set the password.' });
    if (!e.status) console.error('[hk-password]', e);
  }
}
