// Reports for any date range (Reports tab). Pure: no Firebase inside, so it can be tested on its own.
// Statements are monthly, so a range is cut into month pieces (a part-month at either end):
//   bookings count by check-out date inside the piece (revenue on departure date, like statements)
//   fees use the unit's settings for that month, worked out on those bookings
//   expenses and reimbursements count by their own date
//   fixed rent is shared by days (15-28 Feb = 14 of 28 days of February's rent)
//   nothing is rounded to RM 0.05, so a full month can differ from the completed payout by a few sen
import { effectiveRates, bookingPTO, byUnit } from './engine.js';

// Same rule as finance-data.js latestVersion (copied so this file stays free of Firebase).
const ms = t => (t?.toMillis ? t.toMillis() : 0);
const latestVersion = (versions, month) => (versions || []).filter(v => (v.effectiveFrom || '') <= month)
  .sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || '') || ms(b.createdAt) - ms(a.createdAt))[0] || null;

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = n => String(n).padStart(2, '0');
const daysIn = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const n = v => Number(v) || 0;

// "2026-02-15".."2026-03-15" -> [{ month: '2026-02', from: '2026-02-15', to: '2026-02-28', days: 14, monthDays: 28, label: '15-28 Feb 2026' }, ...]
export function monthPieces(from, to) {
  if (!from || !to || from > to) return [];
  const out = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  while (`${y}-${pad(m)}` <= to.slice(0, 7)) {
    const ym = `${y}-${pad(m)}`, md = daysIn(ym);
    const a = ym === from.slice(0, 7) ? from : `${ym}-01`;
    const b = ym === to.slice(0, 7) ? to : `${ym}-${pad(md)}`;
    const d1 = +a.slice(8), d2 = +b.slice(8), full = d1 === 1 && d2 === md;
    out.push({ month: ym, from: a, to: b, days: d2 - d1 + 1, monthDays: md, full,
      label: full ? `${SHORT[m - 1]} ${y}` : d1 === d2 ? `${d1} ${SHORT[m - 1]} ${y}` : `${d1}-${d2} ${SHORT[m - 1]} ${y}` });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

// One unit, one piece of a month.
function pieceFigures({ unit, piece, rateVersions, bookings, expenses, rangeMonths }) {
  const terms = latestVersion(unit.termHistory || [], piece.month);
  const rates = effectiveRates(latestVersion(rateVersions, piece.month), terms);
  const bk = bookings.filter(b => b.unitId === unit.id && b.status !== 'cancelled' && b.departure >= piece.from && b.departure <= piece.to);
  // A brought-forward line repeats a negative balance from a month that is already inside the range, so it is left out then
  const ex = expenses.filter(e => e.unitId === unit.id && !e.deleted && e.date >= piece.from && e.date <= piece.to
    && !(e.kind === 'broughtForward' && rangeMonths.has(e.sourceMonth)));
  const expensesNet = ex.reduce((s, e) => s + (e.kind === 'reimburse' ? -Math.abs(n(e.amount)) : Math.abs(n(e.amount))), 0);
  const fixed = rates.arrangement === 'fixedRent';
  let gross, service = 0, utility = 0, sst = 0;
  if (fixed) gross = n(rates.fixedRentAmount) * piece.days / piece.monthDays;
  else {
    gross = bk.reduce((s, b) => s + bookingPTO(b, rates).pto, 0);
    service = gross * n(rates.serviceFeePct);
    utility = gross * n(rates.utilityFeePct);
    sst = service * n(rates.sstOnFeePct);
  }
  return { gross, service, utility, expenses: expensesNet, sst, sstPct: fixed ? 0 : n(rates.sstOnFeePct),
    nett: gross - service - utility - sst - expensesNet, bookings: bk.length, lines: ex.length,
    arrangement: rates.arrangement, fixed, estimated: !fixed && bk.some(b => bookingPTO(b, rates).estimated) };
}

const ZERO = () => ({ gross: 0, service: 0, utility: 0, expenses: 0, sst: 0, nett: 0, bookings: 0, lines: 0, sstRates: new Set(), estimated: false });
function add(t, f) {
  for (const k of ['gross', 'service', 'utility', 'expenses', 'sst', 'nett', 'bookings', 'lines']) t[k] += f[k];
  if (f.sstPct != null && (f.sstPct || f.sst)) t.sstRates.add(f.sstPct);
  t.estimated = t.estimated || f.estimated;
  return t;
}
const sumRows = rows => done(rows.reduce((t, r) => { add(t, { ...r, sstPct: null }); r.sstRates.forEach(x => t.sstRates.add(x)); return t; }, ZERO()));
const done = t => ({ ...t, sstRates: [...t.sstRates].sort() });
const has = f => f.bookings || f.lines || f.gross;

// Property report: one row per unit (all months combined), then the grand total.
export function propertyReport({ units, rateVersions, bookings, expenses, from, to }) {
  const pieces = monthPieces(from, to), rangeMonths = new Set(pieces.map(p => p.month));
  const rows = [];
  for (const unit of [...units].sort((a, b) => byUnit(a.unitCode, b.unitCode))) {
    const t = ZERO(); let any = false, arr = new Set();
    for (const piece of pieces) {
      const f = pieceFigures({ unit, piece, rateVersions, bookings, expenses, rangeMonths });
      if (has(f)) { any = true; add(t, f); if (f.arrangement) arr.add(f.arrangement); }
    }
    if (any) rows.push({ unitId: unit.id, unitCode: unit.unitCode, arrangements: [...arr], ...done(t) });
  }
  const total = sumRows(rows);
  return { pieces, rows, total };
}

// Unit report: one row per month or part-month inside the range, then the unit's total.
export function unitReport({ unit, rateVersions, bookings, expenses, from, to }) {
  const pieces = monthPieces(from, to), rangeMonths = new Set(pieces.map(p => p.month));
  const rows = pieces.map(piece => {
    const f = pieceFigures({ unit, piece, rateVersions, bookings, expenses, rangeMonths });
    return { label: piece.label, month: piece.month, full: piece.full, ...done(add(ZERO(), f)), arrangement: f.arrangement };
  });
  const total = sumRows(rows);
  return { pieces, rows, total };
}

// Months whose bookings and expenses must be read to cover the range (one either side for expenses dated outside their statement month).
export function monthsToLoad(from, to) {
  const ps = monthPieces(from, to);
  if (!ps.length) return [];
  const shift = (ym, d) => { const [y, m] = ym.split('-').map(Number); const x = new Date(y, m - 1 + d, 1); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`; };
  return [shift(ps[0].month, -1), ...ps.map(p => p.month), shift(ps[ps.length - 1].month, 1)];
}
