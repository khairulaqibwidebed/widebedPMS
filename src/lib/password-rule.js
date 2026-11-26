// Strong password rule for email staff accounts (26 Nov 2026). KEEP IN STEP with strongPassword in api/login-guard.js.
// Housekeeping (username) accounts keep their own simpler rule in lib/housekeeping.js (Khairul: HR sets those).
export const PW_RULES = [
  { id: 'len', label: '8 or more characters', ok: p => p.length >= 8 },
  { id: 'upper', label: 'A capital letter', ok: p => /[A-Z]/.test(p) },
  { id: 'lower', label: 'A small letter', ok: p => /[a-z]/.test(p) },
  { id: 'num', label: 'A number', ok: p => /[0-9]/.test(p) },
  { id: 'sym', label: 'A symbol, like ! @ # or -', ok: p => /[^A-Za-z0-9]/.test(p) }
];
export const passwordProblem = p => (String(p || '').length > 128 ? 'Use 128 characters or fewer.'
  : PW_RULES.every(r => r.ok(String(p || ''))) ? '' : 'The password needs 8 or more characters with a capital letter, a small letter, a number and a symbol.');
