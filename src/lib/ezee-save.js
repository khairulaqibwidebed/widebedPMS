// lib/ezee-save.js (24 Nov 2026): saving eZee bookings, moved here word for word from pages/Finance/Upload.vue so the
// Upload eZee report page and Bulk Upload > New bookings (eZee) save bookings exactly the same way: the raw row kept as
// uploaded, names in private/main, unchanged rows skipped by their fingerprint (rawHash), rooms removed or moved by hand
// on Month-end left as they are, and every unit (and month) touched marked for its summary to be worked out again.
// check = { month, property: { id }, savedHash, savedUnit, held, via }; list = readEzee records with docId, unitId, isNew.
import { collection, doc, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';
import { rowHash } from '@/lib/finance-import.js';
import { markDirty } from '@/lib/summary-data.js';
import { scoped, getScoped, myProperties } from '@/lib/property-scope.js';
import { stateTag } from '@/lib/states.js';

export const CHUNK = 120;   // bookings per batch: 2 writes each, plus up to 2 summary marks each, under Firestore's 500 limit

  // Bookings: raw row kept as uploaded; names go to private/main (IT never sees them).
  // A booking whose rawHash matches the saved one is not written again (and its unit's summary stays as it is);
  // every booking that is written marks its unit's month summary stale in the same batch (and the unit it moved from).
export async function saveEzeeBookings(list, batchRef, check, onProgress = () => {}) {
    const month = check.month, pid = check.property.id;
    const tally = { created: 0, changed: 0, unchanged: 0, writes: 0 };
    const retired = new Set();
    let rows = list.map(r => {
      const { private: priv, propertyCode, isNew, ...data } = r;
      return { r, priv, data, isNew, hash: rowHash(data, priv) };
    });
    // Rows of one document (a plain reservation number) are fingerprinted together; multi-room rows have a document each.
    const groups = new Map();
    for (const x of rows) { const k = x.r.docId; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x.hash); }
    rows = rows.map(x => {
      const hs = groups.get(x.r.docId);
      const hash = hs.length === 1 ? x.hash : rowHash({ rows: hs }, null);
      return { ...x, hash, same: !x.isNew && check.savedHash?.[x.r.docId] === hash };
    });
    // A booking new to this month may be saved under another month (its check-out moved): that month's summary is stale too.
    // Only the new ones are looked up, 30 at a time (a missing one costs nothing; at least one read per lookup).
    const moved = {};
    const fresh = [...new Set(rows.filter(x => x.isNew).map(x => x.r.reservationNo))];
    // Staff look only in their own properties (lib/property-scope.js). Firestore allows 30 combinations per query,
    // so they check 10 numbers x 3 properties at a time; a Director checks 30 numbers across every property.
    const step = myProperties() ? 10 : 30;
    for (let i = 0; i < fresh.length; i += step) {
      const snap = await getScoped(scoped(query(collection(db, 'bookings'), where('reservationNo', 'in', fresh.slice(i, i + step))), 'propertyId', { per: 3 }));
      snap.docs.forEach(d => { const o = d.data(); if (o.departureMonth && (o.departureMonth !== month || o.propertyId !== pid)) moved[d.id] = o; });
    }
    for (const x of rows) if (x.r.status === 'active') tally[x.isNew ? 'created' : x.same ? 'unchanged' : 'changed']++;
    const write = rows.filter(x => !x.same);
    for (let i = 0; i < write.length; i += CHUNK) {
      const b = writeBatch(db);
      const dirty = new Map();   // "propertyId|month" -> unit ids
      const touch = (p, m, u) => { const k = `${p}|${m}`; if (!dirty.has(k)) dirty.set(k, []); dirty.get(k).push(u); };
      for (const { r, priv, data, isNew, hash } of write.slice(i, i + CHUNK)) {
        // Removed or moved by hand on Month-end: eZee's status and room must not undo it
        if (check.held?.[r.docId] === 'removed') delete data.status;
        if (check.held?.[r.docId] === 'moved') { delete data.unitId; delete data.unitCode; }
        data.importBatchId = batchRef.id; data.lastImportedAt = serverTimestamp(); data.rawHash = hash;
        // 24 Nov 2026: which upload wrote it last (Portfolio > Bookings > eZee bookings): 'daily' (Bulk Upload > New bookings),
        // 'month' (Bulk Upload > Monthly check) or 'report' (Finance > Upload eZee report, the default)
        data.uploadedVia = check.via || 'report';
        if (isNew) data.firstImportedAt = serverTimestamp();
        b.set(doc(db, 'bookings', r.docId), { ...data, ...stateTag(data.propertyId) }, { merge: true });   // carries its property's state
        b.set(doc(db, 'bookings', r.docId, 'private', 'main'), priv, { merge: true });
        // The same reservation saved earlier as ONE document (before rows were kept apart): retire it so it is not counted twice
        if (r.docId !== r.reservationNo && check.savedUnit && r.reservationNo in check.savedUnit && !retired.has(r.reservationNo)) {
          retired.add(r.reservationNo);
          b.set(doc(db, 'bookings', r.reservationNo), { status: 'cancelled', supersededBy: 'split rows', lastImportedAt: serverTimestamp() }, { merge: true });
          touch(pid, month, check.savedUnit[r.reservationNo] || null);
        }
        touch(pid, month, r.unitId || null);
        if (!isNew && check.savedUnit?.[r.docId] !== r.unitId) touch(pid, month, check.savedUnit[r.docId] || null);   // room move
        const o = moved[r.docId];
        if (o) touch(o.propertyId, o.departureMonth, o.unitId || null);
      }
      for (const [k, ids] of dirty) { const [p, m] = k.split('|'); markDirty(b, p, m, ids); }
      await b.commit();
      tally.writes += 2 * Math.min(CHUNK, write.length - i);
      onProgress(Math.min(1, (i + CHUNK) / write.length));
    }
    return tally;
  }
