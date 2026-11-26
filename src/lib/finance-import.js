// Reads Finance's own Rental Income Statement workbook (e.g. "8. DM Aug26 Rental Income Statement.xlsx")
// so past months can be kept as reference: what each owner was paid, and each unit's Monthly Payout Summary.
// Pure: takes a SheetJS workbook (read with cellDates: true), returns plain data. Cells are found by their
// labels, not fixed positions, because Finance's files shift rows from month to month.

const UNIT = /^[A-Z]{1,4} [A-Z]?\d[\w-]*$/;           // DM 0719, DM 1408-2, DM 1513A
const num = v => (typeof v === 'number' && isFinite(v) ? v : null);
const text = v => (v == null ? '' : String(v).trim());
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const ym = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const iso = d => { const x = new Date(d.getTime() + 12 * 3600e3); return `${ym(x)}-${String(x.getDate()).padStart(2, '0')}`; };
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// "Aug-26", "Aug 2026", "AUG26" or a real date -> "2026-08"
function monthOf(v) {
  if (v instanceof Date && !isNaN(v)) return ym(new Date(v.getTime() + 12 * 3600e3)); // dates arrive at local midnight; nudge past any timezone shift
  const m = text(v).toLowerCase().match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-']*(\d{2,4})/);
  if (!m) return null;
  const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return `${y}-${String(MON[m[1]]).padStart(2, '0')}`;
}
const unitCodeOf = v => text(v).replace(/\s+/g, ' ').toUpperCase();

function rowsOf(X, ws) {
  return X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
}
// Value in the first non-empty cell to the right of a label cell
function labelValue(rows, re, maxRows = 12) {
  for (const r of rows.slice(0, maxRows)) {
    const i = r.findIndex(c => re.test(text(c)));
    if (i >= 0) { const v = r.slice(i + 1).find(c => text(c) !== ''); if (v != null) return v; }
  }
  return null;
}
function findSheet(wb, re) { const n = wb.SheetNames.find(s => re.test(s.trim())); return n ? wb.Sheets[n] : null; }

// Sheet as text cells the eZee reader understands. Real Excel dates become d/m/yyyy whatever format Finance gave the cell.
export function sheetText(X, ws) {
  return X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).map(r => r.map(c => {
    if (c instanceof Date) { const x = new Date(c.getTime() + 12 * 3600e3); return `${x.getDate()}/${x.getMonth() + 1}/${x.getFullYear()}`; }
    return c == null ? '' : String(c);
  }));
}

// One unit's MONTHLY STATEMENT sheet: booking lines above the Monthly Payout Summary (at = its row), the fee labels
// (they tell the arrangement) and the summary's month -> payout values. Shared by every statement layout.
function readUnitSheet(rows, at) {
  // Daily rental lines at the top of the sheet: Source, Reference, Check In, Check Out, Nights, Currency, Amount
  const lines = [];
  const lh = rows.findIndex(r => r.some(c => /^source$/i.test(text(c))) && r.some(c => /^check ?in$/i.test(text(c))));
  if (lh >= 0 && lh < at) {
    const H = rows[lh], lc = re => H.findIndex(c => re.test(text(c)));
    const cS = lc(/^source$/i), cRef = lc(/^reference$/i), cIn = lc(/^check ?in$/i), cOut = lc(/^check ?out$/i), cN = lc(/^nights$/i), cA = lc(/^amount$/i);
    for (const r of rows.slice(lh + 1, at)) {
      if (!text(r[cS]) || !(r[cOut] instanceof Date) || num(r[cA]) == null) { if (!text(r[cS])) break; continue; }
      lines.push({ source: text(r[cS]), reference: cRef >= 0 ? text(r[cRef]) : '', arrival: r[cIn] instanceof Date ? iso(r[cIn]) : '',
        departure: iso(r[cOut]), nights: num(r[cN]), amount: r2(r[cA]) });
    }
  }
  // Fee labels on the statement tell the arrangement: "Service Fees (20%)", "Utilities (20%)", "SST (8%)"
  const pctIn = re => { for (const r of rows.slice(0, at)) for (const c of r) { const t = text(c); if (re.test(t)) { const m = t.match(/\((\d+(?:\.\d+)?)\s*%\)/); return m ? Number(m[1]) / 100 : 0; } } return null; };
  const svc = pctIn(/^service fee/i), util = pctIn(/^utilit/i), sst = pctIn(/^sst\b/i);
  let terms = null;
  if (svc != null) {
    if (sst != null || svc < 0.2) terms = { arrangement: 'longTermTenant', serviceFeePct: svc, utilityFeePct: util || 0, sstOnFeePct: sst || 0 };
    else terms = { arrangement: util ? 'profitShare40' : 'profitShare20', serviceFeePct: svc, utilityFeePct: util || 0, sstOnFeePct: 0 };
  }
  const values = {};
  for (let i = at + 1; i < Math.min(rows.length - 1, at + 8); i++) {
    const dates = rows[i], vals = rows[i + 1];
    if (!dates.some(c => c instanceof Date)) continue;
    dates.forEach((d, c) => { if (d instanceof Date && num(vals[c]) != null) values[monthOf(d)] = r2(vals[c]); });
    i++;
  }
  return { lines, terms, values };
}

export function parseFinanceStatement(X, wb) {
  const warnings = [];
  const pto = findSheet(wb, /^payment to owner$/i);
  if (!pto) throw new Error('This file has no "Payment To Owner" sheet. Use Accounting\'s Rental Income Statement workbook.');
  const pRows = rowsOf(X, pto);
  const propertyCode = text(labelValue(pRows, /^property$/i)).replace(/^:\s*/, '').toUpperCase();
  const month = monthOf(labelValue(pRows, /^month$/i));
  if (!month) throw new Error('Could not find the month on the "Payment To Owner" sheet (the cell next to "Month").');

  // Some buildings (e.g. Windmill) list bare codes like "B1906"; the unit sheets are "WM B1906", so borrow that prefix
  const BARE = /^[A-Z]\d{3,5}[A-Z]?$/;
  const sheetPrefix = (wb.SheetNames.map(n => n.trim().match(/^([A-Z]{2,4}) [A-Z]\d{3,5}[A-Z]?$/)).find(Boolean) || [])[1] || '';
  const withPrefix = v => { const t = unitCodeOf(v); return BARE.test(t) && sheetPrefix ? `${sheetPrefix} ${t}` : t; };

  // Payment To Owner: header row has "Payment To Owner"; unit rows have a unit code
  const hIdx = pRows.findIndex(r => r.some(c => /^payment to owner$/i.test(text(c))));
  const head = pRows[hIdx] || [];
  const col = re => head.findIndex(c => re.test(text(c)));
  const cIncome = col(/rental income/i), cCharges = col(/fees|charges/i), cPay = col(/^payment to owner$/i), cRemark = col(/^remark/i);
  const units = new Map();
  for (const r of pRows.slice(hIdx + 1)) {
    const ci = r.findIndex(c => UNIT.test(withPrefix(c)));
    if (ci < 0 || ci > Math.max(cIncome, 2)) continue;
    const code = withPrefix(r[ci]);
    const income = cIncome >= 0 ? num(r[cIncome]) : null, charges = (cCharges >= 0 ? num(r[cCharges]) : null) ?? 0, payout = num(r[cPay]);
    if (payout == null && income == null) continue;
    const remark = cRemark >= 0 ? text(r[cRemark]) : '';
    units.set(code, { unitCode: code, totalIncome: income, charges, payout: payout ?? r2((income || 0) - charges),
      fixed: /fixed/i.test(remark), remark: /^fixed$/i.test(remark) ? '' : remark, from: 'Payment To Owner' });
  }
  if (!units.size) throw new Error('No unit rows found on the "Payment To Owner" sheet.');

  // FIXED RENT sheet: the detailed version (deductions with invoice numbers, B/F). Its payment wins for fixed-rent units.
  const fx = findSheet(wb, /^fixed rent$/i);
  if (fx) {
    const fRows = rowsOf(X, fx);
    const fh = fRows.findIndex(r => r.some(c => /^unit/i.test(text(c))) && r.some(c => /payment to owner/i.test(text(c))));
    if (fh >= 0) {
      const H = fRows[fh], fc = re => H.findIndex(c => re.test(text(c)));
      const cU = fc(/^unit/i), cRent = fc(/fixed rent/i), cDed = fc(/deduction/i), cP = fc(/payment to owner/i), cR = fc(/^remark/i);
      for (const r of fRows.slice(fh + 1)) {
        const code = unitCodeOf(r[cU]);
        if (!UNIT.test(code)) continue;
        const rent = num(r[cRent]), ded = num(r[cDed]) ?? 0, pay = num(r[cP]) ?? r2((rent || 0) - ded), remark = cR >= 0 ? text(r[cR]) : '';
        const before = units.get(code);
        if (before && Math.abs(before.payout - pay) >= 0.05)
          warnings.push(`${code}: Payment To Owner sheet says ${before.payout.toFixed(2)}, FIXED RENT sheet says ${pay.toFixed(2)}${remark ? ` (${remark})` : ''}. Using the FIXED RENT sheet.`);
        units.set(code, { unitCode: code, totalIncome: rent, charges: ded, payout: pay, fixed: true, remark, from: 'FIXED RENT' });
      }
    }
  }

  // Unit sheets ("D 0719"): Monthly Payout Summary = a row of month dates, then a row of payouts (twice: Jan-Jun, Jul-Dec)
  const summaries = [];
  for (const name of wb.SheetNames) {
    const rows = rowsOf(X, wb.Sheets[name]);
    const at = rows.findIndex(r => r.some(c => /monthly payout summary/i.test(text(c))));
    if (at < 0) continue;
    let code = unitCodeOf(labelValue(rows, /^property$/i, 10));
    if (!UNIT.test(code)) code = unitCodeOf(name.replace(/^([A-Z])\s/, (m, a) => (propertyCode && propertyCode[0] === a ? propertyCode : a) + ' '));
    if (!UNIT.test(code)) { warnings.push(`Sheet "${name}": could not tell which unit it is, skipped.`); continue; }
    const { lines, terms, values } = readUnitSheet(rows, at);
    if (Object.keys(values).length || lines.length) summaries.push({ unitCode: code, sheet: name, values, lines, terms });
  }
  // The summary's own value for this month should match what Payment To Owner says
  for (const s of summaries) {
    const u = units.get(s.unitCode), v = s.values[month];
    if (u && v != null && Math.abs(u.payout - v) >= 0.05 && !u.fixed)
      warnings.push(`${s.unitCode}: its statement sheet shows ${v.toFixed(2)} for this month, Payment To Owner shows ${u.payout.toFixed(2)}. Using Payment To Owner.`);
  }
  // The full eZee report Finance pasted in ("AUG26 ALL"): the sheet with "Reservation No" and the most rows, as text cells
  let ezeeRows = null, best = 0;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const peek = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, range: 0 }).slice(0, 15);
    if (!peek.some(r => r.some(c => text(c) === 'Reservation No'))) continue;
    const rows = sheetText(X, ws);
    const score = rows.length + (/all/i.test(name) ? 1e6 : 0);
    if (score > best) { best = score; ezeeRows = rows; }
  }
  return { propertyCode, month, ezeeRows, units: [...units.values()].map(u => ({ ...u, payout: r2(u.payout), charges: r2(u.charges || 0) })), summaries, warnings };
}

// ---------- Per-unit statement workbooks (CS, Robertson; 26 Nov 2026) ----------
// Some buildings' statements have no "Payment To Owner" sheet: one MONTHLY STATEMENT tab per unit, and sometimes a
// "Summary" tab (unit, Total Rental Income, Service Fees & Charges, Payment To Owner, Remark). Read as a past-month
// reference, the same way as the D'Majestic workbook: each unit's payout (negative = balance carried forward) and its
// Monthly Payout Summary. The figures are Finance's own (Summary first, else the unit tab's Nett Receivable).
const COMPACT = /^([A-Z])(\d{2}A?)(\d{2}[A-Z]?)$/;            // Summary's "B0703A" / "B13A29" -> "B-07-03A" / "B-13A-29"
const flat = v => text(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
const bareUnit = c => text(c).toUpperCase().replace(/^[A-Z]{2,4} (?=[A-Z0-9])/, '');
// Code without the building prefix, without dashes: "CS B-07-03A" and "CS B0703A" both give "B0703A"
export const flatUnit = c => flat(bareUnit(c));
// Looser still, for the Portfolio: dash parts without leading zeros, "B-07-3A" = "B-07-03A"
export const looseUnit = c => bareUnit(c).split(/[^A-Z0-9]+/).filter(Boolean).map(x => x.replace(/^0+(?=\d)/, '')).join('-');
// "Robertson S-30-09" -> building "Robertson", unit "S-30-09"; "CS B-07-3a Queen" -> "CS", "B-07-3A"
function buildingUnit(v) {
  const words = text(v).split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const m = /^[A-Za-z]{0,2}-?\d[\dA-Za-z]*(?:-[\dA-Za-z]+)*/.exec(words[i]);
    if (m && /\d/.test(m[0])) return { building: words.slice(0, i).join(' '), unit: m[0].toUpperCase() };
  }
  return null;
}
const prefixOf = b => { const w = text(b).toUpperCase().split(/[^A-Z0-9]+/).filter(x => x && x !== 'THE' && x !== 'AT'); return !w.length ? '' : w.length === 1 ? w[0].slice(0, 4) : w.map(x => x[0]).join('').slice(0, 4); };
const isStatementSheet = rows => rows.slice(0, 10).some(r => r.some(c => /^monthly statement$/i.test(text(c))));
const findSummary = (X, wb) => {
  const n = wb.SheetNames.find(s => /^summary$/i.test(s.trim()));
  if (!n) return null;
  const rows = rowsOf(X, wb.Sheets[n]);
  return rows.some(r => r.some(c => /^payment to owner$/i.test(text(c)))) ? rows : null;
};
// True when the workbook is this layout (so the Upload page doesn't treat it as an eZee report)
export function isUnitStatementBook(X, wb) {
  if (wb.SheetNames.some(n => /^payment to owner$/i.test(n.trim()))) return false;
  return !!findSummary(X, wb) || wb.SheetNames.some(n => isStatementSheet(rowsOf(X, wb.Sheets[n]).slice(0, 10)));
}

export function parseUnitStatements(X, wb) {
  const warnings = [];
  const sheets = [];
  let building = '', month = null;
  const tabs = wb.SheetNames.map(name => ({ name, rows: rowsOf(X, wb.Sheets[name]) })).filter(t => isStatementSheet(t.rows));
  const summary = findSummary(X, wb);
  // The file's month: the Summary's, else the month most unit tabs show (a tab or two may already be next month's)
  const tally = {};
  for (const t of tabs) { const m = monthOf(labelValue(t.rows, /^month$/i, 10)); if (m) tally[m] = (tally[m] || 0) + 1; }
  month = (summary && monthOf(labelValue(summary, /^month$/i))) || Object.keys(tally).sort((a, b) => tally[b] - tally[a] || a.localeCompare(b))[0] || null;
  for (const { name, rows } of tabs) {
    const prop = labelValue(rows, /^property$/i, 10), bu = buildingUnit(prop);
    const m = monthOf(labelValue(rows, /^month$/i, 10));
    if (m && m !== month) { warnings.push(`Sheet "${name}" is for ${m}, the rest of the file is ${month}. Skipped.`); continue; }
    // The tab name is the unit when it reads "CS B-07-03a"; otherwise ("RBS3009") the Property cell says it
    const byName = /^[A-Z]{2,4} [A-Z]?-?\d[\w-]*$/i.test(name.trim()) ? name.trim().toUpperCase() : '';
    if (!building && bu) building = bu.building;
    const unit = byName ? bareUnit(byName) : bu ? bu.unit : '';
    if (!unit) { warnings.push(`Sheet "${name}": could not tell which unit it is, skipped.`); continue; }
    const at0 = rows.findIndex(r => r.some(c => /monthly payout summary/i.test(text(c))));
    const at = at0 < 0 ? rows.length : at0;
    const top = rows.slice(0, at);
    const val = re => { for (const r of top) { const i = r.findIndex(c => re.test(text(c))); if (i >= 0) { const v = r.slice(i + 1).find(c => num(c) != null); if (v != null) return v; } } return null; };
    const income = val(/^total receivable$/i);
    const nett = val(/^nett receivable \(rounding\)$/i) ?? val(/^nett receivable$/i);
    sheets.push({ name, unit, prefix: byName ? byName.split(' ')[0] : '', income, nett, ...readUnitSheet(rows, at) });
  }
  if (!sheets.length && !summary) throw new Error(warnings[0] || 'No unit statement tabs ("MONTHLY STATEMENT") found in this file.');
  if (summary) {
    const sp = text(labelValue(summary, /^property$/i));
    if (sp) building = sp;
  }
  if (!month) throw new Error('Could not find the month in this file (the cell next to "Month").');
  const sumCode = summary ? summary.flat().map(text).find(c => /^[A-Z]{2,4} [A-Z]?-?\d[\w-]*$/.test(c)) : '';
  const prefix = sheets.find(s => s.prefix)?.prefix || (sumCode ? sumCode.split(' ')[0] : '') || prefixOf(building) || 'NEW';
  const codeOf = u => `${prefix} ${u}`;

  const units = new Map();
  const byFlat = new Map(sheets.map(s => [flatUnit(s.unit), s]));
  if (summary) {
    const hIdx = summary.findIndex(r => r.some(c => /^payment to owner$/i.test(text(c))));
    const head = summary[hIdx];
    const col = re => head.findIndex(c => re.test(text(c)));
    const cIncome = col(/rental income/i), cCharges = col(/fees|charges/i), cPay = col(/^payment to owner$/i), cRemark = col(/^remark/i);
    for (const r of summary.slice(hIdx + 1)) {
      const ci = r.findIndex(c => /^[A-Z]{1,4} [A-Z]?\d[\w-]*$/i.test(text(c)));
      if (ci < 0 || ci >= cPay) continue;
      const payout = num(r[cPay]), income = cIncome >= 0 ? num(r[cIncome]) : null, charges = cCharges >= 0 ? num(r[cCharges]) : null;
      if (payout == null && income == null) continue;   // listed with no figures: not on this month's statement
      const raw = bareUnit(r[ci]);
      let sh = byFlat.get(flat(raw));
      if (!sh && payout != null) {
        // A typo on the Summary ("B0723A" for tab "CS B-07-24"): pair it with the one leftover tab showing the same payout
        const listed = new Set(summary.slice(hIdx + 1).flatMap(x => x.map(c => flat(bareUnit(c)))));
        const left = sheets.filter(t => !listed.has(flatUnit(t.unit)) && t.nett != null && Math.abs(r2(t.nett) - payout) < 0.05);
        if (left.length === 1) { sh = left[0]; warnings.push(`${codeOf(raw.replace(COMPACT, '$1-$2-$3'))} on the Summary has no tab of its own; its payout matches tab "${sh.name}", so it is read as ${codeOf(sh.unit)}. Check the Summary.`); }
      }
      const unit = sh ? sh.unit : raw.replace(COMPACT, '$1-$2-$3');
      if (!sh) warnings.push(`${codeOf(unit)}: on the Summary but has no unit tab. Using the Summary figure.`);
      const remark = cRemark >= 0 ? text(r[cRemark]) : '';
      const pay = payout ?? r2((income || 0) - (charges || 0));
      units.set(codeOf(unit), { unitCode: codeOf(unit), totalIncome: income ?? 0, charges: charges ?? r2((income || 0) - pay), payout: pay,
        fixed: /fixed/i.test(remark), remark: /^fixed$/i.test(remark) ? '' : remark, from: 'Summary' });
      if (sh && sh.nett != null && Math.abs(r2(sh.nett) - pay) >= 0.05)
        warnings.push(`${codeOf(unit)}: its unit tab shows ${r2(sh.nett).toFixed(2)}, the Summary shows ${pay.toFixed(2)}. Using the Summary.`);
    }
  }
  // Unit tabs not on the Summary (or no Summary at all, e.g. Robertson): Nett Receivable is the payout
  for (const s of sheets) {
    const code = codeOf(s.unit);
    if (units.has(code)) continue;
    if (summary) { warnings.push(`${code}: has a unit tab but no figures on the Summary. Using its tab's Nett Receivable.`); }
    if (s.nett == null) { warnings.push(`${code}: no Nett Receivable on its tab, skipped.`); continue; }
    const pay = r2(s.nett), income = s.income ?? 0;
    units.set(code, { unitCode: code, totalIncome: income, charges: r2(income - pay), payout: pay, fixed: false, remark: '', from: 'Unit tab' });
  }
  if (!units.size) throw new Error('No unit payouts found in this file.');
  const summaries = sheets.filter(s => Object.keys(s.values).length || s.lines.length)
    .map(s => ({ unitCode: codeOf(s.unit), sheet: s.name, values: s.values, lines: s.lines, terms: s.terms }));
  for (const s of summaries) {
    const u = units.get(s.unitCode), v = s.values[month];
    if (u && v != null && Math.abs(u.payout - v) >= 0.05)
      warnings.push(`${s.unitCode}: its Monthly Payout Summary shows ${v.toFixed(2)} for this month, the statement shows ${u.payout.toFixed(2)}. Using the statement.`);
  }
  return { layout: summary ? 'summary' : 'unitTabs', propertyCode: prefix, propertyName: building, month, ezeeRows: null,
    units: [...units.values()].map(u => ({ ...u, payout: r2(u.payout), charges: r2(u.charges || 0) })), summaries, warnings };
}

// ---------- Upload only what changed (scale work, 22 Oct 2026) ----------
// rawHash: a fingerprint of everything an upload writes on a booking (the eZee row's columns, the amounts read from
// them, unit, status, and Finance's amount when it comes from their statement), plus the names kept in private/main.
// The upload skips a booking whose saved rawHash is the same: no write, and its unit's summary stays fresh.
// Fields the upload stamps itself (import batch, times) are not part of it.
const STAMPS = new Set(['importBatchId', 'lastImportedAt', 'firstImportedAt', 'rawHash']);
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}
// cyrb53 (public domain): a fast 53-bit string hash, plenty to tell two versions of one row apart
function cyrb53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export function rowHash(data, priv) {
  const d = {}; for (const [k, v] of Object.entries(data)) if (!STAMPS.has(k)) d[k] = v;
  return 'h1-' + cyrb53(stable({ d, p: priv || {} }));
}
