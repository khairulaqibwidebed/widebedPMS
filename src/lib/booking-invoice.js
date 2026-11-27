// Booking invoice (Portfolio > Bookings), 16 Nov 2026 (Khairul).
// A booking saved as Awaiting payment (offlineBookings status 'pending') gets an invoice to send to the prospect.
// Layout follows the eZee folio invoice, but only with what the booking has: tenant particulars, property particulars,
// rent & terms (no rental status), then the T&Cs and the bank details. A field left empty is not printed.
// Nothing is saved: each download makes a fresh PDF. The header, T&Cs and bank details come from config/invoiceDefaults
// (Portfolio > Bookings > Booking settings > Invoice & T&Cs, 23 Nov 2026); the T&Cs can be changed per booking and are kept on it.
import { rentTermLabel } from './rent-term.js';
import { doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase.js';
import { useSession } from '@/stores/session.js';
import { audit } from './finance-data.js';
import { loadPdfKit } from './statement-pdf.js';
import { feeColOf, feeModeOf } from './booking-settings.js';

export const INVOICE_DEFAULTS = {
  header: [
    'PJ Centrestage By Widebed',
    '3A, Jalan 13/2, Seksyen 13, 46200 Petaling Jaya, Selangor, Malaysia',
    'Phone: +60125253141 · Email: booking@widebed.com',   // 20 Nov 2026: new number, and shortstay.com.my added
    'URL: https://klshortstay.com.my · https://shortstay.com.my'
  ].join('\n'),
  terms: [
    'TERMS & CONDITIONS – MONTHLY & DAILY RENTAL',
    'A. INTERPRETATION',
    '1. Guests must provide full names/IDs of all occupants.',
    '2. Smoking, pets, parties, and illegal activities are prohibited. Quiet hours (10 pm-8 am)',
    '3. WIDEBED may enter rooms for inspection/repairs.',
    '4. Subletting or renting to others is not allowed.',
    'B. BOOKINGS & EXTENSIONS',
    '1. No refunds for early termination.',
    '2. Extensions subject to availability and current rates.',
    'C. RENTAL & PAYMENT',
    '1. Rental fees must be paid in advance via bank transfer, cash deposit, or CC (charges apply).',
    '2. A refundable security deposit is required before arrival and may be forfeited if notice is not respected. Monthly stays exclude utilities and amenities.',
    'D. REGISTRATION, INVENTORY',
    '1. Guests must sign the registration/booking confirmation upon arrival.',
    '2. Maximum occupancy as stated in the booking. Only registered guests may stay overnight.',
    'E. CAR PARK',
    '1. Free parking, subject to availability.',
    'F. CHECK-IN / CHECK-OUT',
    '1. Provide arrival details in advance.',
    '2. After-hours arrivals (9 am–6 pm) arranged via self-check-in.',
    '3. Property/utility check done before deposit refund (monthly stay).',
    'G. ROOM CARE & DAMAGES',
    '1. Report faults/damages within 24 hours of check-in.',
    '2. Linens/towels are for in room use only; cooking appliances are allowed for basic cooking.',
    '3. Guests must maintain the room, are liable for damages, and management is not responsible for lost belongings; no hooks/nails without consent.',
    'H. HOUSE RULES',
    '1. Follow building rules: proper trash disposal, no belongings in corridors.',
    '2. Breaches incur a minimum RM200 penalty from the building management.',
    '3. Non-compliance may cancel the contract. Eviction possible for non-payment or damages.'
  ].join('\n'),
  bank: [
    'Account Name: 1 World Short Stay Sdn Bhd',
    'Bank: Malayan Banking Berhad',
    'Account No: 514422433606',
    'Swift Code: MBBEMYKLXXX',
    'Address: Menara Perkeso, Ground Floor, 281 Jalan Ampang, 50538 Kuala Lumpur'
  ].join('\n')
};

let cache = null;
export async function loadInvoiceDefaults(fresh = false) {
  if (cache && !fresh) return cache;
  let d = {};
  try { const s = await getDoc(doc(db, 'config', 'invoiceDefaults')); d = s.exists() ? s.data() : {}; } catch { d = {}; }
  const pick = k => (typeof d[k] === 'string' && d[k].trim() ? d[k] : INVOICE_DEFAULTS[k]);
  cache = { header: pick('header'), terms: pick('terms'), bank: pick('bank'), saved: !!(d.header || d.terms || d.bank),
    updatedByName: d.updatedByName || '', updatedAt: d.updatedAt || null };
  return cache;
}
// 23 Nov 2026: Booking settings > Invoice & T&Cs (the 'bookingSettings.edit' tick; Firestore rules 1.01).
// before = what was loaded, so the audit line lists the boxes that changed (the T&Cs only as "T&Cs changed").
export async function saveInvoiceDefaults({ header, terms, bank }, before = null) {
  const me = useSession();
  const clean = { header: String(header || '').trim(), terms: String(terms || '').trim(), bank: String(bank || '').trim() };
  const old = k => String(before?.[k] || '').trim();
  const changes = [];
  if (!before || clean.header !== old('header')) changes.push({ field: 'header', old: '', new: 'Header changed' });
  if (!before || clean.terms !== old('terms')) changes.push({ field: 'terms', old: '', new: 'T&Cs changed' });
  if (!before || clean.bank !== old('bank')) changes.push({ field: 'bank', old: '', new: 'Bank details changed' });
  const batch = writeBatch(db);
  batch.set(doc(db, 'config', 'invoiceDefaults'), { ...clean, updatedBy: me.user.uid, updatedByName: me.name, updatedAt: serverTimestamp() });
  audit(batch, me, { action: 'invoiceDefaults.update', entity: 'config/invoiceDefaults', reason: 'Booking invoice defaults changed', changes });
  await batch.commit();
  cache = null;
}

// 23 Nov 2026 (Khairul): the T&Cs a booking was invoiced with, kept on the booking (offlineBookings/{id}.invoiceTerms), so a
// later change to the default never changes it. Written when an invoice is downloaded (only when new or changed) and by
// "Reset to default". Firestore rules 1.01: invoiceTerms only, by whoever can read and invoice the booking.
export const TERMS_MAX = 20000;
export async function loadBookingTerms(bookingId) {
  if (!bookingId) return null;
  const s = await getDoc(doc(db, 'offlineBookings', bookingId));
  const t = s.exists() ? s.data().invoiceTerms : null;
  return t && typeof t.text === 'string' ? t : null;
}
export async function saveBookingTerms(bookingId, bookingNo, text, fromDefault, reset = false) {
  const me = useSession();
  const batch = writeBatch(db);
  batch.update(doc(db, 'offlineBookings', bookingId), {
    invoiceTerms: { text, savedAt: serverTimestamp(), savedByUid: me.user.uid, savedByName: me.name || '', fromDefault: !!fromDefault }
  });
  audit(batch, me, { action: 'booking.invoiceTerms', entity: `offlineBookings/${bookingId}`,
    reason: `${bookingNo || bookingId}: ${reset ? 'T&Cs reset to default' : 'T&Cs saved'}`,
    changes: [{ field: 'invoiceTerms', old: '', new: reset ? 'reset to default' : fromDefault ? 'T&Cs saved (the default)' : 'T&Cs saved (changed for this booking)' }] });
  await batch.commit();
}

// ---------- What goes on the invoice ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = iso => (iso ? `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : '');
const num = v => Math.round((+v || 0) * 1000) / 1000;   // 3 decimals in sums; 2 on the page
// 20 Nov 2026 (Khairul): the security deposit and other fees typed on the booking form are saved as charges on the first month
// in the booking's Payments tab (b.monthCharges), so there is one place for them and nothing is counted twice.
export const FEE_LABELS = [['securityDeposit', 'Security deposit'], ['utilityDeposit', 'Utility deposit'], ['internetFee', 'Internet fees'], ['carparkFee', 'Carpark fees'], ['cleaningFee', 'Cleaning fees'],
  ['taFee', 'Tenancy agreement fees'], ['taStampFee', 'Tenancy agreement stamping fees'],
  ['gatewayFee', 'Payment gateway charges'], ['cardFee', 'Credit card charges'], ['othersFee', 'Others']];

// Months from the move-in date: the same day each month (31 Jan -> 28/29 Feb when the month is shorter); the rest is a part month
const iso = d => d.toISOString().slice(0, 10);
function addMonths(a, n) {
  const [y, m, d] = a.split('-').map(Number), t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last)); return iso(t);
}
// 24 Nov 2026 (Khairul): a move-in on the last day of a month runs end of month to end of month (30 Nov -> 31 Dec -> 31 Jan -> 28 Feb),
// so 30 Nov - 31 Dec is one month, not one month and a day.
const isMonthEnd = d => { const [y, m, dd] = d.split('-').map(Number); return dd === new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const anniversary = (arrival, n) => {
  if (!isMonthEnd(arrival)) return addMonths(arrival, n);
  const [y, m] = arrival.split('-').map(Number); return iso(new Date(Date.UTC(y, m + n, 0)));
};
// fullLast (20 Nov 2026): an early termination with no notice pays the last part month in full
// monthly (24 Nov 2026, Khairul): a Monthly Lease (30 to 364 nights, not ended early) is charged in whole months only. A stay
// shorter than its first month end (30 Nov - 30 Dec) is still one month. Yearly leases and early terminations keep the last
// part month by days.
// 25 Nov 2026 (Khairul): a Monthly Lease counts 30 nights per month from the check-in; the nights left over are a new month
// charged by nights (rent / 30 x nights). 25 Nov - 23 Feb (90 nights) = 3 months of 30 nights; 25 Nov - 26 Feb (93 nights)
// = 3 months + a 4th of 3 nights. Yearly leases and early terminations keep calendar months (below).
// 25 Nov 2026 (Khairul): extraNight (the booking's "Last night is part of the month" switch): a stay that ends exactly ONE
// night past a whole month or year (15 Dec - 15 Jan, a 31-day month) has that night in its last month at the same rent,
// instead of a 1-night month of its own.
function monthsOf(arrival, departure, rent, fullLast = false, { monthly = false, extraNight = false } = {}) {
  const out = monthsRaw(arrival, departure, rent, fullLast, { monthly });
  const last = out[out.length - 1];
  if (extraNight && out.length > 1 && Math.round((Date.parse(last.to) - Date.parse(last.from)) / 86400000) === 1) { out.pop(); out[out.length - 1].to = last.to; }
  return out;
}
function monthsRaw(arrival, departure, rent, fullLast = false, { monthly = false } = {}) {
  if (!arrival || !departure || departure <= arrival) return [];
  const out = [];
  if (monthly) {
    const plus = (d, n) => iso(new Date(Date.parse(d) + n * 86400000));
    const total = Math.round((Date.parse(departure) - Date.parse(arrival)) / 86400000);
    for (let i = 0, at = arrival; i * 30 < total && i < 120; i++) {
      const nights = Math.min(30, total - i * 30), to = plus(arrival, i * 30 + nights);
      out.push({ label: `Month ${i + 1}`, from: at, to, days: nights < 30 ? nights : 0, rent: num(nights < 30 ? rent / 30 * nights : rent) });
      at = to;
    }
    return out;
  }
  let from = arrival;
  for (let i = 1; i <= 120; i++) {
    const to = anniversary(arrival, i);
    if (to > departure) break;
    out.push({ label: `Month ${i}`, from, to, days: 0, rent: num(rent) }); from = to;
  }
  if (from < departure) {
    const days = Math.round((Date.parse(departure) - Date.parse(from)) / 86400000);
    out.push({ label: `Month ${out.length + 1}`, from, to: departure, days: fullLast ? 0 : days, rent: num(fullLast ? rent : rent / 30 * days) });
  }
  return out;
}
const nightsOf = (a, d) => (a && d ? Math.round((Date.parse(d) - Date.parse(a)) / 86400000) : 0);
// 24 Nov 2026 (Khairul): a lease's months, the same for the invoice, the booking's Payments tab, the Bookings list and the
// offline payment form. b = { arrival, departure, earlyTermination }; rent = the monthly rent. [] for a stay under 30 nights.
// Each: { m: 'YYYY-MM' the month starts in (payments' For month and month charges use it), label, from, to, days, rent }.
export function leaseMonths(b, rent) {
  const n = nightsOf(b?.arrival, b?.departure);
  if (n < 30) return [];
  const et = b.earlyTermination && b.earlyTermination.date ? b.earlyTermination : null;
  return monthsOf(b.arrival, b.departure, Number(rent) || 0, et?.type === 'sudden', { monthly: n < 365 && !et, extraNight: !!b.extraNight })
    .map(x => ({ ...x, m: x.from.slice(0, 7), rent: Math.round(x.rent * 100) / 100 }));
}
// Which lease month a calendar month ('YYYY-MM', a payment's For month or a month charge) counts in: the last month that starts
// in it or before it (a month before the stay counts in the first)
// 27 Nov 2026 (Khairul): a Monthly Lease runs in 30-night months, so two can start in one calendar month (1 Dec - 31 Dec, then
// 31 Dec - 30 Jan). A 'YYYY-MM' key goes on the FIRST lease month starting in it; a charge for a later one is keyed by that
// month's start date 'YYYY-MM-DD' (leaseKey) and goes on the month it falls in.
export const leaseSlot = (months, ym) => {
  const k = String(ym || ''), m = x => String(x.from || x.m || '').slice(0, 7); let at = 0;
  if (k.length > 7) { months.forEach((x, i) => { if (String(x.from || '') <= k) at = i; }); return at; }
  const first = months.findIndex(x => m(x) === k); if (first >= 0) return first;
  months.forEach((x, i) => { if (m(x) <= k) at = i; }); return at;
};
// The month charge key for lease month i: 'YYYY-MM' for the first month starting in that calendar month, else its start date
export const leaseKey = (months, i) => { const k = String(months[i]?.from || '').slice(0, 7); return months.findIndex(x => String(x.from || '').slice(0, 7) === k) === i ? k : months[i].from; };
// "30 Nov – 31 Dec 2026"
export const leaseSpan = x => (x ? `${day(x.from).replace(/ \d{4}$/, x.from.slice(0, 4) === x.to.slice(0, 4) ? '' : ` ${x.from.slice(0, 4)}`)} – ${day(x.to)}` : '');
// 20 Nov 2026: a stay ended early WITH notice pays its last part month by days. { m: 'YYYY-MM' (the move-out month), due }
// or null (no termination, sudden, or the move-out lands on a monthly anniversary). Used by the Bookings list.
// 23 Nov 2026: the calendar months ('YYYY-MM') the invoice months start in: where a Monthly fee typed on the booking form is
// charged (one per invoice month, the last part month too). A stay under 30 nights: its check-in month only.
export function invoiceMonthKeys(arrival, departure) {
  const nights = arrival && departure ? Math.round((Date.parse(departure) - Date.parse(arrival)) / 86400000) : 0;
  if (!arrival) return [];
  if (nights < 30) return [String(arrival).slice(0, 7)];
  const ms = leaseMonths({ arrival, departure }, 1); return ms.map((_, i) => leaseKey(ms, i));   // 27 Nov 2026: one key per lease month
}
export function termLastDue(b) {
  const e = b?.earlyTermination;
  if (!e?.date || e.type !== 'notice' || !b.longTerm) return null;
  const ms = monthsOf(b.arrival, b.departure, Number(b.monthlyRent) || 0), l = ms[ms.length - 1];
  return l && l.days ? { m: String(b.departure).slice(0, 7), due: Math.round(l.rent * 100) / 100 } : null;
}
// Older bookings (saved before 20 Nov 2026) kept the deposit and fees as fields on the booking (securityDeposit or deposit,
// utilityDeposit, carparkFee, ...). Until the booking is saved again they are read as charges on the check-in month.
// A booking saved since then has feesInPayments: true and keeps them in monthCharges only (the old fields are left as they were).
export function legacyCharges(b) {
  if (!b || b.feesInPayments) return [];
  const note = String(b.othersNote || '').trim();
  return FEE_LABELS.map(([k, label]) => ({ key: k, label, amount: num(k === 'securityDeposit' ? (b.securityDeposit || b.deposit) : b[k]), ...(k === 'othersFee' && note ? { note } : {}) }))
    .filter(c => c.amount > 0).map(c => ({ ...c, amount: Math.round(c.amount * 100) / 100 }));
}
// 20 Nov 2026 (Khairul): one line per charge in a month. A charge of the same kind (Others: same note too) is added into the
// line already there instead of making a second one.
const sameCharge = (a, b) => a.key === b.key && (a.key !== 'othersFee' || String(a.note || '').trim() === String(b.note || '').trim());
export function addInto(list, c) {
  const out = (list || []).map(x => ({ ...x })), at = out.find(x => sameCharge(x, c));
  if (at) at.amount = Math.round(((+at.amount || 0) + (+c.amount || 0)) * 100) / 100; else out.push({ ...c });
  return out;
}
export const mergeCharges = list => (list || []).reduce((out, c) => addInto(out, c), []);
// Every charge on the booking by month { 'YYYY-MM': [...] }: the old fields (if any) first on the check-in month, then the month charges
export function allMonthCharges(b) {
  const out = {};
  Object.entries(b?.monthCharges || {}).forEach(([m, l]) => { if (Array.isArray(l)) out[m] = l.map(x => ({ ...x })); });
  const old = legacyCharges(b), m = String(b?.arrival || '').slice(0, 7);
  if (old.length && m) out[m] = [...old, ...(out[m] || [])];
  Object.keys(out).forEach(k => { out[k] = mergeCharges(out[k]); });   // same kind in a month = one line
  return out;
}
// The security deposit on a booking: Security deposit charges in every month
export const depositOf = b => Object.values(allMonthCharges(b)).flat().filter(c => c.key === 'securityDeposit').reduce((t, c) => t + num(c.amount), 0);
const span = (a, b) => `${day(a)} – ${day(b)}`;
// A month charge's name: "Others (note)" when Others has a note; the label saved with it, else the fee's own label
export const chargeLabel = c => {
  const note = String(c?.note || '').trim();
  if (c?.key === 'othersFee') return note ? `Others (${note})` : 'Others';
  return c?.label || FEE_LABELS.find(([k]) => k === c?.key)?.[1] || 'Charge';
};

// b = the booking's fields as saved (offlineBookings) or as on the form; t = tenant { name, email, phone }; unitType from the unit (info.type)
// 20 Nov 2026: propertyAddress (properties/{id}.info) heads the invoice with the property's own name and address
// 23 Nov 2026 (Khairul): fees = Booking settings > Other fees (lib/booking-settings.js feesForForms()). A fee whose mode for the
// booking's type of rent is 'intoRent' is not printed as a line: its amount is added into the rent shown for the month it is
// charged in (a Monthly fee is charged on every month, a One-off fee on the first month). Short term: added into the stay's
// rental, and the rate per night shown is that total / nights (2 decimals; the total stays exact). The grand total never
// changes. Only this tenant-facing invoice merges: the booking, Payments tab, statements and reports keep rent and fees apart.
// Without fees (null) nothing is merged (as before).
export function invoiceOf(b, t, { propertyName = '', unitCode = '', unitType = '', propertyAddress = '', fees = null } = {}) {
  const nights = b.arrival && b.departure ? Math.round((Date.parse(b.departure) - Date.parse(b.arrival)) / 86400000) : null;
  const longTerm = nights != null && nights >= 30;
  const rental = num(longTerm ? (b.monthlyRent || b.rental) : b.rental);
  // 20 Nov 2026 (Khairul): a stay longer than one month gets a page per month after the summary page. Months run from the
  // move-in date (19 Oct - 19 Nov is month 1, 19 Nov - 19 Dec month 2); a last part month is charged by days (rent / 30 x days).
  // 20 Nov 2026: the deposit and fees are month charges too (older bookings: their old fields on the check-in month, see allMonthCharges).
  const et = b.earlyTermination && b.earlyTermination.date ? b.earlyTermination : null;
  const months = longTerm && rental > 0 ? monthsOf(b.arrival, b.departure, rental, et?.type === 'sudden', { monthly: nights < 365 && !et, extraNight: !!b.extraNight }) : [];   // 24 Nov 2026: Monthly Lease in whole months
  // 20 Nov 2026: extra charges added to a month on the booking (Portfolio > Bookings > Total Payments), b.monthCharges
  // { 'YYYY-MM': [{ key, label, amount, note }] }. On a multi-month invoice each goes on the month that starts in that
  // calendar month (a later calendar month with no invoice month of its own goes on the last one).
  const extras = Object.entries(allMonthCharges(b)).sort(([x], [y]) => x.localeCompare(y))
    .flatMap(([ym, list]) => (Array.isArray(list) ? list : []).map(c => ({ ym, key: c.key, label: chargeLabel(c), v: num(c.amount) }))).filter(c => c.v > 0);
  // 23 Nov 2026: fees added into the rent (see above) and the ones still printed as lines
  const col = feeColOf(b), into = c => Array.isArray(fees) && feeModeOf(fees, c.key, col) === 'intoRent';
  const folded = extras.filter(into), asLines = extras.filter(c => !into(c)), add = list => num(list.reduce((t, c) => t + c.v, 0));
  let amounts, monthlyRent = rental, perNight = null;
  if (months.length > 1) {
    const slot = ym => leaseSlot(months, ym);   // 27 Nov 2026: same as the Payments tab
    months.forEach((m, i) => {
      m.folded = add(folded.filter(c => slot(c.ym) === i));
      m.rent = num(m.rent + m.folded);
      m.amounts = [[m.days ? `Rent (${m.days} day${m.days === 1 ? '' : 's'})` : 'Monthly rent', m.rent], ...asLines.filter(c => slot(c.ym) === i).map(c => [c.label, c.v])].filter(([, v]) => v > 0);
      m.total = m.amounts.reduce((t, [, v]) => t + v, 0);
    });
    // The monthly rent shown: what most full months show (a One-off fee added into the first month doesn't count)
    if (folded.length) {
      const seen = new Map();
      months.filter(m => !m.days).forEach(m => seen.set(m.rent, (seen.get(m.rent) || 0) + 1));
      monthlyRent = [...seen.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]?.[0] ?? rental;
    }
    amounts = [...months.map(m => [`${m.label} rent (${span(m.from, m.to)})`, m.rent]),
      ...asLines.map(c => [`${months[slot(c.ym)].label}: ${c.label}`, c.v])].filter(([, v]) => v > 0);
  } else {
    const shown = num(rental + add(folded));
    if (longTerm) monthlyRent = shown;
    // Short term: the rate per night shown = the stay's rental (fees added in) / nights, to 2 decimals; the total stays exact
    else if (nights > 0 && shown > 0) perNight = Math.round(shown / nights * 100) / 100;
    amounts = [[longTerm ? 'Monthly rent' : 'Rental', shown],
      ...asLines.map(c => [c.ym === String(b.arrival || '').slice(0, 7) ? c.label : `${c.label} (${MON[+c.ym.slice(5, 7) - 1]} ${c.ym.slice(0, 4)})`, c.v])].filter(([, v]) => v > 0);
  }
  return {
    months: months.length > 1 ? months : [], monthlyRent, perNight,
    propertyName: propertyName || b.propertyName || '', propertyAddress,
    tenant: [['Name', t?.name], ['Email', t?.email], ['Phone number', t?.phone]],
    property: [['Property', propertyName || b.propertyName], ['Unit', unitCode || b.unitCode], ['Type', unitType]],
    terms: [['Type of rent', rentTermLabel(b.rentType)], ['Move-in date', day(b.arrival)], ['Move-out date', day(b.departure)], ['Total nights', nights == null || nights < 0 ? '' : String(nights)],
      ...(perNight != null ? [['Rate per night', `${money(perNight)} (total for ${nights} night${nights === 1 ? '' : 's'}: ${money(amounts[0]?.[1])})`]] : []),
      ...(et ? [['Early termination', `${et.type === 'sudden' ? 'Without notice' : 'With notice'} (was ${day(et.originalDeparture)})`]] : [])],
    amounts,
    total: amounts.reduce((s, [, v]) => s + v, 0)
  };
}

const W = 595.28, H = 841.89, M = 40;
const INK = [0.1, 0.1, 0.1], GREY = [0.42, 0.42, 0.42], LINE = [0.78, 0.78, 0.78];
const money = v => 'RM ' + (+v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safe = s => String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim();
const lines = s => String(s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);

// 20 Nov 2026 (Khairul): the invoice goes to customers, so it uses Inter (the PMS screen font, public/fonts, from Google
// Fonts, SIL Open Font License) instead of the statements' Roboto Condensed. If the files can't be loaded, Roboto is used.
const INVOICE_FONTS = { regular: '/fonts/Inter-Regular.ttf', bold: '/fonts/Inter-Bold.ttf' };
let interFonts;
function loadInvoiceFonts() {
  interFonts ||= Promise.all(Object.values(INVOICE_FONTS).map(async url => {
    const res = await fetch(url), bytes = new Uint8Array(await res.arrayBuffer());
    if (!res.ok || bytes[0] === 0x3c) throw new Error('Invoice font missing');   // a missing file comes back as the app's page
    return bytes;
  })).then(([regular, bold]) => ({ regular, bold })).catch(e => { interFonts = null; throw e; });
  return interFonts;
}

// The address line of a property: properties/{id}.info address and city (the city only when the address doesn't name it)
export const propertyAddressOf = p => {
  const i = p?.info || {}, a = String(i.address || '').trim(), c = String(i.city || '').trim();
  return [a, c && !a.toLowerCase().includes(c.toLowerCase()) ? c : ''].filter(Boolean).join(', ');
};
// The header: the property's name ("<name> By Widebed") and address, then the contact lines (phone, email, URL) from
// Invoice settings. Without a property name, the Invoice settings header is printed as it is.
function headerLines(inv, header) {
  const all = lines(header), name = String(inv.propertyName || '').trim();
  if (!name) return all;
  const contact = all.filter(l => /^(phone|tel|e-?mail|url|web)/i.test(l) || /@|https?:\/\//i.test(l));
  return [/widebed/i.test(name) ? name : `${name} By Widebed`, inv.propertyAddress, ...contact].filter(Boolean);
}
const SIGN_NOTE = 'NO SIGNATURE REQUIRED, COMPUTER GENERATED';
const FOOT = 48;   // space kept at the bottom of every page for the signature line

// inv from invoiceOf(); { header, terms, bank } text (terms may be changed for this invoice); folio = the booking number
// 20 Nov 2026 (Khairul): the invoice must fit on one page (a multi-month stay: one page each for the summary and every
// month). Text and spacing start 10% smaller than before and shrink in steps (to 60% at the least) until every part fits its page.
const FIT_STEPS = [0.9, 0.84, 0.78, 0.72, 0.66, 0.6];
export async function buildInvoicePdf(inv, opts) {
  const [{ lib, fontkit, fonts: roboto }, inter] = await Promise.all([loadPdfKit(), loadInvoiceFonts().catch(() => null)]);
  const bytes = inter || roboto, kit = { lib, fontkit, bytes, subset: !inter, measure: makeMeasure(fontkit, bytes) };
  // 20 Nov 2026: the sizes are tried as a dry run (measuring only, no PDF, no font embedding), then the PDF is made once.
  // Making a full PDF for every try froze the browser on a 14-month invoice.
  let k = FIT_STEPS[FIT_STEPS.length - 1];
  for (const step of FIT_STEPS) {
    if ((await layoutInvoice(kit, inv, opts, step, true)).fits) { k = step; break; }
    await new Promise(r => setTimeout(r));   // let the page breathe between tries
  }
  return (await layoutInvoice(kit, inv, opts, k)).pdf.save();
}

// Text widths straight from the font files, each word measured once and reused (also across tries). Same advance widths
// pdf-lib uses, so the dry run and the real PDF break lines the same way.
function makeMeasure(fontkit, bytes) {
  const fonts = { r: fontkit.create(bytes.regular), b: fontkit.create(bytes.bold) }, cache = new Map();
  const unit = (w, b) => {
    const key = (b ? 'b|' : 'r|') + w;
    let v = cache.get(key);
    if (v == null) { const f = b ? fonts.b : fonts.r; v = f.layout(w).advanceWidth / f.unitsPerEm; cache.set(key, v); }
    return v;
  };
  return (s, size, b) => { let t = 0; String(s).split(' ').forEach((p, i) => { if (i) t += unit(' ', b); if (p) t += unit(p, b); }); return t * size; };
}
const DRY_PAGE = { drawText() {}, drawRectangle() {} };

async function layoutInvoice({ lib, fontkit, bytes, subset, measure }, inv, { header, terms, bank, folio = '', only = null }, k, dry = false) {
  const z = n => n * k;   // every font size and gap is scaled by k
  let pdf = null, reg = null, bold = null, count = 0;
  if (!dry) {
    pdf = await lib.PDFDocument.create();
    pdf.registerFontkit(fontkit);
    // Inter is embedded whole: pdf-lib's font subsetting drops most of Inter's letters (tested 20 Nov 2026). About 350 KB a PDF.
    reg = await pdf.embedFont(bytes.regular, { subset }); bold = await pdf.embedFont(bytes.bold, { subset });
    pdf.setTitle('Invoice'); pdf.setAuthor('Widebed'); pdf.setCreator('Widebed PMS'); pdf.setProducer('Widebed PMS');
  }

  let page, y;
  const width = measure;
  const text = (s, x, yy, { size = z(10), b = false, color = INK, align = 'left' } = {}) => {
    s = safe(s); if (!s) return;
    const w = width(s, size, b), x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    page.drawText(s, { x: x0, y: yy, size, font: b ? bold : reg, color: lib.rgb(...color) });
  };
  const rule = (yy, t = 0.6, color = LINE) => page.drawRectangle({ x: M, y: yy, width: W - 2 * M, height: t, color: lib.rgb(...color) });
  const wrap = (s, w, size, b = false) => {
    const out = [];
    for (const word of safe(s).split(/\s+/).filter(Boolean)) {
      const last = out[out.length - 1];
      if (last != null && width(`${last} ${word}`, size, b) <= w) out[out.length - 1] = `${last} ${word}`; else out.push(word);
    }
    return out;
  };
  // 20 Nov 2026: addresses break after a comma and the lines come out about the same length (no lone "Kuala Lumpur" on
  // its own line). A part longer than the width falls back to breaking between words.
  const wrapAddr = (s, w, size) => {
    const parts = safe(s).split(/(?<=,)\s+/).filter(Boolean);
    if (!parts.length) return [];
    if (parts.some(p => width(p, size) > w)) return wrap(s, w, size);
    const fill = max => { const out = []; for (const p of parts) { const last = out[out.length - 1];
      if (last != null && width(`${last} ${p}`, size) <= max) out[out.length - 1] = `${last} ${p}`; else out.push(p); } return out; };
    const n = fill(w).length;
    let lo = Math.max(...parts.map(p => width(p, size))), hi = w;
    while (hi - lo > 1) { const mid = (lo + hi) / 2; if (fill(mid).length <= n) hi = mid; else lo = mid; }
    return fill(hi);
  };
  const newPage = () => { page = dry ? DRY_PAGE : pdf.addPage([W, H]); count++; y = H - 40; };
  const room = need => { if (y - need < FOOT) newPage(); };
  const heading = s => { room(z(34)); y -= z(6); text(s, M, y, { size: z(10.5), b: true }); y -= z(6); rule(y); y -= z(15); };
  const LBL = 140;   // label column width in Rent & Terms
  const kv = (label, value) => {
    const ls = wrap(value, W - 2 * M - LBL, z(10));
    room(ls.length * z(13));
    text(label, M, y, { color: GREY });
    ls.forEach((ln, i) => text(ln, M + LBL, y - i * z(13)));
    y -= ls.length * z(13) + z(2);
  };

  const drawTop = (sub) => {
    // Header: the first line is the name, the rest small underneath (all centred, as on the folio)
    headerLines(inv, header).forEach((ln, i) => {
      if (i === 0) { text(ln, W / 2, y, { size: z(15), b: true, align: 'center' }); y -= z(18); }
      else wrapAddr(ln, 360, z(9)).forEach(w => { text(w, W / 2, y, { size: z(9), color: GREY, align: 'center' }); y -= z(12); });
    });
    y -= z(14);
    text('I N V O I C E', W / 2, y, { size: z(14), b: true, align: 'center' });
    const now = new Date();
    text(`Date: ${now.getDate()} ${MON[now.getMonth()]} ${now.getFullYear()}`, W - M, y + (folio ? z(6) : 0), { size: z(9), color: GREY, align: 'right' });
    if (folio) text(`Folio No: ${folio}`, W - M, y - z(6), { size: z(9), b: true, align: 'right' });   // 20 Nov 2026: the booking number (per property)
    if (sub) { y -= z(20); text(sub, W / 2, y, { size: z(10), b: true, color: GREY, align: 'center' }); }
    y -= z(26);
  };
  const drawParticulars = () => {
    // Tenant and Property particulars side by side
    const cols = [['Tenant Particulars', inv.tenant], ['Property Particulars', inv.property]]
      .map(([t, rows]) => [t, rows.filter(([, v]) => String(v ?? '').trim())]).filter(([, rows]) => rows.length);
    if (cols.length) {
      const cw = (W - 2 * M - 24) / 2, lw = 85;
      room(z(40)); y -= z(6);
      const top = y;
      let low = y;
      cols.forEach(([t, rows], i) => {
        const x = M + i * (cw + 24);
        let yy = top;
        text(t, x, yy, { size: z(10.5), b: true }); yy -= z(6);
        page.drawRectangle({ x, y: yy, width: cw, height: 0.6, color: lib.rgb(...LINE) }); yy -= z(15);
        for (const [l, v] of rows) {
          const ls = wrap(v, cw - lw, z(10));
          text(l, x, yy, { color: GREY });
          ls.forEach((ln, j) => text(ln, x + lw, yy - j * z(13)));
          yy -= ls.length * z(13) + z(2);
        }
        low = Math.min(low, yy);
      });
      y = low - z(8);
    }
  };
  const drawRent = (title, rows, amounts, total, totalLabel) => {
    const termRows = rows.filter(([, v]) => String(v ?? '').trim());
    if (termRows.length || amounts.length) {
      heading(title);
      termRows.forEach(([l, v]) => kv(l, v));
      if (amounts.length) {
        y -= z(4);
        for (const [label, v] of amounts) { room(z(15)); text(label, M, y); text(money(v), W - M, y, { align: 'right' }); y -= z(14); }
        room(z(24)); rule(y + z(9), 0.8, INK); y -= z(6);
        text(totalLabel, M, y, { b: true, size: z(11) }); text(money(total), W - M, y, { b: true, size: z(11), align: 'right' }); y -= z(18);
      }
      y -= z(6);
    }
  };
  const drawTerms = () => {
    // T&Cs: section lines ("A. INTERPRETATION" or all capitals) in bold; numbered lines hang under their number
    const tl = lines(terms);
    if (tl.length) {
      room(z(40)); y -= z(6);
      for (const ln of tl) {
        const numbered = ln.match(/^(\d+[.)])\s+(.*)$/);
        const isHead = !numbered && (/^[A-Z][.)]\s/.test(ln) || ln === ln.toUpperCase());
        if (isHead) { room(z(20)); y -= z(3); wrap(ln, W - 2 * M, z(8), true).forEach(w => { text(w, M, y, { size: z(8), b: true }); y -= z(10); }); continue; }
        const body = numbered ? numbered[2] : ln, x = numbered ? M + z(14) : M;
        const ws = wrap(body, W - M - x, z(7.5));
        room(ws.length * z(9.5));
        if (numbered) text(numbered[1], M, y, { size: z(7.5) });
        ws.forEach(w => { text(w, x, y, { size: z(7.5) }); y -= z(9.5); });
      }
      y -= z(8);
    }
  };
  const drawBank = () => {
    const bl = lines(bank);
    if (bl.length) {
      room(z(14) + bl.length * z(9.5));   // its real height, so it stays on the page above the signature line
      text('BANK DETAILS', M, y, { size: z(8), b: true }); y -= z(11);
      for (const ln of bl) {
        // "Label: value": a wrapped value hangs under the value, not under the label; addresses break at commas
        const lv = ln.match(/^([^:]{1,24}:)\s+(.*)$/), lab = lv ? lv[1] + ' ' : '', x = M + z(14) + (lab ? width(lab, z(7.5)) : 0);
        const ws = wrapAddr(lv ? lv[2] : ln, Math.min(300, W - M - x), z(7.5));
        room(ws.length * z(9.5));
        text('•', M, y, { size: z(7.5) });
        if (lab) text(lab, M + z(14), y, { size: z(7.5) });
        ws.forEach(w => { text(w, x, y, { size: z(7.5) }); y -= z(9.5); });
      }
    }
  };

  // Page 1: the whole stay. A stay over one month (inv.months) adds a page per month: rent and that month's charges (deposit, fees).
  // 20 Nov 2026: only = a month's index downloads that month's page alone (Invoice popup > What to download)
  const multi = inv.months?.length > 1, one = multi && only != null && inv.months[only] ? only : null;
  if (one == null) {
    newPage();
    drawTop('');
    drawParticulars();
    drawRent('Rent & Terms', multi ? [...inv.terms, ['Monthly rent', money(inv.monthlyRent)]] : inv.terms, inv.amounts, inv.total, multi ? 'Total for the stay' : 'Total');
    drawTerms();
    drawBank();
  }
  if (multi) inv.months.forEach((m, i) => {
    if (one != null && i !== one) return;
    newPage();
    drawTop(`${m.label} of ${inv.months.length}`);
    drawParticulars();
    // 23 Nov 2026: a part month with a fee added into its rent shows the days only (the rent is no longer just rent / 30 x days)
    drawRent(`${m.label}`, [['Period', span(m.from, m.to)], ...(m.days ? [['Days', m.folded ? `${m.days}` : `${m.days} (monthly rent / 30 x days)`]] : [])], m.amounts, m.total, `Total for ${m.label.toLowerCase()}`);
    drawTerms();   // 20 Nov 2026 (Khairul): month pages carry the full T&Cs too
    drawBank();
  });
  const expected = one != null ? 1 : 1 + (multi ? inv.months.length : 0);
  if (dry) return { fits: count === expected };
  // 20 Nov 2026: a signature line at the bottom right of every page, with the computer-generated note in bold under it
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    page = p;
    const lw = 200, x0 = W - M - lw;
    page.drawRectangle({ x: x0, y: 36, width: lw, height: 0.7, color: lib.rgb(...INK) });
    text(SIGN_NOTE, x0 + lw / 2, 26, { size: 7.5, b: true, align: 'center' });
    if (pages.length > 1) text(`Page ${i + 1} of ${pages.length}`, M, 26, { size: 7.5, color: GREY });
  });
  return { pdf, fits: pages.length === expected };
}

export const invoiceFileName = (inv, bookingNo = '', only = null) => {
  const name = inv.tenant.find(([l]) => l === 'Name')?.[1] || '', part = only != null && inv.months?.[only] ? inv.months[only].label : '';
  return `Invoice ${[bookingNo, name, part].filter(Boolean).join(' ')}`.replace(/[\\/:*?"<>|]+/g, '').trim() + '.pdf';
};
