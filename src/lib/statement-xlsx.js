// Owner statement xlsx, one unit, one month (Khairul 27 Oct: a 1 to 1 copy of Finance's unit sheet, e.g. "D 0719" in
// "DM Sep26 Rental Income Statement"). public/templates/owner-statement.xlsx is that sheet as Finance made it (styles,
// column widths, page setup and the company letterhead in the page header). Only the names and numbers change: the
// template's rows are copied with their styles and filled in. Formulas are kept as Finance writes them, with their
// values, so the file reads the same before Excel recalculates.

const TEMPLATE_URL = '/templates/owner-statement.xlsx';
export const FIXED_RENT_TEMPLATE_URL = '/templates/fixed-rent.xlsx';
const SHEET = 'xl/worksheets/sheet1.xml';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Excel date serial (1900 system) of 'YYYY-MM-DD'
const serial = iso => { const [y, m, d] = iso.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; };
const num = v => (Number.isFinite(v) ? String(v) : '0');
// 0.2 -> "20%", 0.085 -> "8.5%"
const pctLabel = p => `${+(p * 100).toFixed(2)}%`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---- rows of the template sheet, by row number ----
function parseRows(xml) {
  const rows = {};
  for (const m of xml.matchAll(/<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)) rows[m[1]] = m[0];
  return rows;
}
// The row moved to row n (its cells too).
const renum = (row, n) => row.replace(/<row r="\d+"/, `<row r="${n}"`).replace(/(<c r="[A-Z]+)\d+"/g, `$1${n}"`);
// One cell's new content; the cell keeps its style. kind: 'str' | 'num' | 'f' (formula with value) | 'blank'
function setCell(row, col, kind, value, formula) {
  const n = row.match(/<row r="(\d+)"/)[1];
  const re = new RegExp(`<c r="${col}${n}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  const m = row.match(re);
  const style = m ? (m[1].match(/ s="\d+"/) || [''])[0] : '';
  const ref = `${col}${n}`;
  const cell = kind === 'str' ? `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`
    : kind === 'num' ? `<c r="${ref}"${style}><v>${num(value)}</v></c>`
    : kind === 'f' ? `<c r="${ref}"${style}><f>${esc(formula)}</f><v>${num(value)}</v></c>`
    : `<c r="${ref}"${style}/>`;
  if (m) return row.replace(re, cell);
  // Not in the template row: added in column order
  const cells = [...row.matchAll(/<c r="([A-Z]+)\d+"/g)];
  const colNo = c => c.split('').reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0);
  const after = cells.find(c => colNo(c[1]) > colNo(col));
  if (after) return row.replace(after[0], cell + after[0]);
  return row.replace('</row>', cell + '</row>').replace(/<row ([^>]*?)\/>$/, `<row $1>${cell}</row>`);
}
// Expense line under Total Expenses, as on Finance's sheets with expenses (e.g. "D 1203": label E, amount H).
const EXPENSE_ROW = n => `<row r="${n}" spans="1:17" x14ac:dyDescent="0.3"><c r="A${n}" s="88"/><c r="B${n}" s="88"/><c r="C${n}" s="84"/>`
  + `<c r="E${n}" s="121"/><c r="F${n}" s="85"/><c r="G${n}" s="171"/><c r="H${n}" s="122"/></row>`;

// s: { unitCode, month 'YYYY-MM', lines [{ source, reference, arrival, departure, nights, amount }],
//      rates { serviceFeePct, utilityFeePct, sstOnFeePct }, expenses [{ description, amount (signed: expense < 0) }],
//      payout, nextBooking { arrival, departure } | null, payouts { 'YYYY-MM': number } }
export function statementSheetXml(templateXml, s) {
  const head = templateXml.slice(0, templateXml.indexOf('<sheetData>') + '<sheetData>'.length);
  const tail = templateXml.slice(templateXml.indexOf('</sheetData>'));
  const T = parseRows(templateXml.slice(head.length, templateXml.length - tail.length));
  const out = [];
  const put = (proto, n, fill) => { let row = renum(T[proto], n); if (fill) row = fill(row); out.push(row); return n; };
  const [y, mo] = s.month.split('-').map(Number);

  // Letterhead is the page header. Title, property and month (rows 5 to 12 as in the template).
  put(5, 5); put(7, 7); put(8, 8);
  put(9, 9, r => setCell(r, 'B', 'str', s.unitCode));
  put(10, 10, r => setCell(r, 'B', 'str', `${MONTHS[mo - 1]} ${y}`));
  put(12, 12);

  // Bookings (template row 13 for each); one empty row when there are none, as Finance does
  const first = 13;
  const lines = s.lines.length ? s.lines : [null];
  lines.forEach((l, i) => put(13, first + i, r => {
    if (!l) return ['A', 'B', 'C', 'D', 'E', 'G'].reduce((x, c) => setCell(x, c, 'blank'), r);
    r = setCell(r, 'A', 'str', l.source || '');
    r = l.reference ? setCell(r, 'B', 'str', l.reference) : setCell(r, 'B', 'blank');
    r = l.arrival ? setCell(r, 'C', 'num', serial(l.arrival)) : setCell(r, 'C', 'blank');
    r = l.departure ? setCell(r, 'D', 'num', serial(l.departure)) : setCell(r, 'D', 'blank');
    r = setCell(r, 'E', 'num', Number(l.nights) || 0);
    return setCell(r, 'G', 'num', Number(l.amount) || 0);
  }));
  const last = first + lines.length - 1;
  let n = last + 1;

  // Totals block, Finance's formulas
  const R = s.lines.reduce((t, l) => t + (Number(l.amount) || 0), 0);
  const nights = s.lines.reduce((t, l) => t + (Number(l.nights) || 0), 0);
  put(25, n, r => setCell(r, 'E', 'f', nights, `SUM(E${first}:E${last})`));
  const tot = put(26, ++n, r => setCell(r, 'H', 'f', R, `SUM(G${first}:G${last})`));
  const { serviceFeePct: sp = 0, utilityFeePct: up = 0, sstOnFeePct: tp = 0 } = s.rates;
  const svcV = -R * sp;
  const svc = put(27, ++n, r => setCell(setCell(r, 'E', 'str', `Service Fees (${pctLabel(sp)})`), 'H', 'f', svcV, `-H${tot}*${sp}`));
  let lastFee = svc, utilV = 0, sstV = 0;
  if (up) {
    utilV = -R * up;
    lastFee = put(28, ++n, r => setCell(setCell(r, 'E', 'str', `Utilities (${pctLabel(up)})`), 'H', 'f', utilV, up === sp ? `H${svc}` : `-H${tot}*${up}`));
  }
  if (tp) {
    sstV = svcV * tp;
    lastFee = put(28, ++n, r => setCell(setCell(r, 'E', 'str', `SST (${pctLabel(tp)})`), 'H', 'f', sstV, `H${svc}*${pctLabel(tp)}`));
  }
  const entV = R + svcV + utilV + sstV;
  const ent = put(29, ++n, r => setCell(r, 'H', 'f', entV, `SUM(H${tot}:H${lastFee})`));
  const exps = s.expenses || [];
  const expV = exps.reduce((t, e) => t + (Number(e.amount) || 0), 0);
  const texp = put(30, ++n, r => exps.length ? setCell(r, 'H', 'f', expV, `SUM(H${n + 1}:H${n + exps.length})`) : setCell(r, 'H', 'num', 0));
  for (const e of exps) {
    out.push(setCell(setCell(EXPENSE_ROW(++n), 'E', 'str', e.description || ''), 'H', 'num', Number(e.amount) || 0));
  }
  const nettV = entV + expV;
  const nett = put(31, ++n, r => setCell(r, 'H', 'f', nettV, `SUM(H${ent}:H${texp})`));
  const adj = Math.round((s.payout - nettV) * 100) / 100;
  if (adj !== 0) {
    const a = put(32, ++n, r => setCell(r, 'H', 'num', adj));
    put(33, ++n, r => setCell(r, 'H', 'f', nettV + adj, `SUM(H${nett}:H${a})`));
  }
  put(34, ++n);

  // Remarks: next booking
  put(35, ++n);
  put(36, ++n, r => {
    const b = s.nextBooking;
    r = b?.arrival ? setCell(r, 'D', 'num', serial(b.arrival)) : setCell(r, 'D', 'blank');
    return b?.departure ? setCell(r, 'E', 'num', serial(b.departure)) : setCell(r, 'E', 'blank');
  });
  n++;   // empty row, as in the template
  put(38, ++n); put(39, ++n); put(40, ++n); put(41, ++n);

  // Monthly payout summary for the statement's year
  put(42, ++n);
  for (const half of [0, 6]) {
    put(43, ++n, r => ['B', 'C', 'D', 'E', 'F', 'G'].reduce((x, c, i) => setCell(x, c, 'num', serial(`${y}-${String(half + i + 1).padStart(2, '0')}-01`)), r));
    put(44, ++n, r => ['B', 'C', 'D', 'E', 'F', 'G'].reduce((x, c, i) => {
      const v = s.payouts?.[`${y}-${String(half + i + 1).padStart(2, '0')}`];
      return v == null ? setCell(x, c, 'blank') : setCell(x, c, 'num', v);
    }, r));
  }
  n++;   // empty row
  const end = put(48, ++n);

  return head.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A5:Q${end}"/>`) + out.join('') + tail;
}

// The finished workbook (bytes). X is the SheetJS library (its zip reader/writer); template is the template's bytes.
export function buildStatementXlsx(X, template, s) {
  const zip = X.CFB.read(template, { type: 'array' });
  const text = path => new TextDecoder().decode(X.CFB.find(zip, '/' + path).content);
  const putText = (path, str) => { X.CFB.find(zip, '/' + path).content = new TextEncoder().encode(str); };
  putText(SHEET, statementSheetXml(text(SHEET), s));
  // Sheet named after the unit, as Finance names it ("D 0719")
  const name = esc(s.sheetName || s.unitCode).slice(0, 31);
  putText('xl/workbook.xml', text('xl/workbook.xml').replace(/<sheet name="[^"]*"/, `<sheet name="${name}"`));
  putText('docProps/app.xml', text('docProps/app.xml').replace(/<vt:lpstr>D 0719<\/vt:lpstr>/, `<vt:lpstr>${name}</vt:lpstr>`));
  putText('docProps/core.xml', text('docProps/core.xml').replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy>Widebed PMS</cp:lastModifiedBy>'));
  return X.CFB.write(zip, { fileType: 'zip', type: 'array' });
}

// ---- Fixed rent: Finance's "FIXED RENT" sheet (FIXED RENTAL INCOME SUMMARY), one row per fixed-rent unit of the property ----
// f: { propertyName, month 'YYYY-MM', units [{ unitCode, rent, deductions [n], reimburse [n], remark }] }
export function fixedRentSheetXml(templateXml, f) {
  const head = templateXml.slice(0, templateXml.indexOf('<sheetData>') + '<sheetData>'.length);
  const tail = templateXml.slice(templateXml.indexOf('</sheetData>'));
  const T = parseRows(templateXml.slice(head.length, templateXml.length - tail.length));
  const out = [];
  const put = (proto, n, fill) => { let row = renum(T[proto], n); if (fill) row = fill(row); out.push(row); return n; };
  const [y, mo] = f.month.split('-').map(Number);
  // A few amounts are written as Finance types them: one as a number, several as a sum ("=518.32+30")
  const amounts = (r, col, list) => {
    const xs = list.filter(v => v);
    if (!xs.length) return setCell(r, col, 'blank');
    const v = xs.reduce((t, x) => t + x, 0);
    return xs.length === 1 ? setCell(r, col, 'num', v) : setCell(r, col, 'f', v, xs.map(x => +x.toFixed(2)).join('+'));
  };

  put(7, 7);
  put(9, 9, r => setCell(r, 'B', 'str', `:  ${f.propertyName}`));
  put(10, 10);
  put(11, 11, r => setCell(r, 'B', 'str', `: ${MONTHS[mo - 1]}-${String(y).slice(2)}`));
  put(12, 12); put(13, 13); put(14, 14); put(15, 15);

  const first = 16;
  const units = f.units.length ? f.units : [null];
  const pay = [];
  units.forEach((u, i) => put(17, first + i, r => {
    if (!u) return ['A', 'B', 'C', 'D', 'E', 'F'].reduce((x, c) => setCell(x, c, 'blank'), r);
    const n = first + i, rent = Number(u.rent) || 0;
    const ded = (u.deductions || []).reduce((t, x) => t + x, 0), reim = (u.reimburse || []).reduce((t, x) => t + x, 0);
    pay.push({ n, v: rent - ded + reim });
    r = setCell(r, 'A', 'str', u.unitCode);
    r = setCell(r, 'B', 'num', rent);
    r = amounts(r, 'C', u.deductions || []);
    r = amounts(r, 'D', u.reimburse || []);
    r = setCell(r, 'E', 'f', rent - ded + reim, `B${n}-C${n}+D${n}`);
    return u.remark ? setCell(r, 'F', 'str', u.remark) : setCell(r, 'F', 'blank');
  }));
  const last = first + units.length - 1;
  const sum = col => f.units.reduce((t, u) => t + (col === 'B' ? Number(u.rent) || 0 : (u.deductions || []).reduce((a, x) => a + x, 0)), 0);
  // Payment total leaves out negative rows (carried forward, not paid), as Finance's =SUM(E16:E27,E29)
  const paid = pay.filter(p => p.v >= 0);
  const ranges = [];
  for (const p of paid) { const r = ranges[ranges.length - 1]; if (r && r[1] === p.n - 1) r[1] = p.n; else ranges.push([p.n, p.n]); }
  const eF = ranges.length ? `SUM(${ranges.map(([a, b]) => (a === b ? `E${a}` : `E${a}:E${b}`)).join(',')})` : '0';
  let n = last + 1;
  put(30, n, r => {
    r = setCell(r, 'B', 'f', sum('B'), `SUM(B${first}:B${last})`);
    r = setCell(r, 'C', 'f', sum('C'), `SUM(C${first}:C${last})`);
    return setCell(r, 'E', 'f', paid.reduce((t, p) => t + p.v, 0), eF);
  });
  // The empty, styled rows under the table, as in the template
  let end = n;
  for (const k of [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 46]) end = put(k, n + (k - 30));
  return head.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A7:J${end}"/>`) + out.join('') + tail;
}

export function buildFixedRentXlsx(X, template, f) {
  const zip = X.CFB.read(template, { type: 'array' });
  const text = path => new TextDecoder().decode(X.CFB.find(zip, '/' + path).content);
  const putText = (path, str) => { X.CFB.find(zip, '/' + path).content = new TextEncoder().encode(str); };
  putText(SHEET, fixedRentSheetXml(text(SHEET), f));
  putText('docProps/core.xml', text('docProps/core.xml').replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy>Widebed PMS</cp:lastModifiedBy>'));
  return X.CFB.write(zip, { fileType: 'zip', type: 'array' });
}

export async function loadStatementTemplate(url = TEMPLATE_URL) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('The statement template could not be loaded. Refresh the page and try again.');
  const bytes = new Uint8Array(await res.arrayBuffer());
  // Not a zip (e.g. the file is missing and the page came back instead)
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('The statement template is missing. Restart the app and try again.');
  return bytes;
}
