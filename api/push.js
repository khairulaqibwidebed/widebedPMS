// POST /api/push   Authorization: Bearer <Firebase ID token>   body { id: <notifications document id> }
// Phone and desktop push (3 Nov 2026). Called by the browser right after it writes a notification
// (services/notificationService.js). It checks the caller really sent that notification, finds the devices of the
// person or role it is for (pushTokens, saved by lib/push.js), and sends it with Firebase Cloud Messaging (FCM v1).
// Devices that no longer exist are removed. The sender's own devices never get it.
// No packages: Node's crypto signs in as the Firebase service account, like api/drive.js does for Drive.
// Vercel variables (never in git or in chat):
//   FIREBASE_ADMIN_JSON  the service account key (Firebase console > Project settings > Service accounts > Generate new private key)
//   FIREBASE_API_KEY     already set for api/drive.js (checks who is calling)
import { createSign } from 'node:crypto';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const b64 = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const FRESH_MS = 5 * 60 * 1000;    // only a notification written in the last 5 minutes can be pushed (no replays)

function adminKey() {
  try { const k = JSON.parse(process.env.FIREBASE_ADMIN_JSON || ''); if (k.client_email && k.private_key && k.project_id) return k; } catch { /* below */ }
  throw new HttpError(500, 'FIREBASE_ADMIN_JSON is missing or not valid on the server.');
}

let cached = { token: '', exp: 0 };
async function googleToken(key) {
  if (cached.token && cached.exp > Date.now() + 60000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64({ iss: key.client_email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore' });
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(key.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }) });
  const j = await r.json();
  if (!r.ok) throw new HttpError(500, `Google sign-in failed: ${j.error_description || j.error || r.status}`);
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

// Who is calling (their uid), from their Firebase ID token
async function caller(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) throw new HttpError(401, 'Sign in again.');
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) throw new HttpError(500, 'FIREBASE_API_KEY is not set on the server.');
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: m[1] }) });
  const j = await r.json().catch(() => ({}));
  const uid = j.users?.[0]?.localId;
  if (!r.ok || !uid) throw new HttpError(401, 'Sign in again.');
  return uid;
}

// ---- Firestore REST (the service account is not limited by the security rules) ----
const val = v => v == null ? null : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null
  : 'timestampValue' in v ? v.timestampValue : 'integerValue' in v ? Number(v.integerValue) : 'arrayValue' in v ? (v.arrayValue.values || []).map(val) : undefined;
const plain = doc => Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, val(v)]));
const base = key => `https://firestore.googleapis.com/v1/projects/${key.project_id}/databases/(default)/documents`;

async function getDoc(key, tok, path) {
  const r = await fetch(`${base(key)}/${path}`, { headers: { Authorization: `Bearer ${tok}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new HttpError(502, `Firestore refused (${r.status}).`);
  return plain(await r.json());
}
async function query(key, tok, collectionId, filters) {
  const where = filters.length === 1 ? { fieldFilter: filters[0] } : { compositeFilter: { op: 'AND', filters: filters.map(f => ({ fieldFilter: f })) } };
  const r = await fetch(`${base(key)}:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], where, limit: 500 } }) });
  if (!r.ok) throw new HttpError(502, `Firestore refused (${r.status}).`);
  return (await r.json()).filter(x => x.document).map(x => ({ id: x.document.name.split('/').pop(), ...plain(x.document) }));
}
const eq = (field, value) => ({ field: { fieldPath: field }, op: 'EQUAL', value: typeof value === 'boolean' ? { booleanValue: value } : { stringValue: value } });
const inList = (field, values) => ({ field: { fieldPath: field }, op: 'IN', value: { arrayValue: { values: values.map(v => ({ stringValue: v })) } } });

// The people a notification is for: one person, or everyone active in the role
async function recipients(key, tok, n) {
  if (n.recipientUid) return [n.recipientUid];
  if (!n.recipientRole) return [];
  const users = await query(key, tok, 'users', [eq('role', n.recipientRole)]);
  return users.filter(u => u.active !== false).map(u => u.id);
}
async function devices(key, tok, uids) {
  const out = [];
  for (let i = 0; i < uids.length; i += 30) out.push(...await query(key, tok, 'pushTokens', [inList('uid', uids.slice(i, i + 30))]));
  return out;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST only.');
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const id = String(body.id || '');
    if (!/^[A-Za-z0-9]{10,40}$/.test(id)) throw new HttpError(400, 'Bad request.');
    const uid = await caller(req), key = adminKey(), tok = await googleToken(key);

    const n = await getDoc(key, tok, `notifications/${id}`);
    if (!n) throw new HttpError(404, 'Notification not found.');
    // Only the person who wrote it may push it (an anonymous complaint alert to HR has no sender, so it is allowed
    // when it is HR's complaint type), and only while it is fresh.
    const anonymousComplaint = n.createdByUid == null && n.recipientRole === 'hr' && n.type === 'complaint';
    if (n.createdByUid !== uid && !anonymousComplaint) throw new HttpError(403, 'Not your notification.');
    if (!n.createdAt || Date.now() - Date.parse(n.createdAt) > FRESH_MS) throw new HttpError(409, 'Too old to push.');

    const people = (await recipients(key, tok, n)).filter(u => u !== uid);
    const list = people.length ? await devices(key, tok, people) : [];
    let sent = 0, removed = 0;
    await Promise.all(list.map(async d => {
      const message = { token: d.id,
        data: { title: String(n.title || 'Widebed PMS').slice(0, 200), body: String(n.message || '').slice(0, 600), link: String(n.link || '/Notifications'), tag: id },
        webpush: { headers: { Urgency: 'high', TTL: '86400' } } };
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${key.project_id}/messages:send`, { method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
      if (r.ok) { sent++; return; }
      const t = await r.text();
      // A device that uninstalled, cleared its data or turned push off: forget it
      if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(t)) {
        removed++;
        await fetch(`${base(key)}/pushTokens/${encodeURIComponent(d.id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok}` } }).catch(() => {});
      } else console.warn('[push] send failed', r.status, t.slice(0, 200));
    }));
    res.status(200).json({ sent, removed, devices: list.length });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Push failed.' });
    if (!e.status) console.error('[push]', e);
  }
}
