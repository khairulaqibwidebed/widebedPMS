// lib/agreements/format.js — how a value looks in the grid, the form and the finished PDF.
import { ISO_DATE, roundHalfUp } from './formula.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

export const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', example: '01/03/2026' },
  { value: 'D MMMM YYYY', example: '1 March 2026' },
  { value: 'Do MMMM YYYY', example: '1st March 2026' },
  { value: 'DD MMM YYYY', example: '01 Mar 2026' },
  { value: 'DD-MM-YYYY', example: '01-03-2026' },
  { value: 'YYYY-MM-DD', example: '2026-03-01' }
];

export function formatDate(iso, pattern = 'DD/MM/YYYY') {
  if (!ISO_DATE.test(iso || '')) return String(iso ?? '');
  const [y, m, d] = iso.split('-').map(Number);
  const parts = { YYYY: String(y), YY: String(y).slice(-2), MMMM: MONTHS[m - 1], MMM: MONTHS[m - 1].slice(0, 3),
    MM: String(m).padStart(2, '0'), M: String(m), Do: ordinal(d), DD: String(d).padStart(2, '0'), D: String(d) };
  return pattern.replace(/YYYY|YY|MMMM|MMM|MM|M|Do|DD|D/g, t => parts[t]);
}

const group = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export function money(n, { prefix = 'RM ', decimals = 2 } = {}) {
  const fixed = roundHalfUp(Math.abs(n), decimals).toFixed(decimals);
  const [i, d] = fixed.split('.');
  return (n < 0 ? '-' : '') + prefix + group(i) + (d ? '.' + d : '');
}
function number(n, fmt) {
  const d = fmt.decimals === '' || fmt.decimals === undefined || fmt.decimals === null ? null : Number(fmt.decimals);
  let s = d === null ? String(n) : roundHalfUp(n, d).toFixed(d);
  if (fmt.thousands) { const [i, f] = s.replace('-', '').split('.'); s = (n < 0 ? '-' : '') + group(i) + (f ? '.' + f : ''); }
  return (fmt.prefix || '') + s + (fmt.suffix || '');
}
function textCase(s, c) {
  if (c === 'upper') return s.toUpperCase();
  if (c === 'lower') return s.toLowerCase();
  if (c === 'title') return s.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (all, a, b) => a + b.toUpperCase());
  return s;
}

// The type a value really is (a formula takes the type of its answer).
export const valueType = f => (f.type === 'formula' ? f.resultType || 'number' : f.type);
export const isBlank = v => v === null || v === undefined || v === '';

export function formatValue(field, value) {
  if (value && typeof value === 'object' && value.error) return value.error;
  if (isBlank(value)) return '';
  const fmt = field.format || {};
  switch (valueType(field)) {
    case 'currency': { const n = Number(value); return Number.isFinite(n) ? money(n, { prefix: fmt.prefix ?? 'RM ', decimals: fmt.decimals ?? 2 }) : String(value); }
    case 'number': { const n = Number(value); return Number.isFinite(n) ? number(n, fmt) : String(value); }
    case 'date': return formatDate(value, fmt.date || 'DD/MM/YYYY');
    case 'checkbox': case 'boolean': return value === true || value === 'true' ? (fmt.yes ?? 'Yes') : (fmt.no ?? 'No');
    case 'signature': return 'Signed';
    case 'image': case 'file': return value.name || 'File';
    default: return textCase(String(value), fmt.case);
  }
}

// Plain values for CSV/Excel export: numbers stay numbers, dates stay YYYY-MM-DD.
export function exportValue(field, value) {
  if (value && typeof value === 'object' && value.error) return value.error;
  if (isBlank(value)) return '';
  const t = valueType(field);
  if (t === 'number' || t === 'currency') { const n = Number(value); return Number.isFinite(n) ? n : String(value); }
  if (t === 'checkbox' || t === 'boolean') return value === true || value === 'true' ? 'Yes' : 'No';
  if (t === 'signature') return 'Signed';
  if (t === 'image' || t === 'file') return value.name || '';
  return String(value);
}

// A typed or imported value turned into what the field stores. Returns undefined when it can't be read.
export function parseInput(field, raw) {
  const t = field.type;
  if (raw === null || raw === undefined) return '';
  if (t === 'number' || t === 'currency') {
    if (typeof raw === 'number') return raw;
    const s = String(raw).trim().replace(/^RM/i, '').replace(/[,\s]/g, '');
    if (s === '') return '';
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }
  if (t === 'checkbox') {
    if (typeof raw === 'boolean') return raw;
    const s = String(raw).trim().toLowerCase();
    if (['yes', 'y', 'true', '1', '✓', 'x'].includes(s)) return true;
    if (['no', 'n', 'false', '0', ''].includes(s)) return false;
    return undefined;
  }
  if (t === 'date') {
    if (typeof raw === 'number') return new Date(Math.round((raw - 25569) * 86400000)).toISOString().slice(0, 10);   // Excel serial day
    if (raw instanceof Date) return raw.toISOString().slice(0, 10);
    const s = String(raw).trim();
    if (s === '') return '';
    if (ISO_DATE.test(s)) return s;
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);   // DD/MM/YYYY
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return undefined;
  }
  if (['signature', 'image', 'file', 'formula', 'section'].includes(t)) return undefined;
  return String(raw);
}
