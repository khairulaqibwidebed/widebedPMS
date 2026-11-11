// Live data for any page (6 Nov 2026): the ONE place the app listens to Firestore or polls outside data (the TMS).
// Pages never call onSnapshot themselves; if something is missing, add it here. Rules: handoffs/LIVE_PAGES.md.
//
// listen(target, onData, opts) -> stop()
//   target = a DocumentReference or a Query (keep queries small: a limit, or one record's sub-collection).
//   onData gets { id, ...data } (null when the doc does not exist) for a doc, or an array of rows for a query.
//   Your own just-saved change shows at once (server times are estimated until Firestore confirms them).
//   opts: onError(e) (e.friendly = text for the screen), map(row) per-row change, includeMeta (onData also gets
//   { fromCache, hasPendingWrites, changes: { added, modified, removed } } with ids), onStatus(status, lastUpdated).
//     const stop = listen(doc(db, 'units', id), u => { this.unit = u; });
//     const stop = listen(query(collection(db, 'issues'), where('status', '==', 'open'), limit(50)), rows => { this.rows = rows; });
//
// poll(fn, ms, opts) -> stop()   for outside data (TMS): runs fn every ms (never below minMs, default 30 s), pauses while
//   the tab is hidden, never two runs at once, waits longer after errors (x2, up to 5 min).
//     const stop = poll(async () => { this.tasks = await tmsInbox(); }, 60000);
//
// Options API pages: mixins: [liveMixin], then this.live('unit', ref, u => ...), this.livePoll('tms', fn, 60000),
//   this.liveUse('list', watchSomething(...)) for helpers that return a stop,
//   this.stopLive('unit'); this.liveStatus.unit = { status, lastUpdated } for <LiveStatus>. All stop in beforeUnmount.
// <script setup>: const { listen, poll, stopAll, status, lastUpdated } = useLive(); all stop in onUnmounted.
//
// Status: 'connecting' | 'live' | 'offline' (no internet, showing the saved copy) | 'error' (stopped, see onError).
// Two places listening to the same target share ONE Firestore listener (saves reads on the free plan).
// Every listener and poll stops when the user signs out, so nothing keeps reading under the next person.
import { onSnapshot, refEqual, queryEqual } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, onUnmounted } from 'vue';
import { auth } from '@/lib/firebase.js';
import { friendlyError } from '@/lib/finance-data.js';

const DEV = import.meta.env.DEV;
const shared = [];          // { target, isDoc, unsub, subs: Set, snap }
const active = new Set();   // every stop() handed out (listen and poll), for sign-out

const isDocRef = t => t?.type === 'document';
const sameTarget = (a, b) => {
  try { return isDocRef(a) ? isDocRef(b) && refEqual(a, b) : !isDocRef(b) && queryEqual(a, b); } catch { return false; }
};
const labelOf = t => (isDocRef(t) ? t.path : t?.path || 'query');
const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
// Permission and quota errors are final: say so once and stop (no retry loop). Firestore retries network trouble by itself.
const withText = e => { e.friendly = friendlyError(e, 'load live data'); return e; };

// One subscriber's view of a snapshot
function deliver(entry, sub, snap, replay) {
  const read = d => { const row = { id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }; return sub.map ? sub.map(row) : row; };
  const data = entry.isDoc ? (snap.exists() ? read(snap) : null) : snap.docs.map(read);
  const fromCache = snap.metadata.fromCache;
  const status = !fromCache ? 'live' : offline() ? 'offline' : 'connecting';
  if (!fromCache) sub.lastUpdated = new Date();
  sub.onStatus?.(status, sub.lastUpdated || null);
  if (!sub.includeMeta) return sub.onData(data);
  const changes = { added: [], modified: [], removed: [] };
  if (!entry.isDoc) {
    if (replay) changes.added = snap.docs.map(d => d.id);
    else snap.docChanges().forEach(c => changes[c.type].push(c.doc.id));
  }
  sub.onData(data, { fromCache, hasPendingWrites: snap.metadata.hasPendingWrites, changes });
}

function closeEntry(entry) {
  entry.unsub?.(); entry.unsub = null;
  const i = shared.indexOf(entry); if (i >= 0) shared.splice(i, 1);
  if (DEV) console.debug('[live] closed', labelOf(entry.target), '| open listeners:', shared.length);
}

export function listen(target, onData, { onError, map, includeMeta = false, onStatus } = {}) {
  const sub = { onData, onError, map, includeMeta, onStatus, lastUpdated: null };
  let entry = shared.find(e => sameTarget(e.target, target));
  if (entry) {
    entry.subs.add(sub);
    if (DEV) console.debug('[live] shared', labelOf(target), '| people on it:', entry.subs.size);
    // Joined late: show what the shared listener already has
    if (entry.snap) queueMicrotask(() => { if (entry.subs.has(sub)) deliver(entry, sub, entry.snap, true); });
  } else {
    entry = { target, isDoc: isDocRef(target), subs: new Set([sub]), snap: null, unsub: null };
    shared.push(entry);
    onStatus?.('connecting', null);
    const e0 = entry;
    entry.unsub = onSnapshot(target, { includeMetadataChanges: true },
      snap => { e0.snap = snap; [...e0.subs].forEach(s => deliver(e0, s, snap, false)); },
      err => {
        // A listener that gets an error is finished: tell everyone on it and close it
        withText(err);
        const subs = [...e0.subs]; e0.subs.clear(); closeEntry(e0);
        subs.forEach(s => { s.onStatus?.('error', s.lastUpdated); s.onError ? s.onError(err) : console.warn('[live]', err.code || err.message); });
      });
    if (DEV) console.debug('[live] opened', labelOf(target), '| open listeners:', shared.length);
  }
  const stop = () => {
    active.delete(stop);
    if (!entry.subs.delete(sub)) return;
    if (!entry.subs.size) closeEntry(entry);   // the last one out closes it
  };
  active.add(stop);
  return stop;
}

export function poll(fn, ms, { onError, immediate = true, minMs = 30000, onStatus } = {}) {
  const base = Math.max(ms || 0, minMs);
  let stopped = false, running = false, missed = false, fails = 0, timer = null, lastUpdated = null;
  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const wait = () => (fails ? Math.min(base * 2 ** fails, 5 * 60 * 1000) : base);
  const schedule = () => { clearTimeout(timer); if (!stopped) timer = setTimeout(run, wait()); };
  async function run() {
    if (stopped || running) return;
    if (hidden()) { missed = true; return; }   // picked up again when the tab comes back
    running = true; missed = false;
    try { await fn(); fails = 0; lastUpdated = new Date(); onStatus?.('live', lastUpdated); }
    catch (e) { fails++; onStatus?.(offline() ? 'offline' : 'error', lastUpdated); onError ? onError(e) : console.warn('[live] poll', e?.message || e); }
    running = false;
    schedule();
  }
  const onVisible = () => { if (!hidden() && missed) run(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  onStatus?.('connecting', null);
  if (immediate) run(); else schedule();
  const stop = () => {
    active.delete(stop); stopped = true; clearTimeout(timer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
  };
  active.add(stop);
  return stop;
}

// Stops every listener and poll in the app (sign-out)
export function stopEverything() { [...active].forEach(stop => stop()); }
let signedIn = false;
onAuthStateChanged(auth, user => { if (!user && signedIn) stopEverything(); signedIn = !!user; });

// For <script setup>
export function useLive() {
  const status = ref('connecting'), lastUpdated = ref(null), stops = new Set();
  const track = (s, d) => { s !== undefined && (status.value = s); d !== undefined && (lastUpdated.value = d); };
  const keep = stop => { stops.add(stop); return () => { stops.delete(stop); stop(); }; };
  const api = {
    listen: (target, onData, opts = {}) => keep(listen(target, onData, { ...opts, onStatus: (s, d) => { track(s, d); opts.onStatus?.(s, d); } })),
    poll: (fn, ms, opts = {}) => keep(poll(fn, ms, { ...opts, onStatus: (s, d) => { track(s, d); opts.onStatus?.(s, d); } })),
    stopAll: () => { stops.forEach(stop => stop()); stops.clear(); },
    status, lastUpdated
  };
  onUnmounted(api.stopAll);
  return api;
}

// For Options API pages. One key per thing on screen; a new call with the same key stops the old one first.
export const liveMixin = {
  data() { return { liveStatus: {} }; },
  created() { this.liveStops = {}; },
  beforeUnmount() { this.stopLive(); },
  methods: {
    liveTrack(key) { return (status, lastUpdated) => { this.liveStatus[key] = { status, lastUpdated }; }; },
    live(key, target, onData, opts = {}) {
      this.stopLive(key);
      const track = this.liveTrack(key);
      this.liveStops[key] = listen(target, onData, { ...opts, onStatus: (s, d) => { track(s, d); opts.onStatus?.(s, d); } });
    },
    livePoll(key, fn, ms, opts = {}) {
      this.stopLive(key);
      const track = this.liveTrack(key);
      this.liveStops[key] = poll(fn, ms, { ...opts, onStatus: (s, d) => { track(s, d); opts.onStatus?.(s, d); } });
    },
    // A helper that already returns a stop function (built on listen/poll, e.g. watchComplaintList): keep it under a key
    liveUse(key, stop) { this.stopLive(key); this.liveStops[key] = stop; },
    // No key = stop everything this page started
    stopLive(key) {
      const keys = key ? [key] : Object.keys(this.liveStops || {});
      for (const k of keys) { this.liveStops[k]?.(); delete this.liveStops[k]; delete this.liveStatus[k]; }
    }
  }
};

// Dev check: how many Firestore listeners are open right now
export const openListeners = () => shared.map(e => ({ target: labelOf(e.target), people: e.subs.size }));
