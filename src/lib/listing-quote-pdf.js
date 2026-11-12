// Quotation PDF for a new owner listing (Listing Flow > Final quotation & payment > Download quotation (PDF)), 11 Nov 2026.
// A plain PDF drawn with pdf-lib (no form fields, so nothing to fill in or change), same fonts as the statements
// (lib/statement-pdf.js loadPdfKit: Roboto Condensed). Widebed orange #F26D4D for the header band and the total.
// Shows what the Payment stage shows: listing, property / unit, owner, rent type and service fee, the services ticked,
// the quotation lines (only the stages in use + the maintenance package), the total, the final amount and the payment
// (type, deposit and balance). Owner phone and email only when the caller passes them (Directors and Procurement).
import { loadPdfKit } from './statement-pdf.js';
import {
  quoteParts, quoteTotal, money, rentLabel, SERVICE_FEE, SERVICES, serviceOn, packageOf, payTypeLabel, isDeposit,
  depositOf, balanceOf, full, stamp, nowIso
} from './owner-leads.js';

const W = 595.28, H = 841.89, M = 48;            // A4, points; margin
const BRAND = [242 / 255, 109 / 255, 77 / 255];  // #F26D4D
const INK = [0.13, 0.13, 0.13], GREY = [0.45, 0.45, 0.45], LINE = [0.85, 0.85, 0.85];
const amt = v => 'RM ' + money(v).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safe = s => String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim();

// l = the listing as on screen (the draft), contact = { ownerPhone, ownerEmail } or null, by = who downloads it
export async function buildQuotePdf(l, { contact = null, by = '' } = {}) {
  const { lib, fontkit, fonts: bytes } = await loadPdfKit();
  const doc = await lib.PDFDocument.create();
  doc.registerFontkit(fontkit);
  const reg = await doc.embedFont(bytes.regular, { subset: true }), bold = await doc.embedFont(bytes.bold, { subset: true });
  doc.setTitle(`Quotation ${l.id}`); doc.setAuthor('Widebed PMS'); doc.setCreator('Widebed PMS'); doc.setProducer('Widebed PMS');
  const made = nowIso();

  let page, y;
  const width = (s, size, b) => (b ? bold : reg).widthOfTextAtSize(String(s), size);
  const text = (s, x, yy, { size = 10, b = false, color = INK, align = 'left' } = {}) => {
    s = safe(s); if (!s) return;
    const w = width(s, size, b), x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    page.drawText(s, { x: x0, y: yy, size, font: b ? bold : reg, color: lib.rgb(...color) });
  };
  const rule = (yy, color = LINE, t = 0.6) => page.drawRectangle({ x: M, y: yy, width: W - 2 * M, height: t, color: lib.rgb(...color) });
  const wrap = (s, w, size) => {
    const out = [];
    for (const word of safe(s).split(/\s+/).filter(Boolean)) {
      const last = out[out.length - 1];
      if (last != null && width(`${last} ${word}`, size) <= w) out[out.length - 1] = `${last} ${word}`; else out.push(word);
    }
    return out;
  };
  const footer = () => text(`${l.id} · Made in the Widebed PMS on ${stamp(made)}${by ? ` by ${by}` : ''}`, M, 28, { size: 8, color: GREY });
  const newPage = () => {
    page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: lib.rgb(...BRAND) });
    text('WIDEBED', M, H - 44, { size: 22, b: true, color: [1, 1, 1] });
    text('QUOTATION', W - M, H - 44, { size: 16, b: true, color: [1, 1, 1], align: 'right' });
    footer();
    y = H - 100;
  };
  const room = need => { if (y - need < 60) newPage(); };
  const heading = s => { room(40); y -= 8; text(s, M, y, { size: 11, b: true, color: BRAND }); y -= 6; rule(y); y -= 16; };
  // A label / value line; long values wrap under themselves
  const kv = (label, value) => {
    const lines = wrap(value || '—', W - 2 * M - 150, 10);
    room(lines.length * 14);
    text(label, M, y, { color: GREY });
    lines.forEach((ln, i) => text(ln, M + 150, y - i * 14));
    y -= lines.length * 14 + 2;
  };
  const amountRow = (label, value, { b = false, color = INK } = {}) => {
    const lines = wrap(label, W - 2 * M - 140, 10);
    room(lines.length * 14 + 4);
    lines.forEach((ln, i) => text(ln, M, y - i * 14, { b, color }));
    text(amt(value), W - M, y, { b, color, align: 'right' });
    y -= lines.length * 14 + 4;
  };

  newPage();
  text(`Quotation for ${l.id}`, M, y, { size: 14, b: true }); text(full(made.slice(0, 10)), W - M, y, { align: 'right' }); y -= 26;

  heading('Property and owner');
  kv('Listing', l.id);
  kv('Property', l.property);
  kv('Unit', [l.unit, l.unitType, l.sizeSqft ? `${l.sizeSqft} sq ft` : ''].filter(Boolean).join(' · '));
  kv('Owner', l.ownerName);
  if (contact) { kv('Owner phone', contact.ownerPhone); kv('Owner email', contact.ownerEmail); }

  heading('Types of service');
  const rt = l.services.rentType;
  kv('Rent type', rt ? `${rentLabel(rt)} rent` : 'Not set');
  kv('Service fee', rt ? `${SERVICE_FEE[rt]}% of the net receivable rental` : '—');
  kv('Services', SERVICES.filter(x => serviceOn(l, x.key)).map(x => x.label).join(', ') || 'None ticked');
  const pkg = packageOf(l.services.maintenance);
  kv('Maintenance package', pkg.price ? `${pkg.label}, ${amt(pkg.price)} a year` : 'None');

  heading('Quotation');
  const parts = quoteParts(l);
  if (!parts.length) { text('Nothing to quote: no renovation, furniture or maintenance package chosen.', M, y, { color: GREY }); y -= 16; }
  for (const [label, value] of parts) amountRow(label, value);
  room(24); rule(y + 8, INK, 0.8);
  amountRow('Quotation total', quoteTotal(l), { b: true, color: BRAND });
  y -= 4;
  amountRow('Final amount', l.payment.amount === '' ? quoteTotal(l) : l.payment.amount, { b: true });
  if (l.payment.amount === '') { text('(no final amount set yet: the quotation total is shown)', M, y + 2, { size: 8, color: GREY }); y -= 12; }

  heading('Payment');
  const p = l.payment;
  kv('Payment type', payTypeLabel(p.type));
  if (isDeposit(l)) {
    kv('Deposit', `${amt(depositOf(l))}${p.deposit.received ? ` · received ${full(p.deposit.receivedAt)}` : ' · not received yet'}`);
    kv('Balance', `${amt(balanceOf(l))}${p.balance.received ? ` · received ${full(p.balance.receivedAt)}` : ' · not received yet'}`);
  } else {
    kv('Status', p.confirmed ? `Received ${full(p.confirmedAt)}` : 'Not received yet');
  }

  return doc.save();
}

export const quoteFileName = l => `Quotation ${l.id} ${safe([l.property, l.unit].filter(Boolean).join(' ')).replace(/[\\/:*?"<>|]+/g, '')}`.trim() + '.pdf';
