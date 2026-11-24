// lib/ezee-cancel.js (24 Nov 2026, Khairul): reads eZee's "Cancelled Reservation" report (Bulk Upload > Cancel bookings).
// eZee only prints it to PDF, as pictures of the pages, so the text comes from OCR (api/drive.js action 'ocr') or, for a PDF
// that holds text, straight from the PDF. OCR text is messy (stray marks, a digit read wrong, columns out of order), so
// nothing here trusts the layout: each reservation number found starts a piece of text, read up to the next number, and
// its other details (folio no., stay dates, booking and cancel dates, source, remark) are picked out of that piece.
// Whether a row may cancel a booking is decided by matchCancellations(): the reservation number must be in the PMS AND
// at least one other detail (folio no., stay dates or guest name) must agree; otherwise the row is only listed to check.

const SOURCES = ['Booking.com', 'Agoda', 'Expedia', 'Traveloka', 'Ctrip', 'Trip.com', 'Tiket.com', 'Airbnb', 'Walk-in', 'Offline', 'Direct'];
const key = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// OCR mixes letters and digits that look alike; only used inside a number's digit part
const digits = s => s.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
// "DMRS39437", "DMRS 39437", "DMRS3943?" (OCR): the letters before RS are the property code
const RES = /(?<![A-Za-z])([A-Z]{2,4})\s?RS\s?([0-9OIlSB]{4,7})(?![0-9])/g;   // OCR may glue a mark on: 'DMRS37483_'
const FOLIO = /(?<![A-Za-z])([A-Z]{2,4})\s?GF\s?([0-9OIlSB]{4,7})(?![0-9])/;

// text -> { rows: [{ resNo, folioNo, bookingDate, arr, dpt, guest, source, cancelledBy, cancelDate, remark, raw }], stated, from, to }
// Dates: bookingDate / cancelDate 'YYYY-MM-DD'; arr / dpt 'DD/MM' (the report prints no year for the stay).
export function parseCancelReport(text) {
  const t = String(text || '').replace(/\r/g, '');
  const hits = [...t.matchAll(RES)];
  const rows = [];
  hits.forEach((m, i) => {
    const piece = t.slice(m.index + m[0].length, i + 1 < hits.length ? hits[i + 1].index : t.length);
    const head = piece.split(/\bRemarks?\b/i)[0];
    const full = (head.match(/\b(\d{1,2})\s?\/\s?(\d{1,2})\s?\/\s?(\d{4})\b/g) || []).map(d => d.replace(/\s/g, '').split('/'))
      .map(([d, mo, y]) => `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`);
    // Stay dates have no year: dd/mm not followed by /yyyy
    const short = [...head.matchAll(/(?<![\d/])(\d{1,2})\s?\/\s?(\d{1,2})(?![\d/]|\s?\/\s?\d)/g)].map(x => `${x[1].padStart(2, '0')}/${x[2].padStart(2, '0')}`)
      .filter(s => { const [d, mo] = s.split('/').map(Number); return d >= 1 && d <= 31 && mo >= 1 && mo <= 12; });
    const folio = head.match(FOLIO);
    const remark = (piece.match(/\bRemarks?\s*[:;.]?\s*([^\n]*)/i) || [])[1] || '';
    const src = SOURCES.find(s => key(head).includes(key(s))) || (/\bOTA\b/.test(head) ? '' : '');
    // Guest name: the words between the booking date and the rate type (Standard / Default / Monthly / ...)
    const g = head.match(/\d{1,2}\s?\/\s?\d{1,2}\s?\/\s?\d{4}\s+(.+?)\s+(Standard|Default|Monthly|Weekly|Daily|Corporate|Promo|Non[- ]?Ref|Room Only|BAR)\b/i);
    const byM = src ? head.match(new RegExp(`${src.replace(/[.]/g, '\\.')}\\W+([A-Za-z][\\w .'-]{1,30}?)\\s+\\d{1,2}\\s?/`, 'i')) : null;
    rows.push({
      resNo: `${m[1]}RS${digits(m[2])}`,
      folioNo: folio ? `${folio[1]}GF${digits(folio[2])}` : '',
      bookingDate: full[0] || '', cancelDate: full.length > 1 ? full[full.length - 1] : '',
      arr: short[0] || '', dpt: short[1] || '',
      guest: g ? g[1].replace(/[^A-Za-z .'-]/g, ' ').replace(/\s+/g, ' ').trim() : '',
      source: src, cancelledBy: byM ? byM[1].trim() : '',
      remark: remark.replace(/\s+/g, ' ').trim().slice(0, 200),
      raw: (m[0] + head).replace(/\s+/g, ' ').trim().slice(0, 300)
    });
  });
  // The same reservation printed twice is two rooms of one booking (two folio numbers): both kept, one row each
  const stated = Number((t.match(/Total\s+Cancell?ed\s+Reservation\D{0,8}(\d{1,4})/i) || [])[1]) || null;
  const range = t.match(/Date\s*From\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*To\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  return { rows, stated, from: range ? range[1] : '', to: range ? range[2] : '' };
}

const ddmm = iso => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
const words = s => key(s).length >= 3 ? String(s).toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 3) : [];

// rows from parseCancelReport, bookings = the PMS's eZee bookings of the property [{ id, reservationNo, folioNo, arrival,
// departure, guestName, status, removedByHand, unitId, unitCode, departureMonth, totalInclTax }], done(b) = its month's
// statement is completed for its unit, today 'YYYY-MM-DD'.
// -> { cancel, check, blocked, nothing } lists of { row, booking, why }
export function matchCancellations(rows, bookings, { done = () => false, today = '' } = {}) {
  const byRes = new Map(), byFolio = new Map();
  for (const b of bookings) {
    if (!byRes.has(b.reservationNo)) byRes.set(b.reservationNo, []);
    byRes.get(b.reservationNo).push(b);
    if (b.folioNo) byFolio.set(b.folioNo, b);
  }
  const out = { cancel: [], check: [], blocked: [], nothing: [] };
  const used = new Set();
  for (const row of rows) {
    let list = byRes.get(row.resNo) || [];
    // A multi-room booking: the folio number picks the room
    if (list.length > 1 && row.folioNo) list = list.filter(b => b.folioNo === row.folioNo).concat(list.filter(b => b.folioNo !== row.folioNo && !used.has(b.id))).slice(0, 1);
    let b = list.find(x => !used.has(x.id)) || list[0] || null;
    let why = '';
    if (!b && row.folioNo && byFolio.get(row.folioNo)) {
      // The number was probably read wrong, but the folio number matches a booking: listed to check, never cancelled on its own
      b = byFolio.get(row.folioNo);
      out.check.push({ row, booking: b, why: `The report reads ${row.resNo}, but its folio no. ${row.folioNo} is booking ${b.reservationNo}. Check it is the same booking.` });
      used.add(b.id); continue;
    }
    if (!b) { out.nothing.push({ row, booking: null, why: 'Not in the PMS' }); continue; }
    used.add(b.id);
    if (b.status === 'cancelled' || b.removedByHand) { out.nothing.push({ row, booking: b, why: b.removedByHand ? 'Already removed by hand on Month-end' : 'Already cancelled in the PMS' }); continue; }
    if (done(b)) { out.blocked.push({ row, booking: b, why: `The ${b.departureMonth} owner statement for ${b.unitCode || 'this unit'} is completed. A Director must reopen it first.` }); continue; }
    // At least one more detail must agree before the number alone is trusted
    const folioOk = row.folioNo && b.folioNo && row.folioNo === b.folioNo;
    const datesOk = row.arr && row.dpt && row.arr === ddmm(b.arrival) && row.dpt === ddmm(b.departure);
    const gw = words(b.guestName), rw = words(row.guest || row.raw);
    const nameOk = gw.length && gw.some(w => rw.includes(w));
    if (!folioOk && !datesOk && !nameOk) why = 'The folio no., dates and guest name could not be matched to this booking (the report may have been read wrong).';
    else if (b.arrival && today && b.arrival <= today) why = b.departure && b.departure <= today ? 'The stay dates have passed.' : 'The guest should already have checked in.';
    (why ? out.check : out.cancel).push({ row, booking: b, why, sure: { folio: !!folioOk, dates: !!datesOk, name: !!nameOk } });
  }
  return out;
}
