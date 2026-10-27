// Statement PDFs, drawn to match Finance's own PDFs (Excel's "Save as PDF" of their sheets, Khairul 27 Oct):
// "DM Sep26 Rental Income Statement" (one unit, e.g. D 0719) and the FIXED RENTAL INCOME SUMMARY (one property).
// Every position, line and shade below is measured from those PDFs (US Letter, points, from the top of the page).
// Finance's font is Aptos Narrow (Microsoft, cannot be shipped); Roboto Condensed (public/fonts) is the closest free one.
// The numbers are the same ones the xlsx download writes (lib/statement-xlsx.js).

const FONT_URLS = { regular: '/fonts/RobotoCondensed-Regular.ttf', bold: '/fonts/RobotoCondensed-Bold.ttf' };
const W = 612, H = 792;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LETTERHEAD = ['(Wholly-Owned Subsidiary of Widebed Sdn. Bhd.)', null, '368-A, Jalan Tun Razak', '50400 Kuala Lumpur',
  'Tel : 03-2181 3455', 'Email : account@widebed.com'];
const COMPANY = '1 World Short Stay Sdn. Bhd. (955057-H)';

// 1234.5 -> "1,234.50"
const money = v => { const n = Math.round((Number(v) || 0) * 100) / 100; return (n === 0 ? 0 : n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const dmy = iso => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const pctLabel = p => `${+(p * 100).toFixed(2)}%`;

// A page to draw on, in Finance's measurements (x from the left, y from the top; text by its baseline).
function sheet(lib, doc, fonts) {
  let page;
  const d = {
    add() { page = doc.addPage([W, H]); return d; },
    width: (str, size, bold) => (bold ? fonts.bold : fonts.regular).widthOfTextAtSize(String(str), size),
    // align: left (x = start), center (x = middle), right (x = end)
    text(str, x, y, { size = 10.08, bold = false, align = 'left' } = {}) {
      str = String(str ?? '');
      if (!str) return;
      const w = d.width(str, size, bold);
      const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      page.drawText(str, { x: x0, y: H - y, size, font: bold ? fonts.bold : fonts.regular, color: lib.rgb(0, 0, 0) });
      return { x0, x1: x0 + w };
    },
    // A filled box from (x0, top) to (x1, bottom); lines are thin boxes too, as in Finance's PDFs
    box(x0, top, x1, bottom, color = [0, 0, 0]) {
      page.drawRectangle({ x: x0, y: H - bottom, width: x1 - x0, height: bottom - top, color: lib.rgb(...color) });
    }
  };
  return d;
}

// Words of str in lines no wider than width
function wrap(d, str, width, size) {
  const lines = [];
  for (const word of String(str || '').split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1];
    if (last != null && d.width(`${last} ${word}`, size) <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

async function newDoc(lib, fontkit, fontBytes, title) {
  const doc = await lib.PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts = { regular: await doc.embedFont(fontBytes.regular, { subset: true }), bold: await doc.embedFont(fontBytes.bold, { subset: true }) };
  doc.setTitle(title); doc.setAuthor('Widebed PMS'); doc.setCreator('Widebed PMS'); doc.setProducer('Widebed PMS');
  return { doc, d: sheet(lib, doc, fonts).add() };
}

// ---------------------------------------------------------------- Monthly statement (one unit)
// Columns A to H of Finance's unit sheet
const C = { A: [50.9, 115.3], B: [115.3, 175.4], C: [175.4, 235.6], D: [235.6, 295.7], E: [295.7, 356.0], F: [356.0, 416.0], G: [416.0, 476.1], H: [476.1, 541.8] };
const mid = c => (C[c][0] + C[c][1]) / 2;
const ROW = 14.64;

function unitLetterhead(d) {
  d.text(COMPANY, 306, 37.08, { size: 15.36, bold: true, align: 'center' });
  const lines = LETTERHEAD.map(l => l ?? 'Unit 01-01, First Floor, Micasa Shoppes,');
  lines.forEach((l, i) => d.text(l, 306, 53.04 + i * 14.64, { size: 10.56, align: 'center' }));
}

// s: as buildStatementXlsx (lib/statement-xlsx.js): { unitCode, month, lines, rates, expenses, payout, nextBooking, payouts }
export async function buildStatementPdf(lib, fontkit, fontBytes, s) {
  const [y, mo] = s.month.split('-').map(Number);
  const { doc, d } = await newDoc(lib, fontkit, fontBytes, `${s.unitCode} ${MONTHS[mo - 1]} ${y} Monthly Statement`);
  unitLetterhead(d);
  // Bookings that run past the page continue on the next one, under the letterhead (Excel repeats its page header)
  let top = 0;
  const next = () => { if (top > 760) { d.add(); unitLetterhead(d); top = 150; } return top; };

  const t = d.text('MONTHLY STATEMENT', 296.35, 158.66, { size: 15.36, bold: true, align: 'center' });
  d.box(t.x0, 159.4, t.x1, 159.7);
  d.text('Property', 52.68, 189.26); d.text(s.unitCode, 117.14, 189.02);
  d.text('Month', 52.68, 203.9); d.text(`${MONTHS[mo - 1]} ${y}`, 117.14, 203.9);

  // Bookings
  [['Source', 'A'], ['Reference', 'B'], ['Check In', 'C'], ['Check Out', 'D'], ['Nights', 'E'], ['Currency', 'F'], ['Amount', 'G'], ['Total', 'H']]
    .forEach(([label, c]) => d.text(label, mid(c), 233.18, { bold: true, align: 'center' }));
  d.box(50.9, 236.4, 541.8, 237.4);
  top = 247.85;
  const lines = s.lines.length ? s.lines : [null];
  lines.forEach((l, i) => {
    if (i) { top += ROW; next(); }
    if (!l) return;
    d.text(l.source, 52.8, top, { size: 10.56 });
    d.text(l.reference, 117.1, top, { size: 10.56 });
    d.text(dmy(l.arrival), mid('C'), top, { size: 10.56, align: 'center' });
    d.text(dmy(l.departure), mid('D'), top, { size: 10.56, align: 'center' });
    d.text(Number(l.nights) || 0, mid('E'), top, { size: 10.56, align: 'center' });
    d.text('MYR', mid('F'), top, { align: 'center' });
    d.text(money(l.amount), 471.11, top, { align: 'right' });
  });

  // Totals, as Finance's sheet works them out
  const R = s.lines.reduce((a, l) => a + (Number(l.amount) || 0), 0);
  const nights = s.lines.reduce((a, l) => a + (Number(l.nights) || 0), 0);
  const line = (x0, x1, y0, h = 1) => d.box(x0, y0, x1, y0 + h);
  top += ROW; next();
  line(...C.E, top - 11.45); d.text(nights, mid('E'), top, { align: 'center' });
  const row = (label, value, { bold = false, above = false, plain = false } = {}) => {
    top += ROW; next();
    if (above) line(...C.H, top - 11.4);
    d.text(label, 297.53, top, { bold });
    d.text(money(value), 539.77, top, { align: 'right', bold: bold && !plain });
  };
  row('Total Receivable', R, { bold: true, plain: true });   // Finance: label bold, amount not
  line(...C.E, top - 11.4); line(...C.H, top - 11.4);
  const { serviceFeePct: sp = 0, utilityFeePct: up = 0, sstOnFeePct: tp = 0 } = s.rates || {};
  const svc = -R * sp, util = up ? -R * up : 0, sst = tp ? svc * tp : 0;
  row(`Service Fees (${pctLabel(sp)})`, svc);
  if (up) row(`Utilities (${pctLabel(up)})`, util);
  if (tp) row(`SST (${pctLabel(tp)})`, sst);
  const ent = R + svc + util + sst;
  row("Owner's Entitlement", ent, { bold: true, above: true });
  const exps = s.expenses || [];
  const expTotal = exps.reduce((a, e) => a + (Number(e.amount) || 0), 0);
  row('Total Expenses', expTotal, { bold: true });
  for (const e of exps) row(e.description || '', Number(e.amount) || 0);
  // Nett Receivable, and Finance's rounding to RM 0.05 when there is one: shaded, ruled boxes in column H
  const nett = ent + expTotal;
  const adj = Math.round((s.payout - nett) * 100) / 100;
  const shaded = adj !== 0 ? [['Nett Receivable', nett], ['Nett Receivable (Rounding Adjust)', adj], ['Nett Receivable (Rounding)', nett + adj]] : [['Nett Receivable', nett]];
  for (const [label, value] of shaded) {
    top += ROW; next();
    d.box(C.H[0], top - 10.9, C.H[1], top + 3.7, [0.949, 0.949, 0.949]);
    line(...C.H, top - 11.4);
    d.text(label, 297.53, top, { bold: true });
    d.text(money(value), 539.77, top, { align: 'right', bold: true });
  }
  line(...C.H, top + 3.2);

  // Remarks: the next booking
  const base = top;
  if (base + 190.35 > 780) { d.add(); unitLetterhead(d); top = 150 - 28.44; } else top = base;
  const at = k => top + k;
  let u = d.text('Remarks:', 52.68, at(28.44), { bold: true });
  d.box(u.x0, at(28.94), u.x1, at(29.14));
  d.text('Check In', mid('D'), at(28.44), { bold: true, align: 'center' });
  d.text('Check Out', mid('E'), at(28.44), { bold: true, align: 'center' });
  d.box(C.D[0], at(32.14), C.E[1], at(33.94));
  d.text('Next booking :', 52.68, at(43.95));
  d.text(dmy(s.nextBooking?.arrival), mid('D'), at(43.71), { align: 'center' });
  d.text(dmy(s.nextBooking?.departure), mid('E'), at(43.71), { align: 'center' });
  u = d.text('Additional note:', 52.68, at(73.23));
  d.box(u.x0, at(73.73), u.x1, at(73.93));
  d.text('Payment will be released based on date of departure', 52.68, at(87.87));
  d.text('(e.g : Check-in 01-02-19 : check-out 01-03-19, invoice will appear in the next rental statement (Mac 2019)', 52.68, at(102.51));

  // Monthly payout summary for the year
  const cols = ['B', 'C', 'D', 'E', 'F', 'G'];
  d.box(115.3, at(120.83), 476.2, at(135.63), [0.851, 0.851, 0.851]);
  d.text('Monthly Payout Summary', 117.14, at(131.79), { bold: true });
  for (const k of [135.03, 149.67, 164.37, 178.97, 193.67]) d.box(115.8, at(k), 476.6, at(k + 1));
  [114.9, 175.0, 235.1, 295.2, 355.4, 415.5, 475.7].forEach((x, i) => d.box(x, at(i ? 136.03 : 135.03), x + 0.95, at(194.53)));
  for (const half of [0, 6]) {
    const ty = at(half ? 175.71 : 146.43);
    cols.forEach((c, i) => {
      const m = half + i + 1;
      d.text(`${MONTHS[m - 1]}/${String(y).slice(2)}`, mid(c), ty, { bold: true, align: 'center' });
      const v = s.payouts?.[`${y}-${String(m).padStart(2, '0')}`];
      if (v != null) d.text(money(v), mid(c), ty + 14.64, { align: 'center' });
    });
  }
  return doc.save();
}

// ---------------------------------------------------------------- Fixed rental income summary (one property)
const F = [50.95, 118.65, 182.6, 240.35, 298.05, 361.55, 485.45, 556.1];   // column lines A|B|C|D|E|F|G|
const FS = 9.12, FROW = 12.6;
const BLUE = [0.792, 0.929, 0.984], GREY = [0.851, 0.851, 0.851];

function fixedLetterhead(d) {
  d.text(COMPANY, 306, 34.92, { size: 13.32, bold: true, align: 'center' });
  LETTERHEAD.map(l => l ?? 'Unit 01-03, First Floor, Micasa Shoppes,')
    .forEach((l, i) => d.text(l, 306, 48.72 + i * 12.6, { size: FS, align: 'center' }));
}

// f: as buildFixedRentXlsx: { propertyName, month, units [{ unitCode, rent, deductions [n], reimburse [n], remark }] }
export async function buildFixedRentPdf(lib, fontkit, fontBytes, f) {
  const [y, mo] = f.month.split('-').map(Number);
  const { doc, d } = await newDoc(lib, fontkit, fontBytes, `${f.propertyName} ${MONTHS[mo - 1]} ${y} Fixed Rental Income Summary`);
  fixedLetterhead(d);
  const t = d.text('FIXED RENTAL INCOME SUMMARY', 303.55, 143.66, { size: 13.32, bold: true, align: 'center' });
  d.box(t.x0, 144.3, t.x1, 144.6);
  [['Property', `${f.propertyName}`, 126.0], ['Rental Type', 'Fixed Rent', 126.0], ['Month', `${MONTHS[mo - 1]}-${String(y).slice(2)}`, 124.34]]
    .forEach(([label, value, x], i) => {
      const by = 170.78 + i * 12.6;
      d.text(label, 52.56, by, { size: FS, bold: true });
      d.text(':', 120.26, by, { size: FS, bold: true });
      d.text(value, x, by, { size: FS });
    });
  d.box(50.9, 211.5, 556.2, 213.0);

  // Rows: each unit is one line high, more when its remark wraps
  const units = f.units.length ? f.units : [null];
  const remarkW = F[6] - F[5] - 4;
  const rows = units.map(u => ({ u, remark: u?.remark ? wrap(d, u.remark, remarkW, FS) : [] }));
  const tableTop = 237.0, headBottom = 262.4;
  let pageTop = tableTop;
  const right = (c, v, by, bold) => d.text(money(v), F[c + 1] - 4.15, by, { size: FS, align: 'right', bold });
  const sum = xs => (xs || []).reduce((a, x) => a + (Number(x) || 0), 0);

  // Shading and rules are drawn per page: E (Payment to Owner) in blue, the Total row in grey
  const header = () => {
    const by = tableTop;
    d.box(F[4], by + 0.4, F[5], headBottom, BLUE);
    const c = i => (F[i] + F[i + 1]) / 2;
    d.text('Unit No.', c(0), 253.37, { size: FS, bold: true, align: 'center' });
    d.text('Fixed Rent (RM)', c(1), 253.49, { size: FS, bold: true, align: 'center' });
    [['Deduction', 2], ['Reimburse', 3], ['Payment to', 4]].forEach(([l, i]) => d.text(l, c(i), 247.13, { size: FS, bold: true, align: 'center' }));
    [['(RM)', 2], ['(RM)', 3], ['Owner (RM)', 4]].forEach(([l, i]) => d.text(l, c(i), 259.73, { size: FS, bold: true, align: 'center' }));
    d.text('Remark', (F[5] + F[7]) / 2, 252.89, { size: FS, bold: true, align: 'center' });
  };
  const rule = top => d.box(51.4, top, 556.5, top + 0.85);
  const verticals = (from, to) => F.forEach((x, i) => { if (i !== 6) d.box(x - 0.43, from, x + 0.43, to); });
  header(); rule(tableTop);
  let top = headBottom, gStart = headBottom;
  const paid = [];
  rows.forEach(({ u, remark }) => {
    const h = FROW * Math.max(1, remark.length);
    if (top + h > 760) {   // next page: the table carries on with its header
      verticals(pageTop, top + 0.85); d.box(F[6] - 0.43, gStart, F[6] + 0.43, top + 0.85);
      d.add(); fixedLetterhead(d); header(); rule(tableTop); pageTop = tableTop; top = headBottom; gStart = headBottom;
    }
    d.box(F[4], top, F[5], top + h, BLUE);
    rule(top);
    const by = top + h / 2 + 3.55;
    if (u) {
      const ded = sum(u.deductions), reim = sum(u.reimburse), rent = Number(u.rent) || 0, pay = rent - ded + reim;
      if (pay >= 0) paid.push(pay);
      d.text(u.unitCode, (F[0] + F[1]) / 2, by, { size: FS, align: 'center' });
      right(1, rent, by);
      if (ded) right(2, ded, by);
      if (reim) right(3, reim, by);
      if (pay < 0) d.text('-', F[4] + 2.25, by, { size: FS });
      right(4, Math.abs(pay), by);
      remark.forEach((l, i) => d.text(l, (F[5] + F[6]) / 2, by - (remark.length - 1) * FROW / 2 + i * FROW, { size: FS, align: 'center' }));
    }
    top += h;
  });
  // Total: payment leaves out negative rows (carried forward, not paid), as Finance's sum does
  d.box(F[0], top, F[4], top + FROW, GREY); d.box(F[4], top, F[5], top + FROW, BLUE); d.box(F[5], top, F[7], top + FROW, GREY);
  rule(top);
  const by = top + FROW / 2 + 3.55;
  d.text('Total', (F[0] + F[1]) / 2, by, { size: FS, bold: true, align: 'center' });
  right(1, sum(f.units.map(u => u.rent)), by, true);
  right(2, sum(f.units.flatMap(u => u.deductions || [])), by, true);
  right(4, sum(paid), by, true);
  top += FROW;
  rule(top);
  verticals(pageTop, top + 0.85);
  d.box(F[6] - 0.43, gStart, F[6] + 0.43, top + 0.85);
  return doc.save();
}

// pdf-lib, its font reader and the two fonts, fetched when first needed
let kit;
export function loadPdfKit() {
  kit ||= Promise.all([import('pdf-lib'), import('@pdf-lib/fontkit'),
    ...Object.values(FONT_URLS).map(async url => {
      const res = await fetch(url);
      const bytes = new Uint8Array(await res.arrayBuffer());
      // A missing file comes back as the app's page, not a font
      if (!res.ok || bytes[0] === 0x3c) throw new Error('The statement font is missing. Restart the app and try again.');
      return bytes;
    })]).then(([lib, fk, regular, bold]) => ({ lib, fontkit: fk.default || fk, fonts: { regular, bold } }))
    .catch(e => { kit = null; throw e; });
  return kit;
}
