// Saved copies of slow-changing data (properties, units, owners, setup), kept in this browser for a few minutes so a
// reload or another page doesn't read the same documents again. Live data (open months, bookings, expenses, statements,
// staff and roles) never goes through here.
//   const list = await cached('properties', TTL.long, () => loadFromFirestore());
// Saving anything that changes these documents must call clearCache(). The Refresh button and Log out call it too.
import { reactive } from 'vue';
import { getAuth } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';

export const TTL = { long: 30 * 60 * 1000, mid: 10 * 60 * 1000 };
export const CACHE_DB = 'wb-cache';
const STORE = 'kv';
const VERSION = 1;   // raise it when the shape of a cached value changes

// When data was last read from Firestore (not from this copy), for the "Updated … ago" label.
export const cacheState = reactive({ loadedAt: 0 });

const mem = new Map();   // key -> { at, value }
const inflight = new Map();

const uid = () => getAuth().currentUser?.uid || 'anon';
const full = key => `${VERSION}|${uid()}|${key}`;

// Firestore Timestamps survive the round trip.
const enc = value => JSON.stringify(value, function (k, v) { const raw = this[k]; return raw instanceof Timestamp ? { __ts: [raw.seconds, raw.nanoseconds] } : v; });
const dec = text => JSON.parse(text, (k, v) => (v && typeof v === 'object' && Array.isArray(v.__ts) ? new Timestamp(v.__ts[0], v.__ts[1]) : v));

let dbp = null;
function idb() {
  if (!dbp) dbp = new Promise((resolve, reject) => {
    try {
      const r = indexedDB.open(CACHE_DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    } catch (e) { reject(e); }
  });
  return dbp;
}
const run = (mode, fn) => idb().then(db => new Promise((resolve, reject) => {
  const req = fn(db.transaction(STORE, mode).objectStore(STORE));
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
})).catch(() => undefined);   // no browser storage (private window): the memory copy still works

export async function cached(key, ttl, load) {
  const k = full(key);
  const hit = mem.get(k);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  if (inflight.has(k)) return inflight.get(k);
  const p = (async () => {
    const saved = await run('readonly', s => s.get(k));
    if (saved && Date.now() - saved.at < ttl) {
      try { const value = dec(saved.json); mem.set(k, { at: saved.at, value }); return value; } catch (e) { /* unreadable copy: read again */ }
    }
    const value = await load();
    const at = Date.now();
    mem.set(k, { at, value });
    cacheState.loadedAt = at;
    run('readwrite', s => s.put({ at, json: enc(value) }, k));
    return value;
  })().finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

// Forget saved copies (all of them, or the ones whose key starts with `prefix`).
export async function clearCache(prefix = '') {
  const start = full(prefix);
  for (const k of [...mem.keys()]) if (k.startsWith(start)) mem.delete(k);
  for (const k of [...inflight.keys()]) if (k.startsWith(start)) inflight.delete(k);
  await run('readwrite', s => s.delete(IDBKeyRange.bound(start, start + '￿')));
  cacheState.loadedAt = 0;
}

// Per-record copies kept with the stamp they were read for (19 Nov 2026, Firestore reads): e.g. each owner's private
// part, kept with its owner record's updatedAt. Only records whose stamp moved (or that were never read) are read again;
// there is no time limit, because every save of the private part also moves the stamp (same batch). Cleared like
// everything else by clearCache (same key prefix), Refresh and Log out.
//   const privs = await keepFresh('ownerPriv:main', owners, o => stampOf(o), o => readPriv(o.id), { prune: true });
// items: records with an id. load(item) throwing = not saved (read again next time); the old copy is used if there is one.
// prune: drop saved ids that are not in items (when items is the whole list).
export async function keepFresh(key, items, stampOf, load, { prune = false } = {}) {
  const k = full(key);
  let saved = mem.get(k)?.value;
  if (!saved) {
    const s = await run('readonly', st => st.get(k));
    try { saved = s ? dec(s.json) : {}; } catch (e) { saved = {}; }
  }
  const out = {}, next = prune ? {} : { ...saved };
  let changed = false;
  await Promise.all(items.map(async it => {
    const s = String(stampOf(it) ?? ''), hit = saved[it.id];
    if (hit && hit.s === s) { out[it.id] = hit.v; if (prune) next[it.id] = hit; return; }
    try { const v = await load(it); out[it.id] = v; next[it.id] = { s, v }; changed = true; }
    catch (e) { if (hit) { out[it.id] = hit.v; if (prune) next[it.id] = hit; } }   // old copy shown, old stamp kept: read again next time
  }));
  if (prune && Object.keys(next).length !== Object.keys(saved).length) changed = true;
  const value = changed ? next : saved, at = mem.get(k)?.at || Date.now();
  mem.set(k, { at, value });
  if (changed) run('readwrite', st => st.put({ at, json: enc(value) }, k));
  return out;
}

// Change one saved value in place (e.g. one owner in the owners list) instead of throwing it away and reading it all
// again. The saved copy keeps its age. Nothing saved under that key = nothing to do (the next read is fresh anyway).
export async function patchCache(key, change) {
  const k = full(key);
  let hit = mem.get(k);
  if (!hit) {
    const saved = await run('readonly', s => s.get(k));
    if (!saved) return false;
    try { hit = { at: saved.at, value: dec(saved.json) }; } catch (e) { return false; }
  }
  const value = change(hit.value);
  mem.set(k, { at: hit.at, value });
  run('readwrite', s => s.put({ at: hit.at, json: enc(value) }, k));
  return true;
}
