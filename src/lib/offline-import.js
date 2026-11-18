// ONE-TIME import (18 Nov 2026): the old "Offline Payment Check System" Excel (Sales Statement tab) into offlinePayments.
// Used by the Director-only "Import from Excel" button on Finance > Offline Payments. Remove this file and the button
// once the import is done. Pure functions here (no Firestore), so the same parsing can be checked against the real file.

export const SHEET = 'Sales Statement';
const HEAD = ['Submitted By', 'Payment Date', 'Property Name', 'Unit Number', 'Payment Amount (RM)', 'Guest Name', 'Payment Purpose',
  'Bank Reference No.', 'Supporting Documents', 'Verification Status', 'Verified By', 'Verification Date', 'Remarks'];

const s = v => (v == null ? '' : String(v)).replace(/\r/g, '').trim();
const pad = n => String(n).padStart(2, '0');
// Excel day number (e.g. 46238) or text such as 2026-08-15T00:00:00.000Z / 2026-08-15 -> YYYY-MM-DD
export function toDate(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const t = s(v), m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);   // 15/08/2026 (day first, Malaysia)
  return d ? `${d[3]}-${pad(d[2])}-${pad(d[1])}` : '';
}
export const toAmount = v => {
  const n = typeof v === 'number' ? v : parseFloat(s(v).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
export const norm = v => s(v).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ');
// Unit codes compared without spaces, dashes, case, a note in brackets or a *: "DM 15-14" = "DM-1514" = "dm 15-14 (2br)"
export const unitKey = v => s(v).toUpperCase().replace(/\(.*?\)/g, '').replace(/[\s*\-_.\/]/g, '');
// The code a new unit gets: the sheet text without the note in brackets or the *, single spaces
export const cleanCode = v => s(v).replace(/\(.*?\)/g, '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
// The email part before @, without ".widebed" and digits, as a name: nabihah.widebed@gmail.com -> Nabihah
export const nameFromEmail = e => { const p = s(e).split('@')[0].replace(/\.?widebed/i, '').replace(/[._\d]+/g, ' ').trim(); return p ? p.replace(/\b\w/g, c => c.toUpperCase()) : ''; };
// Same payment: date, amount and guest (then bank reference and unit) match. Used for "already in the PMS" and repeats in the file.
export const sameKey = r => [r.date, Number(r.amount || 0).toFixed(2), norm(r.guest), norm(r.bankRef), unitKey(r.unitCode)].join('|');

// rows: the Sales Statement as an array of arrays (header row first)
export function parseSheet(rows) {
  const head = (rows[0] || []).map(s);
  const col = name => head.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const at = HEAD.map(col);
  const missing = HEAD.filter((_, i) => at[i] < 0);
  if (missing.length) throw Object.assign(new Error(`This is not the Sales Statement tab: missing ${missing.join(', ')}.`), { plain: true });
  const get = (r, i) => r[at[i]];
  const out = [], skipped = [];
  rows.slice(1).forEach((r, i) => {
    const row = i + 2;   // the Excel row number
    if (!r || !r.some(v => s(v))) return;   // fully empty rows are not counted
    const amount = toAmount(get(r, 4)), date = toDate(get(r, 1));
    if (!(amount > 0)) { skipped.push({ row, why: 'No amount', text: [s(get(r, 9)), s(get(r, 10)), s(get(r, 12))].filter(Boolean).join(' · ') }); return; }
    if (!date) { skipped.push({ row, why: 'No payment date', text: `RM ${amount.toFixed(2)} ${s(get(r, 5))}` }); return; }
    const st = s(get(r, 9));
    out.push({
      row, date, amount,
      sheetProperty: s(get(r, 2)), unitCode: s(get(r, 3)).replace(/^-$/, ''),
      guest: s(get(r, 5)), purpose: s(get(r, 6)), bankRef: s(get(r, 7)), docsLink: s(get(r, 8)),
      status: /^checked$/i.test(st) ? 'Checked' : 'Pending',   // empty or anything else -> Pending
      verifiedEmail: s(get(r, 10)).toLowerCase(), verifiedDate: toDate(get(r, 11)), remarks: s(get(r, 12)),
      submittedByName: s(get(r, 0)).replace(/\s+/g, ' ')
    });
  });
  return { rows: out, skipped };
}

// Every name a PMS unit is known by (unit code, eZee name, other eZee names) -> the unit
export function unitIndex(units) {
  const m = new Map();
  for (const u of units) for (const n of [u.unitCode, u.ezeeRoomMatch, ...(u.aliases || [])]) { const k = unitKey(n); if (k && !m.has(k)) m.set(k, u); }
  return m;
}
const lev = (a, b) => {   // edit distance, small strings only
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const digits = k => k.replace(/[^0-9]/g, '');
// PMS units that look like this sheet unit (for the Director to confirm): one contains the other, the same numbers
// with a different letter, or one character different. Best first, at most 5.
export function similarUnits(key, units) {
  if (!key) return [];
  const out = [];
  for (const u of units) {
    const ks = [u.unitCode, u.ezeeRoomMatch, ...(u.aliases || [])].map(unitKey).filter(Boolean);
    let score = 0;
    for (const k of ks) {
      if (k.length >= 4 && key.length >= 4 && (k.includes(key) || key.includes(k))) score = Math.max(score, 3);
      if (digits(k).length >= 3 && digits(k) === digits(key) && k.replace(/[0-9]/g, '')[0] === key.replace(/[0-9]/g, '')[0]) score = Math.max(score, 2);
      if (k.length >= 5 && lev(k, key) <= 1) score = Math.max(score, 1);
    }
    if (score) out.push({ u, score });
  }
  return out.sort((a, b) => b.score - a.score || a.u.unitCode.localeCompare(b.u.unitCode)).slice(0, 5).map(x => x.u);
}
// The property a new unit most likely belongs to: the property of most PMS units starting with the same letters (DM, N, CS B ...)
export function guessProperty(code, units) {
  const pre = s(code).toUpperCase().match(/^[A-Z]+(?:\s[A-Z](?=[\s-]))?/)?.[0];
  if (!pre) return '';
  const n = {};
  units.forEach(u => { if (s(u.unitCode).toUpperCase().match(/^[A-Z]+(?:\s[A-Z](?=[\s-]))?/)?.[0] === pre) n[u.propertyId] = (n[u.propertyId] || 0) + 1; });
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

// Each payment gets its PMS property and unit:
//  - a sheet unit found in the PMS (any property): that unit and its property
//  - not found: the Director's choice in `choice[unitKey]`: { use: <unit id> | 'new' | 'text', code, propertyId }
//      <unit id>: the same unit as an existing PMS unit; 'new': a unit created with `code` in `propertyId`;
//      'text': no unit created, the sheet text kept (property optional)
//  - no unit in the sheet (e.g. HQ): the property by name, or the Director's choice in `map[norm(name)]` ('-' = none)
// how: 'found' | 'same' | 'new' | 'text' | 'name' | 'none' | 'pending' (needs a choice)
export function matchRows(list, properties, units, choice = {}, map = {}) {
  const idx = unitIndex(units), byId = new Map(units.map(u => [u.id, u])), byName = new Map(properties.map(p => [norm(p.name), p]));
  const propName = id => properties.find(p => p.id === id)?.name || '';
  return list.map(r => {
    const base = { ...r, roomType: r.sheetProperty };
    const k = unitKey(r.unitCode);
    if (k) {
      const u = idx.get(k);
      if (u) return { ...base, how: 'found', propertyId: u.propertyId, propertyName: propName(u.propertyId), unitCode: u.unitCode };
      const c = choice[k] || {};
      const same = c.use && byId.get(c.use);
      if (same) return { ...base, how: 'same', propertyId: same.propertyId, propertyName: propName(same.propertyId), unitCode: same.unitCode };
      if (c.use === 'new' && c.propertyId && cleanCode(c.code)) return { ...base, how: 'new', propertyId: c.propertyId, propertyName: propName(c.propertyId), unitCode: cleanCode(c.code) };
      if (c.use === 'text') return { ...base, how: 'text', propertyId: c.propertyId || '', propertyName: c.propertyId ? propName(c.propertyId) : r.sheetProperty };
      return { ...base, how: 'pending', propertyId: '', propertyName: r.sheetProperty };
    }
    const pick = map[norm(r.sheetProperty)];
    const p = pick === '-' ? null : pick ? properties.find(x => x.id === pick) : byName.get(norm(r.sheetProperty));
    if (p) return { ...base, how: 'name', propertyId: p.id, propertyName: p.name, unitCode: '' };
    return { ...base, how: pick === '-' || !r.sheetProperty ? 'none' : 'pending', propertyId: '', propertyName: r.sheetProperty, unitCode: '' };
  });
}
