// lib/agreements/pdf.js — showing template pages (PDF.js) and filling them in (pdf-lib).
//
// A placed field ("mapping") is a box stored as fractions of its page: x, y, w, h from 0 to 1, measured from the
// top-left corner. The designer draws boxes with the same fractions, so the preview and the finished PDF match
// at any zoom or screen size.  mapping = { id, fieldId, page, x, y, w, h, font, size, color, align, multiline, mark, matchValue }
import { formatValue } from './format.js';
import { dataUrlToBytes } from './bytes.js';

// ---------- Showing pages ----------
let pdfjs = null;
export function loadPdfJs() {
  pdfjs ||= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return pdfjs;
}
// PDF.js takes over the bytes it is given, so it gets a copy.
export async function openPdf(bytes) {
  const lib = await loadPdfJs();
  return lib.getDocument({ data: bytes.slice() }).promise;
}

// Page sizes in PDF points. Rotated pages are refused: their boxes would land in the wrong place.
export async function readPages(bytes) {
  const doc = await openPdf(bytes);
  try {
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      if (page.rotate % 360 !== 0) throw new Error(`Page ${i} is turned sideways inside the file. Open the PDF, save or print it again as a PDF, and upload that copy.`);
      const vp = page.getViewport({ scale: 1 });
      pages.push({ w: Math.round(vp.width * 100) / 100, h: Math.round(vp.height * 100) / 100 });
    }
    return pages;
  } finally { doc.destroy(); }
}

// ---------- Fonts ----------
export const FONTS = {
  Helvetica: { label: 'Helvetica (Arial)', css: 'Helvetica, Arial, sans-serif', std: 'Helvetica' },
  'Helvetica-Bold': { label: 'Helvetica Bold', css: 'Helvetica, Arial, sans-serif', weight: 700, std: 'HelveticaBold' },
  Times: { label: 'Times', css: '"Times New Roman", Times, serif', std: 'TimesRoman' },
  'Times-Bold': { label: 'Times Bold', css: '"Times New Roman", Times, serif', weight: 700, std: 'TimesRomanBold' },
  Courier: { label: 'Courier', css: '"Courier New", Courier, monospace', std: 'Courier' }
};
// The built-in PDF fonts only cover Western letters. For Chinese text put a font file here (see SETUP.md).
export const CJK_FONT_URL = '/fonts/NotoSansSC-Regular.ttf';
// Text sits in its box the same way in the designer (CSS line-height 1.2) and the PDF.
export const LINE = 1.2, BASELINE = 0.95;

const canEncode = (font, s) => { try { font.widthOfTextAtSize(s, 10); return true; } catch (_) { return false; } };

function breakChars(font, line, size, maxW) {
  const out = []; let cur = '';
  for (const ch of line) {
    if (cur && font.widthOfTextAtSize(cur + ch, size) > maxW) { out.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function wrap(font, line, size, maxW) {
  const out = []; let cur = '';
  for (const word of line.split(' ')) {
    const next = cur ? cur + ' ' + word : word;
    if (!cur || font.widthOfTextAtSize(next, size) <= maxW) cur = next;
    else { out.push(cur); cur = word; }
  }
  out.push(cur);
  return out.flatMap(l => (font.widthOfTextAtSize(l, size) <= maxW ? [l] : breakChars(font, l, size, maxW)));
}
// One line: shrinks until it fits the width. Wrapped text: shrinks until all lines fit the height.
function fitText(font, text, size, box, multiline) {
  const paragraphs = String(text).split(/\r?\n/);
  let last;
  for (let s = size; s >= 5; s -= 0.5) {
    const lines = multiline ? paragraphs.flatMap(p => wrap(font, p, s, box.w)) : [paragraphs.join(' ')];
    last = { lines, size: s };
    if (multiline ? lines.length * s * LINE <= box.h + 0.5 : font.widthOfTextAtSize(lines[0], s) <= box.w + 0.5) return { ...last, fits: true };
  }
  return { ...last, fits: false };
}

const hexRgb = hex => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// The text a placed field prints. A "mark" mapping prints e.g. X when the value matches (tick boxes on paper).
export function mappingText(field, value, m) {
  if (m.mark) {
    const s = value === true ? 'true' : String(value ?? '');
    const hit = field.type === 'checkbox' && !m.matchValue ? value === true || value === 'true' : s.trim().toLowerCase() === String(m.matchValue ?? '').trim().toLowerCase();
    return hit ? m.mark : '';
  }
  return formatValue(field, value);
}

// ---------- Filling a template ----------
// values = all values with formulas worked out. loadFile(id) gives { bytes, mime } for uploaded images.
export async function fillPdf({ templateBytes, fields, mappings, values, loadFile }) {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.load(templateBytes);
  const pages = pdf.getPages();
  const byId = new Map(fields.map(f => [f.id, f]));
  const warnings = new Set();
  const std = {};
  let cjk;   // undefined = not tried yet, null = not available

  async function fontFor(name, text) {
    const key = FONTS[name]?.std || 'Helvetica';
    const font = (std[key] ||= await pdf.embedFont(StandardFonts[key]));
    const flat = text.replace(/[\r\n]/g, '');   // line breaks are handled by the layout, not the font
    if (canEncode(font, flat)) return { font, text };
    if (cjk === undefined) cjk = await loadCjk(pdf);
    if (cjk && canEncode(cjk, flat)) return { font: cjk, text };
    warnings.add('Some characters (for example Chinese) can\'t be printed with the built-in fonts and show as "?". See SETUP.md to add a Chinese font.');
    return { font, text: [...text].map(ch => (ch === '\n' || ch === '\r' || canEncode(font, ch) ? ch : '?')).join('') };
  }

  for (const m of mappings) {
    const page = pages[m.page - 1];
    const field = byId.get(m.fieldId);
    if (!page) { warnings.add(`A field is placed on page ${m.page}, but this file has ${pages.length} pages.`); continue; }
    if (!field) { warnings.add('A placed field was deleted from the form, so it was left out.'); continue; }
    const crop = page.getCropBox();
    const r = { x: crop.x + m.x * crop.width, w: m.w * crop.width, h: m.h * crop.height, top: crop.y + crop.height - m.y * crop.height };
    r.y = r.top - r.h;
    const value = values[field.id];
    if (value && typeof value === 'object' && value.error) warnings.add(`${field.label}: ${value.message}`);

    if ((field.type === 'signature' || field.type === 'image') && !m.mark) {
      await drawImage(pdf, page, r, field, value, loadFile, warnings);
      continue;
    }
    const raw = mappingText(field, value, m);
    if (!raw) continue;
    const { font, text } = await fontFor(m.font, raw);
    const fit = fitText(font, text, Number(m.size) || 10, r, !!m.multiline);
    if (!fit.fits) warnings.add(`"${field.label}" is too long for its box on page ${m.page}; make the box bigger.`);
    const [cr, cg, cb] = hexRgb(m.color);
    fit.lines.forEach((line, i) => {
      const tw = font.widthOfTextAtSize(line, fit.size);
      const x = m.align === 'center' ? r.x + (r.w - tw) / 2 : m.align === 'right' ? r.x + r.w - tw : r.x;
      page.drawText(line, { x, y: r.top - fit.size * BASELINE - i * fit.size * LINE, size: fit.size, font, color: rgb(cr, cg, cb) });
    });
  }
  pdf.setProducer('Widebed PMS');
  pdf.setModificationDate(new Date());
  return { bytes: await pdf.save(), warnings: [...warnings] };
}

async function drawImage(pdf, page, r, field, value, loadFile, warnings) {
  let bytes, mime;
  try {
    if (typeof value === 'string' && value.startsWith('data:image/')) { mime = value.slice(5, value.indexOf(';')); bytes = dataUrlToBytes(value); }
    else if (value && value.id) ({ bytes, mime } = await loadFile(value.id));
    else return;
    const img = mime === 'image/png' ? await pdf.embedPng(bytes) : mime === 'image/jpeg' ? await pdf.embedJpg(bytes) : null;
    if (!img) { warnings.add(`${field.label}: only PNG or JPG images can go into a PDF.`); return; }
    const s = Math.min(r.w / img.width, r.h / img.height);
    const w = img.width * s, h = img.height * s;
    page.drawImage(img, { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, width: w, height: h });
  } catch (e) { warnings.add(`${field.label}: the image couldn't be added (${e.message}).`); }
}

async function loadCjk(pdf) {
  try {
    const res = await fetch(CJK_FONT_URL);
    if (!res.ok || (res.headers.get('content-type') || '').includes('text/html')) return null;
    const fontkit = (await import('@pdf-lib/fontkit')).default;
    pdf.registerFontkit(fontkit);
    return await pdf.embedFont(await res.arrayBuffer(), { subset: true });
  } catch (_) { return null; }
}
