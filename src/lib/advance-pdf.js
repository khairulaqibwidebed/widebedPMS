// Salary Advance Form PDF. Since 11 Nov 2026 it is HR's own "Advance Request Form" (Docs/Advance Form.docx, saved once
// as PDF with Word into public/templates/advance-form.pdf). The PMS writes the details onto its blank lines with pdf-lib,
// filled the way HR fills it by hand (their example, 15 Oct 2026): plain black text, names in capitals on the lines,
// and the "For Human Resources use only" part filled too, with HR's "Amount of deduction" text in the box.
// If HR changes the Word file: save it as PDF over that file, then check the positions in AT below still sit on the lines.
// f = advances/{id}/form/main, frozen when HR reviews (pages/HR/advances.js).
import { loadPdfKit } from './statement-pdf.js';

const TEMPLATE_URL = '/templates/advance-form.pdf';
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const money = v => 'RM ' + (Math.round((Number(v) || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toDate = v => (v?.toDate ? v.toDate() : v instanceof Date ? v : typeof v === 'string' && v ? new Date(`${v.slice(0, 10)}T00:00:00`) : null);
const longDate = v => { const d = toDate(v); return d ? `${d.getDate()} ${FULL_MONTHS[d.getMonth()]} ${d.getFullYear()}` : ''; };      // 15 October 2026
const shortDate = v => { const d = toDate(v); return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : ''; }; // 15/10/2026
const caps = s => String(s || '').trim().toUpperCase();

// Where things go on the template (US Letter, 612 x 792 pt, y from the BOTTOM as in PDF). Measured from the PDF;
// x0/x1 = the underscores of each line, y = the label's baseline.
const AT = {
  valueX: 130,                                   // after the "DATE :" / "NAME :" colons
  date: 646.8, name: 626.6, dept: 606.6, ic: 586.4,
  reason: { x: 52, w: 494, lines: [533.4, 513.2, 493.0] },
  amount: { x: 198, y: 453.6 },
  submitted: { x0: 121, x1: 237, y: 423.7, dateX: 451 },
  approved: { x0: 122, x1: 239, y: 403.5, dateX: 451 },
  received: { x: 130, y: 318.9 },
  records: { x: 131, w: 185, y: 298.7, dateX: 456 },
  deduction: { x: 72, w: 466, top: 224, bottom: 136, size: 10 },
  by: { x: 81, w: 200, y: 121.7, dateX: 467 },
  ref: { x: 50, y: 38.5 }
};

let tpl = null;
async function loadTemplate() {
  tpl ||= fetch(TEMPLATE_URL).then(async res => {
    const bytes = new Uint8Array(await res.arrayBuffer());
    // A missing file comes back as the app's page, not a PDF
    if (!res.ok || String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') throw new Error('The Advance Request Form template is missing. Restart the app and try again.');
    return bytes;
  }).catch(e => { tpl = null; throw e; });
  return tpl;
}

// staffSig = advances/{id}/signed/main when the staff member signed on screen (method 'drawn'): printed on "Submitted by".
export async function buildAdvancePdf(f, staffSig = null) {
  const [{ lib, fontkit, fonts: bytes }, tplBytes] = await Promise.all([loadPdfKit(), loadTemplate()]);
  const pdf = await lib.PDFDocument.load(tplBytes);
  pdf.registerFontkit(fontkit);
  const reg = await pdf.embedFont(bytes.regular, { subset: true });
  pdf.setTitle(`Advance Request Form ${f.ref}`); pdf.setAuthor('Widebed PMS'); pdf.setCreator('Widebed PMS'); pdf.setProducer('Widebed PMS');
  const page = pdf.getPage(0);
  const black = lib.rgb(0, 0, 0), grey = lib.rgb(0.45, 0.45, 0.45);
  const width = (s, size) => reg.widthOfTextAtSize(String(s), size);
  const text = (s, x, y, { size = 10.5, color = black } = {}) => {
    s = String(s ?? ''); if (!s) return;
    page.drawText(s, { x, y, size, font: reg, color });
  };
  // One line that must fit a width: shrinks, never below 7 pt
  // Returns where the text ends (x), so a signature can start after it
  const fitText = (s, x, y, w, size = 10.5) => { s = String(s ?? ''); while (size > 7 && width(s, size) > w) size -= 0.5; text(s, x, y, { size }); return x + (s ? width(s, size) : 0); };
  const wrap = (s, w, size) => {
    const out = [];
    for (const para of String(s || '').split(/\n/)) {
      // Keeps a line's indent, and lines a wrapped list item up under its text ("    1. long text" -> "       more")
      const ind = para.match(/^[ \t]*/)[0].replace(/\t/g, '    '), num = para.trim().match(/^\d+\.\s+/)?.[0] || '';
      const hang = ind + ' '.repeat(num.length + 1);
      let cur = '', first = true;
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const lead = first ? ind : hang, next = cur ? `${cur} ${word}` : word;
        if (cur && width(lead + next, size) > w) { out.push(lead + cur); cur = word; first = false; } else cur = next;
      }
      out.push(cur ? (first ? ind : hang) + cur : '');
    }
    while (out.length && !out[out.length - 1]) out.pop();
    return out;
  };

  const received = f.requestDate || f.approvedDate;   // HR-made forms have no request date

  // Details
  text(longDate(f.approvedDate), AT.valueX, AT.date);
  fitText(f.name, AT.valueX, AT.name, 400);
  fitText(f.position, AT.valueX, AT.dept, 400);
  text(f.ic, AT.valueX, AT.ic);

  // Reason on the three lines; a long reason gets a smaller size until it fits
  let size = 10, lines = wrap(f.reason, AT.reason.w, size);
  while (lines.length > 3 && size > 7) { size -= 0.5; lines = wrap(f.reason, AT.reason.w, size); }
  if (lines.length > 3) lines = [...lines.slice(0, 2), `${lines.slice(2).join(' ').slice(0, 120)}…`];
  lines.slice(0, 3).forEach((ln, i) => text(ln, AT.reason.x, AT.reason.lines[i] + 2.5, { size }));

  text(money(f.approvedAmount ?? f.amount), AT.amount.x, AT.amount.y);

  // Signatures go to the right of the typed name (they may run past the line; the DATE column starts at ~419 pt),
  // kept low so they don't run into the row above
  const SIG_END = 405;
  const putSig = async (dataUrl, x, y, maxH) => {
    try {
      const img = /^data:image\/png/i.test(dataUrl) ? await pdf.embedPng(dataUrl) : await pdf.embedJpg(dataUrl);
      const k = Math.min((SIG_END - x) / img.width, maxH / img.height);
      // Multiply: a signature's white background drops out
      page.drawImage(img, { x, y: y - 2, width: img.width * k, height: img.height * k, blendMode: lib.BlendMode.Multiply });
    } catch (e) { console.warn('Signature image not added:', e); }
  };
  const staffDrawn = staffSig?.method === 'drawn' && staffSig.image;
  const nameEnd = fitText(caps(f.name), AT.submitted.x0 + 1, AT.submitted.y + 1.5, AT.submitted.x1 - AT.submitted.x0 - 2, 10);
  if (staffDrawn) await putSig(staffSig.image, nameEnd + 12, AT.submitted.y, 26);
  text(shortDate(staffDrawn ? staffSig.at : received), AT.submitted.dateX, AT.submitted.y + 1.5, { size: 10 });
  const signerEnd = fitText(caps(f.signerName), AT.approved.x0 + 1, AT.approved.y + 1.5, AT.approved.x1 - AT.approved.x0 - 2, 10);
  if (f.signature) await putSig(f.signature, signerEnd + 12, AT.approved.y, 18);
  text(shortDate(f.approvedDate), AT.approved.dateX, AT.approved.y + 1.5, { size: 10 });

  // For Human Resources use only: received, the HR person who prepared the form, HR's deduction text, "HR Department"
  text(shortDate(received), AT.received.x, AT.received.y + 1.5, { size: 10 });
  if (f.preparedByName) fitText(`HR ${caps(f.preparedByName)}`, AT.records.x, AT.records.y + 1.5, AT.records.w, 10);
  text(shortDate(f.approvedDate), AT.records.dateX, AT.records.y + 1.5, { size: 10 });
  const note = f.formNote || f.description || '';
  if (note) {
    const room = AT.deduction.top - AT.deduction.bottom;
    let ds = AT.deduction.size, dl = wrap(note, AT.deduction.w, ds);
    while (dl.length * ds * 1.4 > room && ds > 7) { ds -= 0.5; dl = wrap(note, AT.deduction.w, ds); }
    const max = Math.floor(room / (ds * 1.4));
    if (dl.length > max) dl = [...dl.slice(0, max - 1), `${dl.slice(max - 1).join(' ').slice(0, 100)}…`];
    dl.forEach((ln, i) => text(ln, AT.deduction.x, AT.deduction.top - i * ds * 1.4, { size: ds }));
  }
  text('HR DEPARTMENT', AT.by.x, AT.by.y + 1.5, { size: 10 });
  text(shortDate(f.approvedDate), AT.by.dateX, AT.by.y + 1.5, { size: 10 });

  // Small reference in the footer, so a printed copy can be matched to the PMS record
  text(`Ref ${f.ref}  ·  Made in the Widebed PMS`, AT.ref.x, AT.ref.y, { size: 7.5, color: grey });
  return pdf.save();
}

export const advanceFileName = f => `Advance Request Form ${f.ref} ${String(f.name || '').replace(/[\\/:*?"<>|]+/g, '').trim()}.pdf`;
