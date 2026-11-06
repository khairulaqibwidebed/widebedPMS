// Salary Advance Form PDF (5 Nov 2026). A4, drawn with pdf-lib like the owner statements (lib/statement-pdf.js, same fonts).
// f = advances/{id}/form/main, frozen at approval (pages/HR/advances.js). The staff member signs the printed copy themselves.
import { loadPdfKit } from './statement-pdf.js';

const W = 595.28, H = 841.89, L = 56, R = W - 56;
const COMPANY = 'Widebed Sdn. Bhd.';
const ADDRESS = ['Unit 01-01, First Floor, Micasa Shoppes, 368-A, Jalan Tun Razak', '50400 Kuala Lumpur  ·  Tel : 03-2181 3455'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const money = v => 'RM ' + (Math.round((Number(v) || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateText = iso => (iso ? `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : '');
const tsText = t => { const d = t?.toDate ? t.toDate() : null; return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : ''; };

// staffSig = advances/{id}/signed/main when the staff member signed on screen (method 'drawn'): printed in their box.
export async function buildAdvancePdf(f, staffSig = null) {
  const { lib, fontkit, fonts: bytes } = await loadPdfKit();
  const pdf = await lib.PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const reg = await pdf.embedFont(bytes.regular, { subset: true }), bold = await pdf.embedFont(bytes.bold, { subset: true });
  pdf.setTitle(`Salary Advance Form ${f.ref}`); pdf.setAuthor('Widebed PMS'); pdf.setCreator('Widebed PMS'); pdf.setProducer('Widebed PMS');
  const page = pdf.addPage([W, H]);
  const black = lib.rgb(0, 0, 0), grey = lib.rgb(0.4, 0.4, 0.4), line = lib.rgb(0.75, 0.75, 0.75);
  const width = (s, size, b) => (b ? bold : reg).widthOfTextAtSize(String(s), size);
  // y from the top of the page, text by its baseline
  const text = (s, x, y, { size = 10.5, b = false, align = 'left', color = black } = {}) => {
    s = String(s ?? ''); if (!s) return;
    const w = width(s, size, b), x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    page.drawText(s, { x: x0, y: H - y, size, font: b ? bold : reg, color });
  };
  const rule = (y, x0 = L, x1 = R, t = 0.6, color = line) => page.drawRectangle({ x: x0, y: H - y - t / 2, width: x1 - x0, height: t, color });
  const wrap = (s, w, size) => {
    const out = [];
    for (const para of String(s || '').split(/\n/)) {
      let cur = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = cur ? `${cur} ${word}` : word;
        if (cur && width(next, size) > w) { out.push(cur); cur = word; } else cur = next;
      }
      out.push(cur);
    }
    return out;
  };

  // Letterhead
  let y = 64;
  text(COMPANY, W / 2, y, { size: 16, b: true, align: 'center' });
  ADDRESS.forEach((a, i) => text(a, W / 2, y + 16 + i * 13, { size: 9.5, align: 'center', color: grey }));
  y += 50; rule(y, L, R, 1.2, black);
  y += 30; text('SALARY ADVANCE FORM', W / 2, y, { size: 14, b: true, align: 'center' });
  y += 22; text(`Ref: ${f.ref}`, L, y, { size: 10 }); text(`Date: ${dateText(f.approvedDate)}`, R, y, { size: 10, align: 'right' });

  // Label / value rows in a section
  const KX = L + 10, VX = L + 170;
  const section = (title, rows) => {
    y += 28; text(title, L, y, { size: 11, b: true }); y += 6; rule(y);
    for (const [k, v] of rows) {
      const lines = wrap(v || '—', R - VX, 10.5);
      y += 18; text(k, KX, y, { color: grey });
      lines.forEach((ln, i) => text(ln, VX, y + i * 14));
      y += (lines.length - 1) * 14;
    }
  };
  section('Staff details', [['Name', f.name], ['IC number', f.ic], ['Department', f.position], ['Monthly salary', money(f.salary)]]);
  section('Advance', f.byHR ? [
    ['Total', money(f.approvedAmount)],
    ['Limit (50% of salary)', money(f.limit)],
    ['Reason', f.reason]
  ] : [
    ['Amount requested', money(f.amount)],
    ['Amount approved', money(f.approvedAmount)],
    ['Limit (50% of salary)', money(f.limit)],
    ['Requested on', tsText(f.requestDate)],
    ['Reason', f.reason]
  ]);
  if (f.description) section('Description', [['', f.description]]);
  if (f.formNote) section('Notes from HR', [['', f.formNote]]);

  // Approval: the Director's saved signature, her name and the approval date under it
  y += 34; text('Approved by', L, y, { size: 11, b: true });
  text('Received and agreed by staff', W / 2 + 20, y, { size: 11, b: true });
  const sigTop = y + 10, sigH = 60;
  const putSig = async (dataUrl, x) => {
    try {
      const img = await pdf.embedJpg(dataUrl);
      const k = Math.min(180 / img.width, sigH / img.height);
      page.drawImage(img, { x, y: H - sigTop - img.height * k, width: img.width * k, height: img.height * k });
    } catch (e) { console.warn('Signature image not added:', e); }
  };
  if (f.signature) await putSig(f.signature, L);
  const staffDrawn = staffSig?.method === 'drawn' && staffSig.image;
  if (staffDrawn) await putSig(staffSig.image, W / 2 + 20);
  y = sigTop + sigH + 8;
  rule(y, L, L + 200, 0.8, black); rule(y, W / 2 + 20, R, 0.8, black);
  y += 15; text(f.signerName || '', L, y, { b: true }); text(f.name || '', W / 2 + 20, y, { b: true });
  y += 14; text('Director', L, y, { color: grey }); text(`IC: ${f.ic || ''}`, W / 2 + 20, y, { color: grey });
  y += 14; text(`Approved on ${dateText(f.approvedDate)}`, L, y, { color: grey });
  text(staffDrawn ? `Signed in the PMS on ${tsText(staffSig.at)}` : 'Date:', W / 2 + 20, y, { color: grey });

  y += 34;
  wrap('I agree that this advance will be deducted from my salary as set out in the Advance SOP.', R - L, 9.5)
    .forEach((ln, i) => text(ln, L, y + i * 12, { size: 9.5, color: grey }));
  text(`Prepared by HR: ${f.preparedByName || ''}  ·  Made in the Widebed PMS`, L, H - 40, { size: 8.5, color: grey });
  return pdf.save();
}

export const advanceFileName = f => `Salary Advance ${f.ref} ${String(f.name || '').replace(/[\\/:*?"<>|]+/g, '').trim()}.pdf`;
