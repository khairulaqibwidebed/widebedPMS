// lib/ezee-files.js (25 Nov 2026): the other file types for Bulk Upload > New bookings (eZee) and Cancel bookings (eZee).
//   - New bookings as PDF (eZee's Reservation report printed / saved as PDF). The PDF's text is laid out in lines by position.
//     If the lines carry the same column headings as the Excel export, readEzee() reads them as a sheet. Otherwise each
//     reservation no. found starts a booking and its room, stay dates, source, guest and total are picked out of its text.
//     A PDF has no revenue breakdown, so its bookings carry the total only (allRoomCharges = total, fromPdf: true); the
//     next Excel / CSV upload of the same month (Upload eZee report) writes the full figures over it.
//   - Cancellations as Excel / CSV (eZee's Cancelled Reservation report exported). Columns are found by their headings;
//     a sheet without recognisable headings is read as text, the same way as the PDF.
import { readEzee, isoDate, unitCodeOf, otaKeyOf } from '@/lib/engine.js';
import { parseCancelReport, SOURCES } from '@/lib/ezee-cancel.js';

const RES = /(?<![A-Za-z])([A-Z]{2,4})\s?RS\s?(\d{4,7})(?![0-9])/;
const RES_G = new RegExp(RES.source, 'g');
const FOLIO = /(?<![A-Za-z])([A-Z]{2,4})\s?GF\s?(\d{4,7})(?![0-9])/;
const DATE_G = /\b(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\b/g;
const ROOM_G = /\b[A-Z]{2,4} \d{2}-\d{2}[A-Z]?(?:-\d+)?(?:-[^\s,]+)?/g;
const MONEY_G = /(?<![\d/.-])\d{1,3}(?:,\d{3})*\.\d{2}(?![\d/])/g;
const key = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// A PDF's text as lines (top to bottom), each a list of { x, str } (left to right). lib = pdf.js (loadPdfJs()).
export async function pdfLines(lib, data) {
  const pdf = await lib.getDocument({ data }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const items = (await (await pdf.getPage(i)).getTextContent()).items.filter(it => String(it.str || '').trim());
    const rows = [];
    for (const it of items) {
      const y = it.transform?.[5] ?? 0, x = it.transform?.[4] ?? 0;
      let row = rows.find(r => Math.abs(r.y - y) <= 3);
      if (!row) { row = { y, cells: [] }; rows.push(row); }
      row.cells.push({ x, w: it.width || 0, str: String(it.str).trim() });
    }
    rows.sort((a, b) => b.y - a.y).forEach(r => out.push(r.cells.sort((a, b) => a.x - b.x)));
  }
  return out;
}
const lineText = cells => cells.map(c => c.str).join(' ').replace(/\s+/g, ' ').trim();

// ---------- New bookings from a PDF ----------
// lines: from pdfLines(). Returns readEzee's { header, records }.
export function readEzeePdf(lines) {
  // 1. Laid out like the export: cells split where there is a gap, then read as a sheet
  try {
    const rows = lines.map(cells => {
      const out = []; let cur = null;
      for (const c of cells) {
        if (cur && c.x - (cur.x + cur.w) < 6) { cur.str += ' ' + c.str; cur.w = c.x + c.w - cur.x; } else { cur = { ...c }; out.push(cur); }
      }
      return out.map(c => c.str);
    });
    const res = readEzee(rows);
    if (res.records.length) return res;
  } catch { /* not the export's headings: read the text below */ }
  // 2. One booking per reservation no.: its text runs to the next reservation no.
  const text = lines.map(lineText).join('\n');
  const hits = [...text.matchAll(RES_G)];
  const records = [];
  const seen = new Set();
  hits.forEach((m, i) => {
    const resNo = `${m[1]}RS${m[2]}`;
    const piece = text.slice(m.index + m[0].length, i + 1 < hits.length ? hits[i + 1].index : text.length).replace(/\s+/g, ' ');
    const folio = (piece.match(FOLIO) || [])[0]?.replace(/\s/g, '') || '';
    if (seen.has(resNo + folio)) return;
    seen.add(resNo + folio);
    const dates = [...piece.matchAll(DATE_G)].map(d => isoDate(d[1])).filter(Boolean);
    // The stay is the last pair of dates where check-out comes after check-in (a booking date may come first)
    let arrival = '', departure = '';
    for (let j = dates.length - 2; j >= 0; j--) if (dates[j + 1] > dates[j]) { arrival = dates[j]; departure = dates[j + 1]; break; }
    const roomRaw = (piece.match(ROOM_G) || [])[0] || '';
    const code = unitCodeOf(roomRaw);
    const source = SOURCES.find(s => key(piece).includes(key(s))) || '';
    const money = [...piece.matchAll(MONEY_G)].map(x => Number(x[0].replace(/,/g, '')));
    const total = money.length ? money[money.length - 1] : 0;
    const nights = arrival && departure ? Math.round((Date.parse(departure) - Date.parse(arrival)) / 864e5) : 0;
    // Guest: the longest run of plain words left once the numbers, dates, room and source are taken out
    const rest = piece.replace(FOLIO, ' ').replace(DATE_G, ' ').replace(ROOM_G, ' ').replace(MONEY_G, ' ')
      .replace(new RegExp(SOURCES.map(s => s.replace(/[.]/g, '\\.')).join('|'), 'gi'), ' ')
      .replace(/\b(\d+\s*)?(Bed(room)?s?|Suites?|Studios?|Rooms?|Apartments?|King|Queen|Deluxe|Superior|Premier|Family|Twin|Double|Single|Executive|Loft|Duplex|Penthouse|Type\s+[A-Z])\b/gi, ' ');
    const runs = rest.split(/[^A-Za-z .'-]+/).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length >= 3 && !/^(Standard|Default|Monthly|Weekly|Daily|Room|Rate|Total|Nights?)\b/i.test(s));
    const guestName = runs.sort((a, b) => b.length - a.length)[0] || '';
    const rec = {
      reservationNo: resNo, folioNo: folio, invoiceNo: '', source, otaKey: otaKeyOf(source), rateType: '',
      arrival: arrival || null, departure: departure || null, departureMonth: departure ? departure.slice(0, 7) : null, nights, roomRaw,
      ...(code && code.building ? { building: code.building } : {}),
      propertyCode: code ? code.property : m[1], unitCode: code ? code.unit : null,
      status: code ? 'active' : 'cancelled',
      private: { guestName: guestName || null }, raw: {}, fromPdf: true
    };
    for (const k of ['allRoomCharges', 'sst', 'cleaningFee', 'earlyCheckIn', 'roomUpgrade', 'tourismTax', 'securityDeposit', 'otherCharges', 'discount', 'totalInclTax', 'commission', 'otherPaymentMethod']) rec[k] = 0;
    rec.allRoomCharges = total; rec.totalInclTax = total;
    records.push(rec);
  });
  if (!records.length) throw new Error('No reservation numbers (like DMRS39539) could be read from this PDF. Export the Reservation report from eZee as Excel or CSV instead.');
  return { header: [], records };
}

// ---------- Cancellations from Excel / CSV ----------
const COLS = {
  resNo: /^(res(ervation)?\.?\s*(no|number|#)|reservation)$/i,
  folioNo: /folio/i,
  bookingDate: /^(booking|reservation|res\.?)\s*date|booked\s*on/i,
  arr: /^arr(ival)?\.?(\s*date)?$|check\s*-?in/i,
  dpt: /^dep(t|arture)?\.?(\s*date)?$|check\s*-?out/i,
  guest: /guest/i,
  source: /source/i,
  cancelledBy: /cancel(l)?ed\s*by|^user$/i,
  cancelDate: /cancel(l)?(ed|ation)?\s*(date|on)/i,
  remark: /remark|reason/i
};
const ddmm = iso => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
// rows: the sheet as text cells (sheetText / parseCSV). Returns parseCancelReport's { rows, stated, from, to }.
export function readCancelSheet(rows) {
  const h = rows.slice(0, 30).findIndex(r => r.some(c => COLS.resNo.test(String(c || '').trim())));
  if (h >= 0) {
    const header = rows[h].map(c => String(c || '').trim()), idx = {};
    for (const [k, re] of Object.entries(COLS)) { const i = header.findIndex(c => c && re.test(c)); if (i >= 0) idx[k] = i; }
    if (idx.cancelDate !== undefined && idx.bookingDate === idx.cancelDate) delete idx.bookingDate;
    const get = (r, k) => (idx[k] === undefined ? '' : String(r[idx[k]] ?? '').trim());
    const out = [];
    for (const r of rows.slice(h + 1)) {
      const m = RES.exec(get(r, 'resNo').toUpperCase());
      if (!m) continue;
      const f = FOLIO.exec(get(r, 'folioNo').toUpperCase());
      out.push({ resNo: `${m[1]}RS${m[2]}`, folioNo: f ? `${f[1]}GF${f[2]}` : '', bookingDate: isoDate(get(r, 'bookingDate')) || '',
        cancelDate: isoDate(get(r, 'cancelDate')) || '', arr: ddmm(isoDate(get(r, 'arr'))), dpt: ddmm(isoDate(get(r, 'dpt'))),
        guest: get(r, 'guest').replace(/\s+/g, ' ').slice(0, 120), source: get(r, 'source'), cancelledBy: get(r, 'cancelledBy'),
        remark: get(r, 'remark').replace(/\s+/g, ' ').slice(0, 200), raw: r.join(' ').replace(/\s+/g, ' ').trim().slice(0, 300) });
    }
    if (out.length) {
      const ds = out.map(x => x.cancelDate).filter(Boolean).sort(), dmy = iso => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
      return { rows: out, stated: null, from: dmy(ds[0]), to: dmy(ds[ds.length - 1]) };
    }
  }
  // No headings found: the sheet's text, read like the printed report
  return parseCancelReport(rows.map(r => r.join('  ')).join('\n'));
}
