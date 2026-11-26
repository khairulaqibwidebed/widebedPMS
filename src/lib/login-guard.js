// Sign-in lockout (26 Nov 2026): talks to api/login-guard.js. 5 wrong passwords for one email in 15 minutes locks it for 15 minutes.
// If the server check can't be reached (local "npm run dev" has no /api, or Vercel is down), sign-in carries on the usual way
// so nobody is locked out by our own fault; the console says so.
import { auth } from './firebase.js';

async function post(body, token = '') {
  const r = await fetch('/api/login-guard', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  return { r, j };
}

// -> { ok: true, weak } | { ok: false, error, left, code } | { skip: true }
export async function guardAttempt(email, password) {
  try {
    const { r, j } = await post({ action: 'attempt', email, password });
    if (!j || r.status >= 500 || j.unavailable) { console.warn('[login-guard] check not available, signing in without it.', r.status, j?.error || '', j?.firebase || ''); return { skip: true }; }
    if (r.ok) return { ok: true, weak: !!j.weak };
    return { ok: false, error: j.error, left: j.left, code: j.code };
  } catch (e) {
    console.warn('[login-guard] check not available, signing in without it.', e);
    return { skip: true };
  }
}

// Signed-in calls: 'changed' (after Change password) and 'unlock' (Directors and HR, Staff accounts)
export async function guardCall(action, extra = {}) {
  const { r, j } = await post({ action, ...extra }, await auth.currentUser.getIdToken());
  if (!r.ok) throw new Error(j?.error || `The server refused (${r.status}).`);
  return j;
}
