// Booking invoice (Portfolio > Bookings), 16 Nov 2026 (Khairul).
// A booking saved as Awaiting payment (offlineBookings status 'pending') gets an invoice to send to the prospect.
// Layout follows the eZee folio invoice, but only with what the booking has: tenant particulars, property particulars,
// rent & terms (no rental status), then the T&Cs and the bank details. A field left empty is not printed.
// Nothing is saved: each download makes a fresh PDF. The header, T&Cs and bank details come from config/invoiceDefaults
// (Portfolio > Bookings > Invoice settings, Directors; Firestore rules 0.71); the T&Cs can be changed for one invoice.
import { doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase.js';
import { useSession } from '@/stores/session.js';
import { audit } from './finance-data.js';
import { loadPdfKit } from './statement-pdf.js';

export const INVOICE_DEFAULTS = {
  header: [
    'PJ Centrestage By Widebed',
    '3A, Jalan 13/2, Seksyen 13, 46200 Petaling Jaya, Selangor, Malaysia',
    'Phone: +60125867200 · Email: booking@widebed.com',
    'URL: https://klshortstay.com.my'
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
export async function saveInvoiceDefaults({ header, terms, bank }) {
  const me = useSession();
  const clean = { header: String(header || '').trim(), terms: String(terms || '').trim(), bank: String(bank || '').trim() };
  const batch = writeBatch(db);
  batch.set(doc(db, 'config', 'invoiceDefaults'), { ...clean, updatedBy: me.user.uid, updatedByName: me.name, updatedAt: serverTimestamp() });
  audit(batch, me, { action: 'invoiceDefaults.update', entity: 'config/invoiceDefaults', reason: 'Booking invoice defaults changed', changes: [] });
  await batch.commit();
  cache = null;
}

// ---------- What goes on the invoice ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = iso => (iso ? `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : '');
const num = v => Math.round((+v || 0) * 1000) / 1000;   // 3 decimals in sums; 2 on the page
export const FEE_LABELS = [['utilityDeposit', 'Utility deposit'], ['internetFee', 'Internet fees'], ['carparkFee', 'Carpark fees'], ['cleaningFee', 'Cleaning fees'],
  ['taFee', 'Tenancy agreement fees'], ['taStampFee', 'Tenancy agreement stamping fees'],
  ['gatewayFee', 'Payment gateway charges'], ['cardFee', 'Credit card charges'], ['othersFee', 'Others']];

// b = the booking's fields as saved (offlineBookings) or as on the form; t = tenant { name, email, phone }; unitType from the unit (info.type)
export function invoiceOf(b, t, { propertyName = '', unitCode = '', unitType = '' } = {}) {
  const nights = b.arrival && b.departure ? Math.round((Date.parse(b.departure) - Date.parse(b.arrival)) / 86400000) : null;
  const longTerm = nights != null && nights >= 30;
  const rental = num(longTerm ? (b.monthlyRent || b.rental) : b.rental);
  const deposit = num(b.securityDeposit || b.deposit);
  const amounts = [
    [longTerm ? 'Monthly rent' : 'Rental', rental],
    ['Security deposit', deposit],
    ...FEE_LABELS.map(([k, label]) => [k === 'othersFee' && String(b.othersNote || '').trim() ? `Others (${String(b.othersNote).trim()})` : label, num(b[k])])
  ].filter(([, v]) => v > 0);
  return {
    tenant: [['Name', t?.name], ['Email', t?.email], ['Phone number', t?.phone]],
    property: [['Property', propertyName || b.propertyName], ['Unit', unitCode || b.unitCode], ['Type', unitType]],
    terms: [['Type of rent', b.rentType], ['Move-in date', day(b.arrival)], ['Move-out date', day(b.departure)], ['Total nights', nights == null || nights < 0 ? '' : String(nights)]],
    amounts,
    total: amounts.reduce((s, [, v]) => s + v, 0)
  };
}

const W = 595.28, H = 841.89, M = 40;
const INK = [0.1, 0.1, 0.1], GREY = [0.42, 0.42, 0.42], LINE = [0.78, 0.78, 0.78];
const money = v => 'RM ' + (+v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safe = s => String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim();
const lines = s => String(s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);

// inv from invoiceOf(); { header, terms, bank } text (terms may be changed for this invoice)
export async function buildInvoicePdf(inv, { header, terms, bank }) {
  const { lib, fontkit, fonts: bytes } = await loadPdfKit();
  const pdf = await lib.PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const reg = await pdf.embedFont(bytes.regular, { subset: true }), bold = await pdf.embedFont(bytes.bold, { subset: true });
  pdf.setTitle('Invoice'); pdf.setAuthor('Widebed'); pdf.setCreator('Widebed PMS'); pdf.setProducer('Widebed PMS');

  let page, y;
  const width = (s, size, b) => (b ? bold : reg).widthOfTextAtSize(String(s), size);
  const text = (s, x, yy, { size = 10, b = false, color = INK, align = 'left' } = {}) => {
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
  const newPage = () => { page = pdf.addPage([W, H]); y = H - 40; };
  const room = need => { if (y - need < 36) newPage(); };
  const heading = s => { room(34); y -= 6; text(s, M, y, { size: 10.5, b: true }); y -= 6; rule(y); y -= 15; };
  const kv = (label, value) => {
    const ls = wrap(value, W - 2 * M - 140, 10);
    room(ls.length * 13);
    text(label, M, y, { color: GREY });
    ls.forEach((ln, i) => text(ln, M + 140, y - i * 13));
    y -= ls.length * 13 + 2;
  };
  const block = (title, rows) => {
    const shown = rows.filter(([, v]) => String(v ?? '').trim());
    if (!shown.length) return;
    heading(title);
    shown.forEach(([l, v]) => kv(l, v));
    y -= 6;
  };

  newPage();
  // Header: the first line is the name, the rest small underneath (all centred, as on the folio)
  lines(header).forEach((ln, i) => {
    if (i === 0) { text(ln, W / 2, y, { size: 15, b: true, align: 'center' }); y -= 18; }
    else wrap(ln, W - 2 * M, 9).forEach(w => { text(w, W / 2, y, { size: 9, color: GREY, align: 'center' }); y -= 12; });
  });
  y -= 14;
  text('I N V O I C E', W / 2, y, { size: 14, b: true, align: 'center' });
  const now = new Date();
  text(`Date: ${now.getDate()} ${MON[now.getMonth()]} ${now.getFullYear()}`, W - M, y, { size: 9, color: GREY, align: 'right' });
  y -= 26;

  // Tenant and Property particulars side by side (keeps the invoice to one page where it can)
  const cols = [['Tenant Particulars', inv.tenant], ['Property Particulars', inv.property]]
    .map(([t, rows]) => [t, rows.filter(([, v]) => String(v ?? '').trim())]).filter(([, rows]) => rows.length);
  if (cols.length) {
    const cw = (W - 2 * M - 24) / 2;
    room(40); y -= 6;
    const top = y;
    let low = y;
    cols.forEach(([t, rows], i) => {
      const x = M + i * (cw + 24);
      let yy = top;
      text(t, x, yy, { size: 10.5, b: true }); yy -= 6;
      page.drawRectangle({ x, y: yy, width: cw, height: 0.6, color: lib.rgb(...LINE) }); yy -= 15;
      for (const [l, v] of rows) {
        const ls = wrap(v, cw - 85, 10);
        text(l, x, yy, { color: GREY });
        ls.forEach((ln, k) => text(ln, x + 85, yy - k * 13));
        yy -= ls.length * 13 + 2;
      }
      low = Math.min(low, yy);
    });
    y = low - 8;
  }
  const termRows = inv.terms.filter(([, v]) => String(v ?? '').trim());
  if (termRows.length || inv.amounts.length) {
    heading('Rent & Terms');
    termRows.forEach(([l, v]) => kv(l, v));
    if (inv.amounts.length) {
      y -= 4;
      for (const [label, v] of inv.amounts) { room(15); text(label, M, y); text(money(v), W - M, y, { align: 'right' }); y -= 14; }
      room(24); rule(y + 9, 0.8, INK); y -= 6;
      text('Total', M, y, { b: true, size: 11 }); text(money(inv.total), W - M, y, { b: true, size: 11, align: 'right' }); y -= 18;
    }
    y -= 6;
  }

  // T&Cs: section lines ("A. INTERPRETATION" or all capitals) in bold; numbered lines hang under their number
  const tl = lines(terms);
  if (tl.length) {
    room(40); y -= 6;
    for (const ln of tl) {
      const numbered = ln.match(/^(\d+[.)])\s+(.*)$/);
      const isHead = !numbered && (/^[A-Z][.)]\s/.test(ln) || ln === ln.toUpperCase());
      if (isHead) { room(20); y -= 3; wrap(ln, W - 2 * M, 8, true).forEach(w => { text(w, M, y, { size: 8, b: true }); y -= 10; }); continue; }
      const body = numbered ? numbered[2] : ln, x = numbered ? M + 14 : M;
      const ws = wrap(body, W - M - x, 7.5);
      room(ws.length * 9.5);
      if (numbered) text(numbered[1], M, y, { size: 7.5 });
      ws.forEach(w => { text(w, x, y, { size: 7.5 }); y -= 9.5; });
    }
    y -= 8;
  }

  const bl = lines(bank);
  if (bl.length) {
    room(24 + bl.length * 10);
    text('BANK DETAILS', M, y, { size: 8, b: true }); y -= 11;
    for (const ln of bl) {
      const ws = wrap(ln, W - 2 * M - 14, 7.5);
      room(ws.length * 9.5);
      text('•', M, y, { size: 7.5 });
      ws.forEach(w => { text(w, M + 14, y, { size: 7.5 }); y -= 9.5; });
    }
  }
  return pdf.save();
}

export const invoiceFileName = (inv, bookingNo = '') => {
  const name = inv.tenant.find(([l]) => l === 'Name')?.[1] || '';
  return `Invoice ${[bookingNo, name].filter(Boolean).join(' ')}`.replace(/[\\/:*?"<>|]+/g, '').trim() + '.pdf';
};
