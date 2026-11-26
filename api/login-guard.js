// POST /api/login-guard   Sign-in lockout and password strength (26 Nov 2026)
//   { action: 'attempt', email, password }   no sign-in needed. The sign-in page calls this BEFORE signing in with Firebase.
//        The server checks the password with Firebase itself and counts wrong ones:
//          - 5 wrong passwords for one email within 15 minutes -> that email is locked for 15 minutes;
//          - 20 wrong passwords from one internet address (IP) within 15 minutes -> that address is locked for 15 minutes
//            (higher, because the whole office shares one address).
//        Answers 200 { ok, weak } | 401 wrong (with tries left) | 423 locked | 403 switched off | 429 Firebase's own limit.
//        A right password clears that email's count. weak = an email staff account whose password misses the strong rule:
//        users/{uid}.weakPassword is set and the app sends them to Change password before any other page.
//        Housekeeping (username) accounts keep the simple rule HR sets (Khairul 26 Nov), so they are never weak here.
//   { action: 'changed', password }   Bearer token. After Change password: the server checks the new password really is
//        theirs and strong, then clears users/{uid}.weakPassword (staff can't clear it themselves; rules allow only lastLoginAt).
//   { action: 'unlock', email }   Bearer token, Director / Branch Director / HR. Clears the lock on that email straight away.
// Counts live in loginGuard/{e_<hash of email> | i_<hash of address>} (no rule matches loginGuard, so no browser can read it;
// only this service account can). The email and address are stored only as a hash.
// Vercel variables (already set for api/hk-password.js, nothing new): FIREBASE_ADMIN_JSON, FIREBASE_API_KEY.
import { createSign, createHash } from 'node:crypto';

export const MAX_EMAIL = 5, MAX_IP = 20, WINDOW_MS = 15 * 60e3, LOCK_MS = 15 * 60e3;
const HK_DOMAIN = 'housekeeping.widebed.com';   // same as lib/housekeeping.js
const WRONG = ['INVALID_LOGIN_CREDENTIALS', 'INVALID_PASSWORD', 'EMAIL_NOT_FOUND'];
class HttpError extends Error { constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; } }
const b64 = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const hash = s => createHash('sha256').update(String(s)).digest('hex').slice(0, 40);
const lower = s => String(s || '').trim().toLowerCase();
// KEEP IN STEP with src/lib/password-rule.js
export const strongPassword = p => p.length >= 8 && p.length <= 128 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p);
const ipOf = req => String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim() || 'unknown';
// "3:15 PM" Malaysia time
const myTime = ms => new Date(ms).toLocaleTimeString('en-US', { timeZone: 'Asia/Kuala_Lumpur', hour: 'numeric', minute: '2-digit' });
const lockedMsg = until => `Too many wrong passwords. Sign-in is locked until ${myTime(until)}. Use Forgot password, or ask a Director or HR to unlock it.`;

function serviceKey() {
  try { const k = JSON.parse(process.env.FIREBASE_ADMIN_JSON || ''); if (k.client_email && k.private_key && k.project_id) return k; } catch { /* below */ }
  throw new HttpError(500, 'FIREBASE_ADMIN_JSON is missing or not valid on the server.');
}
function apiKey() {
  const k = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!k) throw new HttpError(500, 'FIREBASE_API_KEY is not set on the server.');
  return k;
}

let cached = { token: '', exp: 0 };
async function googleToken(key) {
  if (cached.token && cached.exp > Date.now() + 60000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64({ iss: key.client_email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600, scope: 'https://www.googleapis.com/auth/datastore' });
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }) });
  const j = await r.json();
  if (!r.ok) throw new HttpError(500, `Google sign-in failed: ${j.error_description || j.error || r.status}`);
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

// ---------- tiny Firestore helpers (service account) ----------
const docUrl = (key, path) => `https://firestore.googleapis.com/v1/projects/${key.project_id}/databases/(default)/documents/${path}`;
const val = v => v == null ? null : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'integerValue' in v ? Number(v.integerValue)
  : 'doubleValue' in v ? v.doubleValue : 'nullValue' in v ? null : 'arrayValue' in v ? (v.arrayValue.values || []).map(val) : undefined;
const enc = v => typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(Math.round(v)) } : { stringValue: String(v) };
async function fsCall(key, path, init = {}) {
  const r = await fetch(docUrl(key, path), { ...init, headers: { Authorization: `Bearer ${await googleToken(key)}`, 'Content-Type': 'application/json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new HttpError(502, `Firestore refused (${r.status}).`);
  return r.json().catch(() => ({}));
}
async function getDoc(key, path) {
  const d = await fsCall(key, path);
  return d ? Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, val(v)])) : null;
}
async function patchDoc(key, path, data) {   // only the fields given; the rest of the record stays as it is
  const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  await fsCall(key, `${path}?${mask}`, { method: 'PATCH', body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) }) });
}
const deleteDoc = (key, path) => fsCall(key, path, { method: 'DELETE' });

// One more wrong password on a counter. Returns { count, lockedUntil }.
async function bump(key, path, max, now) {
  const d = (await getDoc(key, path)) || {};
  const fresh = !d.firstAt || now - d.firstAt > WINDOW_MS;
  const count = (fresh ? 0 : d.count || 0) + 1;
  const lockedUntil = count >= max ? now + LOCK_MS : 0;
  // When it locks, the count starts again from 0, so after the 15 minutes they get 5 fresh tries
  await patchDoc(key, path, lockedUntil ? { count: 0, firstAt: 0, lockedUntil } : { count, firstAt: fresh ? now : d.firstAt, lockedUntil: 0 });
  return { count, lockedUntil };
}
const lockOf = (d, now) => (d && d.lockedUntil > now ? d.lockedUntil : 0);

// Firebase's own password check (the same one the sign-in page uses)
async function checkPassword(email, password) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey()}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: false }) });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, uid: j.localId } : { ok: false, code: String(j.error?.message || r.status).split(' ')[0].split(':')[0] };
}
async function caller(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) throw new HttpError(401, 'Sign in again.');
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey()}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: m[1] }) });
  const u = (await r.json().catch(() => ({}))).users?.[0];
  if (!r.ok || !u?.localId || u.disabled) throw new HttpError(401, 'Sign in again.');
  return { uid: u.localId, email: lower(u.email) };
}

async function attempt(req, body) {
  const email = lower(body.email), password = String(body.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) throw new HttpError(400, 'That email or username does not look right.', { code: 'auth/invalid-email' });
  if (!password || password.length > 4096) throw new HttpError(400, 'Enter your password.', { code: 'auth/missing-password' });
  const key = serviceKey(), now = Date.now();
  const ePath = `loginGuard/e_${hash(email)}`, iPath = `loginGuard/i_${hash(ipOf(req))}`;
  const [e, i] = await Promise.all([getDoc(key, ePath), getDoc(key, iPath)]);
  const lockedNow = Math.max(lockOf(e, now), lockOf(i, now));
  if (lockedNow) throw new HttpError(423, lockedMsg(lockedNow), { lockedUntil: lockedNow, code: 'locked' });

  const c = await checkPassword(email, password);
  if (c.ok) {
    if (e) await deleteDoc(key, ePath);
    const weak = !email.endsWith('@' + HK_DOMAIN) && !strongPassword(password);
    // Only staff with a PMS record get the flag. A strong password clears it (also after a reset by email); so does 'changed' below.
    const u = await getDoc(key, `users/${c.uid}`);
    if (u && weak && u.weakPassword !== true) await patchDoc(key, `users/${c.uid}`, { weakPassword: true });
    if (u && !weak && u.weakPassword === true) await patchDoc(key, `users/${c.uid}`, { weakPassword: false });
    return { ok: true, weak };
  }
  if (WRONG.includes(c.code)) {
    const [be, bi] = await Promise.all([bump(key, ePath, MAX_EMAIL, now), bump(key, iPath, MAX_IP, now)]);
    const until = Math.max(be.lockedUntil, bi.lockedUntil);
    if (until) throw new HttpError(423, lockedMsg(until), { lockedUntil: until, code: 'locked' });
    throw new HttpError(401, 'Email, username or password is wrong.', { left: MAX_EMAIL - be.count, code: 'auth/invalid-credential' });
  }
  if (c.code === 'USER_DISABLED') throw new HttpError(403, 'This account has been switched off. Ask a Director or HR.', { code: 'auth/user-disabled' });
  if (c.code === 'TOO_MANY_ATTEMPTS_TRY_LATER') throw new HttpError(429, 'Too many tries. Wait a few minutes, or reset your password.', { code: 'auth/too-many-requests' });
  // Anything else (Firebase down, a setting we don't know): the page carries on and signs in the usual way
  throw new HttpError(503, 'The sign-in check is not available.', { unavailable: true, firebase: c.code });
}

async function changed(req, body) {
  const me = await caller(req), password = String(body.password || '');
  if (!strongPassword(password)) throw new HttpError(400, 'The password needs 8 or more characters with a capital letter, a small letter, a number and a symbol.');
  const c = await checkPassword(me.email, password);
  if (!c.ok || c.uid !== me.uid) throw new HttpError(400, 'That is not your new password. Sign out and sign in again.');
  await patchDoc(serviceKey(), `users/${me.uid}`, { weakPassword: false });
  return { ok: true };
}

async function unlock(req, body) {
  const me = await caller(req), key = serviceKey();
  const mine = await getDoc(key, `users/${me.uid}`);
  if (!mine || mine.active === false || !['director', 'branchDirector', 'hr'].includes(mine.role)) throw new HttpError(403, 'Only a Director or HR can unlock a sign-in.');
  const email = lower(body.email);
  if (!email.includes('@')) throw new HttpError(400, 'Pick an account.');
  const path = `loginGuard/e_${hash(email)}`, d = await getDoc(key, path);
  if (d) await deleteDoc(key, path);
  return { ok: true, wasLocked: !!lockOf(d, Date.now()) };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST only.');
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = body.action || 'attempt';
    const out = action === 'attempt' ? await attempt(req, body) : action === 'changed' ? await changed(req, body)
      : action === 'unlock' ? await unlock(req, body) : (() => { throw new HttpError(400, 'Unknown action.'); })();
    res.status(200).json(out);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'The sign-in check is not available.', ...(e.extra || {}), ...(e.status ? {} : { unavailable: true }) });
    if (!e.status || e.status >= 500) console.error('[login-guard]', e);
  }
}
