// lib/housekeeping.js — Housekeeping staff (17 Nov 2026).
// Housekeepers sign in with a username and password that HR sets (Login: the Email or username box). Firebase sign-in needs an
// email, so the username is turned into a sign-in address nobody sees: "siti" -> "siti@housekeeping.widebed.com".
// No mail is ever sent there; HR sets a new password on Staff accounts (api/hk-password.js) instead of a reset email.
// Their role is 'housekeeping': an ordinary role with its own usual pages (Settings > Roles), ticks per person as usual.
//
// COH (Code of Honor) for housekeeping is by assignment (cohAssignments/{quarterId}, HR on COH Evaluations > Housekeeping):
//   pairs = { [evaluatorUid]: [evaluateeUid, ...] }
// A pair where either person is a housekeeper is allowed only when HR listed it there. Everyone else rates everyone else
// as before. firestore.rules (Draft 0.78, hkPairOk) checks the same thing.
// 19 Nov 2026 (Draft 0.92): three groups work this way (COH Evaluations > Assigned raters): Interns (users/{uid}.intern,
// ticked on HR details), Housekeeping (role) and General (cohAssignments/{quarterId}.general, people HR adds by hand).
// `special(uid)` says whether someone is an intern or in General; housekeepers are found by role as before.

export const HK_ROLE = 'housekeeping';
export const HK_DOMAIN = 'housekeeping.widebed.com';

// Usernames: 3 to 30 characters, lower-case letters, digits, dot, dash or underscore, starting with a letter or digit.
export const cleanUsername = u => String(u ?? '').trim().toLowerCase();
export const usernameOk = u => /^[a-z0-9][a-z0-9._-]{2,29}$/.test(cleanUsername(u));
export const hkEmail = u => `${cleanUsername(u)}@${HK_DOMAIN}`;
// The username of a housekeeping sign-in address ('' for a normal email)
export const usernameOf = email => { const e = String(email || '').toLowerCase(); return e.endsWith('@' + HK_DOMAIN) ? e.slice(0, -HK_DOMAIN.length - 1) : ''; };
export const isHkLogin = email => !!usernameOf(email);
// Passwords HR sets: at least 8 characters with a letter and a digit (Firebase itself needs 6).
export const passwordProblem = pw => {
  const p = String(pw || '');
  if (p.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'Use letters and at least one number.';
  if (p.length > 64) return 'Use 64 characters or fewer.';
  return '';
};

// ---------- COH pairs (pure; tested in lib/__tests__/housekeeping.test.js) ----------
const isHk = role => role === HK_ROLE;
const none = () => false;
// Is `uid` rated only by assigned people? (a housekeeper, an intern or someone in General)
export const assigned = (uid, roleOf, special = none) => isHk(roleOf(uid)) || !!special(uid);
// May `evaluator` rate `evaluatee`? roleOf: uid -> role. pairs: { evaluatorUid: [evaluateeUid] }. special: see above.
export function canRate(evaluator, evaluatee, roleOf, pairs = {}, special = none) {
  if (!evaluator || !evaluatee || evaluator === evaluatee) return false;
  if (!assigned(evaluator, roleOf, special) && !assigned(evaluatee, roleOf, special)) return true;
  return (pairs[evaluator] || []).includes(evaluatee);
}
// The people `uid` should rate, from the quarter's active participant uids
export const rateesOf = (uid, uids, roleOf, pairs, special) => uids.filter(x => canRate(uid, x, roleOf, pairs, special));
// The people who should rate `uid`
export const ratersOf = (uid, uids, roleOf, pairs, special) => uids.filter(x => canRate(x, uid, roleOf, pairs, special));

// Tidy pairs before saving: only pairs that involve a housekeeper (others need no listing), no self-pairs, no repeats,
// only people who are in the list `uids`, sorted, and no empty entries.
export function cleanPairs(pairs, uids, roleOf, special = none) {
  const inQ = new Set(uids), out = {};
  for (const [a, list] of Object.entries(pairs || {})) {
    if (!inQ.has(a)) continue;
    const keep = [...new Set(list || [])].filter(b => inQ.has(b) && b !== a && (assigned(a, roleOf, special) || assigned(b, roleOf, special))).sort();
    if (keep.length) out[a] = keep;
  }
  return out;
}
// Who rates housekeeper `hk` (from pairs), and whom `hk` rates
export const ratedByList = (hk, pairs) => Object.keys(pairs || {}).filter(a => (pairs[a] || []).includes(hk)).sort();
export const ratesList = (hk, pairs) => [...(pairs?.[hk] || [])].sort();
// Set who rates `hk` to `raters` (replaces the old list), returning new pairs
export function setRatedBy(pairs, hk, raters) {
  const out = Object.fromEntries(Object.entries(pairs || {}).map(([a, l]) => [a, (l || []).filter(b => b !== hk)]));
  for (const a of raters) if (a !== hk) out[a] = [...(out[a] || []), hk];
  return Object.fromEntries(Object.entries(out).filter(([, l]) => l.length));
}
// Set whom `hk` rates to `ratees`, returning new pairs
export function setRates(pairs, hk, ratees) {
  const out = { ...(pairs || {}) };
  const list = [...new Set(ratees)].filter(b => b !== hk);
  if (list.length) out[hk] = list; else delete out[hk];
  return out;
}
