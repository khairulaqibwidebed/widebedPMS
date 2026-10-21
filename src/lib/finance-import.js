// Reads Finance's own Rental Income Statement workbook (e.g. "8. DM Aug26 Rental Income Statement.xlsx")
// so past months can be kept as reference: what each owner was paid, and each unit's Monthly Payout Summary.
// Pure: takes a SheetJS workbook (read with cellDates: true), returns plain data. Cells are found by their
// labels, not fixed positions, because Finance's files shift rows from month to month.

const UNIT = /^[A-Z]{1,4} \d[\w-]*$/;           // DM 0719, DM 1408-2, DM 1513A
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

export function parseFinanceStatement(X, wb) {
  const warnings = [];
  const pto = findSheet(wb, /^payment to owner$/i);
  if (!pto) throw new Error('This file has no "Payment To Owner" sheet. Use Finance\'s Rental Income Statement workbook.');
  const pRows = rowsOf(X, pto);
  const propertyCode = text(labelValue(pRows, /^property$/i)).replace(/^:\s*/, '').toUpperCase();
  const month = monthOf(labelValue(pRows, /^month$/i));
  if (!month) throw new Error('Could not find the month on the "Payment To Owner" sheet (the cell next to "Month").');

  // Payment To Owner: header row has "Payment To Owner"; unit rows have a unit code
  const hIdx = pRows.findIndex(r => r.some(c => /^payment to owner$/i.test(text(c))));
  const head = pRows[hIdx] || [];
  const col = re => head.findIndex(c => re.test(text(c)));
  const cIncome = col(/rental income/i), cCharges = col(/fees|charges/i), cPay = col(/^payment to owner$/i), cRemark = col(/^remark/i);
  const units = new Map();
  for (const r of pRows.slice(hIdx + 1)) {
    const ci = r.findIndex(c => UNIT.test(unitCodeOf(c)));
    if (ci < 0 || ci > Math.max(cIncome, 2)) continue;
    const code = unitCodeOf(r[ci]);
    const income = num(r[cIncome]), charges = num(r[cCharges]) ?? 0, payout = num(r[cPay]);
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
