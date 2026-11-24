// lib/ezee-bulk.js (24 Nov 2026, Khairul): Bulk Upload > New bookings (eZee). Sorts every row of an eZee Reservation report
// into what will happen to it, before anything is saved, so no booking is added twice and no room is booked twice:
//   ready      new, and the room is free for those nights
//   same       already in the PMS with the same room, dates and total (skipped)
//   changed    already in the PMS, but the room, dates, nights or total differ (default: update; old values to the audit log)
//   clash      the room is already booked for some of those nights (another eZee booking, an offline booking, or another
//              row of this file), or the reservation is already in the PMS as an offline booking (default: skip)
//   cancelled  already in the PMS but cancelled there (default: skip; "Add again" brings it back as eZee has it now).
//              A booking removed by hand on Month-end goes to cant (Month-end decides it, not an upload)
//   cant       can't be added: no room number, 0 nights or RM 0, a room not in Portfolio, or its month's statement completed
//   other      a row of another property (left out)
//   fill       already in the PMS (as an eZee booking with nothing different, or as an offline booking with the same
//              reservation no.) but some of its details are blank there and the file has them (default: fill in; only the
//              blank details are written, nothing already in the PMS is changed)
// Every month in the file is read (the Upload eZee report page reads one month).
import { unitIdOf, byUnit, DM_STARTER } from '@/lib/engine.js';

const overlap = (a1, d1, a2, d2) => !!(a1 && d1 && a2 && d2 && a1 < d2 && a2 < d1);
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const blank = v => v === undefined || v === null || v === '' || v === 0;
const has = v => !blank(v);

// What else holds this room on any of r's nights: saved eZee bookings, offline bookings (the same reservation no. counts
// whatever the room), and rows of this file already accepted. Used when sorting, and again after a clash row is edited.
export function clashesFor(r, { existing = [], offline = [], fileStays = [] }) {
  const others = existing.filter(b => b.id !== r.docId && b.reservationNo !== r.reservationNo && b.status !== 'cancelled' && !b.removedByHand
    && b.unitId === r.unitId && overlap(r.arrival, r.departure, b.arrival, b.departure))
    .map(b => ({ kind: 'eZee', ref: b.reservationNo, id: b.id, guest: b.guestName || '', unitCode: b.unitCode || '', arrival: b.arrival, departure: b.departure, nights: b.nights, total: b.totalInclTax, source: b.source || '' }));
  for (const o of offline) {
    if (o.status === 'cancelled') continue;
    const same = !!o.ezeeReservationNo && o.ezeeReservationNo === r.reservationNo;
    if (same || (o.unitId === r.unitId && overlap(r.arrival, r.departure, o.arrival, o.departure)))
      others.push({ kind: 'offline', ref: o.bookingNo || o.id, id: o.id, guest: o.guest || '', unitCode: o.unitCode || '', arrival: o.arrival, departure: o.departure, nights: o.nights, total: null, source: o.bookingSource || 'Offline', same });
  }
  for (const f of fileStays) if (f.docId !== r.docId && f.unitId === r.unitId && f.reservationNo !== r.reservationNo && overlap(r.arrival, r.departure, f.arrival, f.departure))
    others.push({ kind: 'file', ref: f.reservationNo, id: f.docId, guest: f.guest, unitCode: f.unitCode, arrival: f.arrival, departure: f.departure, nights: f.nights, total: f.totalInclTax, source: f.source });
  return others;
}

// Details blank in the PMS that the file has. Each: { label, from, to, doc: {...}, priv: {...} } (what is written)
function fillsEzee(ex, r, guest) {
  const out = [], add = (label, to, doc, priv) => out.push({ label, from: '', to, doc: doc || {}, priv: priv || {} });
  if (blank(ex.unitId) && has(r.unitId)) add('Room', r.unitCode, { unitId: r.unitId, unitCode: r.unitCode });
  if (blank(ex.arrival) && has(r.arrival)) add('Check-in', r.arrival, { arrival: r.arrival });
  if (blank(ex.departure) && has(r.departure)) add('Check-out', r.departure, { departure: r.departure, departureMonth: r.departureMonth });
  if (blank(ex.nights) && has(r.nights)) add('Nights', r.nights, { nights: r.nights });
  if (blank(ex.totalInclTax) && has(r.totalInclTax)) add('Total (RM)', r2(r.totalInclTax).toFixed(2), { totalInclTax: r.totalInclTax });
  for (const [k, label] of [['folioNo', 'Folio no.'], ['invoiceNo', 'Invoice no.'], ['source', 'Source'], ['rateType', 'Rate type']])
    if (blank(ex[k]) && has(r[k])) add(label, r[k], { [k]: r[k] });
  if (ex.guestName === '' && has(guest)) add('Guest name', guest, null, { guestName: guest });   // '' = read and empty (undefined = not allowed to read)
  return out;
}
function fillsOffline(o, r, guest) {
  const out = [], add = (label, to, doc, priv) => out.push({ label, from: '', to, doc: doc || {}, priv: priv || {} });
  if (blank(o.unitId) && has(r.unitId)) add('Room', r.unitCode, { unitId: r.unitId, unitCode: r.unitCode });
  if (blank(o.arrival) && has(r.arrival)) add('Check-in', r.arrival, { arrival: r.arrival });
  if (blank(o.departure) && has(r.departure)) add('Check-out', r.departure, { departure: r.departure });
  if (blank(o.nights) && has(r.nights)) add('Nights', r.nights, { nights: r.nights });
  if (blank(o.bookingSource) && has(r.source)) add('Source', r.source, { bookingSource: r.source });
  if (o.guest === '' && has(guest)) add('Guest name', guest, null, { name: guest });
  return out;
}

// recs: readEzee records. ctx: { property: { id, code }, units: [{ id, unitCode, aliases }], existing: [{ id, ...booking }]
// (this property's saved eZee bookings: every one with a reservation number in the file, and every active one whose stay
// is in the file's months), offline: [{ id, bookingNo, unitId, unitCode, arrival, departure, status, ezeeReservationNo }],
// done(unitId, month) -> true when that unit's owner statement for the month is completed or waiting for a Director }
export function classifyNew(recs, ctx) {
  const { property, units = [], existing = [], offline = [], done = () => false } = ctx;
  const out = { ready: [], same: [], changed: [], clash: [], fill: [], cancelled: [], cant: [], other: [] };
  const unitFor = code => {
    const u = units.find(x => x.unitCode === code || (x.aliases || []).includes(code));
    if (u) return u;
    if (property.code === 'DM') for (const [main, al] of Object.entries(DM_STARTER.aliases)) if (al.includes(code)) return units.find(x => x.unitCode === main) || null;
    return null;
  };
  const byId = new Map(existing.map(b => [b.id, b]));
  const perRes = {};
  recs.forEach(r => { perRes[r.reservationNo] = (perRes[r.reservationNo] || 0) + 1; });
  const fileStays = [];   // new rows already accepted, for clashes inside the file
  const sorted = [...recs].sort((a, b) => (a.arrival || '').localeCompare(b.arrival || '') || a.reservationNo.localeCompare(b.reservationNo));
  for (const src of sorted) {
    const r = { ...src };
    r.docId = perRes[r.reservationNo] > 1 && r.folioNo ? `${r.reservationNo}-${r.folioNo}` : r.reservationNo;
    r.propertyId = property.id;
    const item = { r, guest: r.private?.guestName || '', why: '', with: [], diffs: [], fills: [] };
    if (r.propertyCode && r.propertyCode !== property.code && !r.building) { item.why = `Room ${r.roomRaw || r.unitCode} is not in ${property.name || property.code}`; out.other.push(item); continue; }
    if (r.status !== 'active' || !r.unitCode) { item.why = 'No room number in eZee (cancelled or not given a room)'; out.cant.push(item); continue; }
    if (!(r.nights > 0) || !(Number(r.totalInclTax) > 0)) { item.why = `${r.nights || 0} nights and RM ${r2(r.totalInclTax).toFixed(2)}: looks like a void row`; out.cant.push(item); continue; }
    const u = unitFor(r.unitCode);
    if (!u) { item.why = `${r.unitCode} is not a unit in Portfolio yet. Add it there first (or use Upload eZee report, which adds new units).`; out.cant.push(item); continue; }
    r.unitCode = u.unitCode; r.unitId = u.id || unitIdOf(property.id, u.unitCode);
    if (done(r.unitId, r.departureMonth)) { item.why = `The ${r.departureMonth} owner statement for ${r.unitCode} is completed (or waiting for a Director). A Director must reopen it first.`; out.cant.push(item); continue; }
    const ex = byId.get(r.docId) || (perRes[r.reservationNo] > 1 ? null : null);
    r.isNew = !ex;
    item.existing = ex || null;
    // What else holds this room on any of these nights
    const others = clashesFor(r, { existing, offline, fileStays });
    item.with = others;
    if (ex) {
      if (ex.removedByHand) { item.why = 'Removed by hand on Month-end. Undo it there to bring it back.'; out.cant.push(item); continue; }
      if (ex.status === 'cancelled') {
        item.why = ex.cancel?.file ? `Cancelled in the PMS on ${String(ex.cancel.date || '').slice(0, 10) || 'an upload'} (${ex.cancel.file})` : 'Cancelled in the PMS';
        item.choice = 'skip'; out.cancelled.push(item); continue;
      }
      const pairs = [['Room', ex.unitCode, r.unitCode], ['Check-in', ex.arrival, r.arrival], ['Check-out', ex.departure, r.departure],
        ['Nights', ex.nights, r.nights], ['Total (RM)', r2(ex.totalInclTax).toFixed(2), r2(r.totalInclTax).toFixed(2)]];
      // A detail blank in the PMS is filled in, not shown as a change
      item.diffs = pairs.filter(([, a, b]) => has(a) && String(a ?? '') !== String(b ?? '')).map(([field, from, to]) => ({ field, from, to }));
      // A room moved by hand on Month-end keeps its room (the save leaves it): not a difference to show
      if (ex.movedByHand) item.diffs = item.diffs.filter(d => d.field !== 'Room');
      if (!item.diffs.length) {
        item.fills = fillsEzee(ex, r, item.guest);
        if (item.fills.length) { item.target = { kind: 'eZee', id: ex.id, ref: ex.reservationNo }; item.choice = 'fill'; item.why = 'Some details are blank in the PMS'; out.fill.push(item); }
        else out.same.push(item);
        continue;
      }
      item.choice = others.length ? 'keep' : 'update';
      out.changed.push(item); fileStays.push({ ...r, guest: item.guest }); continue;
    }
    // Already in the PMS as an offline booking with this reservation no.: never added again, but its blank details can be filled in
    const sameOff = offline.find(o => o.status !== 'cancelled' && o.ezeeReservationNo && o.ezeeReservationNo === r.reservationNo);
    if (sameOff) {
      item.fills = fillsOffline(sameOff, r, item.guest);
      item.existing = sameOff;
      if (item.fills.length && others.every(o => o.same)) {
        item.target = { kind: 'offline', id: sameOff.id, ref: sameOff.bookingNo || sameOff.id }; item.choice = 'fill'; item.why = `Offline booking ${sameOff.bookingNo || sameOff.id} has blank details`;
        out.fill.push(item); continue;
      }
      // Nothing blank, same room and dates: it is the same booking, already in the system as an offline booking
      if (others.every(o => o.same) && sameOff.unitId === r.unitId && sameOff.arrival === r.arrival && sameOff.departure === r.departure) {
        item.why = `Already in the system as offline booking ${sameOff.bookingNo || sameOff.id}`; out.same.push(item); continue;
      }
    }
    if (others.length) { item.choice = 'skip'; item.why = others.some(o => o.same) ? 'Already in the PMS as an offline booking' : 'The room is already booked for some of these nights'; out.clash.push(item); continue; }
    out.ready.push(item); fileStays.push({ ...r, guest: item.guest });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => byUnit(a.r.unitCode || '', b.r.unitCode || '') || (a.r.arrival || '').localeCompare(b.r.arrival || ''));
  return out;
}

// The months a set of stays touches by check-out (bookings are saved under their check-out month), 'YYYY-MM' sorted
export const monthsOf = recs => [...new Set(recs.map(r => r.departureMonth).filter(Boolean))].sort();

// 24 Nov 2026: Monthly check (Bulk Upload). Accounting uploads the whole month's eZee Reservation report; besides what
// classifyNew finds (bookings someone forgot to upload, changes, clashes), this finds active eZee bookings in the PMS that
// eZee no longer has as booked, i.e. a cancellation nobody uploaded:
//   gone     the file has the reservation, but only as cancelled (no room in eZee)  -> default: Cancel in the PMS
//   missing  the file doesn't have the reservation at all, and its check-out is in a month the file holds in full
//            (fullMonths, picked by Accounting)                                      -> default: Keep (could be a short file)
// A booking whose month's owner statement is completed can't be cancelled here (locked).
// existing: this property's saved eZee bookings (as checkNew reads them); done(unitId, month) as for classifyNew.
export function classifyMissing(recs, existing, { fullMonths = [], done = () => false } = {}) {
  const inFile = new Map();
  for (const r of recs) {
    const e = inFile.get(r.reservationNo) || { active: false, row: r };
    if (r.status === 'active') e.active = true;
    inFile.set(r.reservationNo, e);
  }
  const months = new Set(fullMonths), out = { gone: [], missing: [] };
  for (const b of existing) {
    if (b.status === 'cancelled' || b.removedByHand || b.supersededBy) continue;
    const f = inFile.get(b.reservationNo);
    if (f && f.active) continue;
    if (!f && !months.has(b.departureMonth)) continue;
    const locked = done(b.unitId, b.departureMonth);
    const item = { booking: b, row: f?.row || null, locked, why: '' };
    if (f) {
      item.why = 'eZee has this reservation as cancelled (no room). It is still booked in the PMS.';
      item.choice = locked ? 'keep' : 'cancel';
      out.gone.push(item);
    } else {
      item.why = 'Not in this file, but booked in the PMS for a month the file holds in full.';
      item.choice = 'keep';
      out.missing.push(item);
    }
    if (locked) item.why += ' Its owner statement is completed, so it can\'t be cancelled here (a Director must reopen it).';
  }
  const by = (a, b) => byUnit(a.booking.unitCode || '', b.booking.unitCode || '') || (a.booking.arrival || '').localeCompare(b.booking.arrival || '');
  out.gone.sort(by); out.missing.sort(by);
  return out;
}

// The check-out month with the most rows: the month a monthly report is most likely for
export function mainMonth(recs) {
  const n = {};
  for (const r of recs) if (r.departureMonth) n[r.departureMonth] = (n[r.departureMonth] || 0) + 1;
  return Object.keys(n).sort((a, b) => n[b] - n[a] || a.localeCompare(b))[0] || '';
}
