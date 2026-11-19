// DEV ONLY read meter (19 Nov 2026). Counts the Firestore documents each page gets FROM THE SERVER (the billable
// reads), per page and collection. vite.config.js points 'firebase/firestore' at this file only for `npm run dev`;
// the live site, `npm run build` and the tests never load it. To remove: delete this file and the alias in vite.config.js.
//
// In the browser console (F12):
//   reads()               the table, biggest first: page, collection, kind, reads, times
//   reads.byCollection()  totals per collection (all pages)
//   reads.byPage()        totals per page
//   reads.reset()         start counting again
//
// Approximate, on purpose simple:
//   getDoc                1 per call (also when the document doesn't exist)
//   getDocs               1 per document returned (1 for an empty result)
//   count                 1 per count query (getCountFromServer / getAggregateFromServer)
//   live open (max)       a live list's first answer from the server: every document in it. This is the MOST it can
//                         cost; Firestore charges less when it can reuse this browser's saved copy (reopened within ~30 min).
//   live change           documents changed in later live updates
// Anything answered from this browser's offline copy is not counted (it costs nothing).
export * from '@firebase/firestore';
import * as fs from '@firebase/firestore';

const rows = new Map();
let total = 0, nextNote = 500;

const page = () => location.pathname;
// Collection names only (ids dropped): owners/abc/private/main -> owners/private
const names = segs => segs.filter((_, i) => i % 2 === 0).join('/');
function collOf(t) {
  try {
    if (t?.type === 'document' || t?.type === 'collection') return names(t.path.split('/'));
    const q = t?._query;
    if (q?.collectionGroup) return q.collectionGroup + ' (every one)';
    const p = q?.path;
    if (p) return names(p.toArray ? p.toArray() : p.segments);
  } catch (_) { /* fall through */ }
  return '?';
}

function add(kind, target, n) {
  if (!n) return;
  const pg = page(), coll = collOf(target), key = `${pg}|${coll}|${kind}`;
  const r = rows.get(key) || { page: pg, collection: coll, kind, reads: 0, times: 0 };
  r.reads += n; r.times++;
  rows.set(key, r);
  total += n;
  if (total >= nextNote) { console.info(`[reads] ${total} server reads so far. Type reads() for the table.`); nextNote += 500; }
}
const fromServer = s => !s?.metadata?.fromCache;

export async function getDoc(ref) { const s = await fs.getDoc(ref); if (fromServer(s)) add('getDoc', ref, 1); return s; }
export async function getDocFromServer(ref) { const s = await fs.getDocFromServer(ref); add('getDoc', ref, 1); return s; }
export async function getDocs(q) { const s = await fs.getDocs(q); if (fromServer(s)) add('getDocs', q, Math.max(1, s.size)); return s; }
export async function getDocsFromServer(q) { const s = await fs.getDocsFromServer(q); add('getDocs', q, Math.max(1, s.size)); return s; }
export async function getCountFromServer(q) { const s = await fs.getCountFromServer(q); add('count', q, 1); return s; }
export async function getAggregateFromServer(q, spec) { const s = await fs.getAggregateFromServer(q, spec); add('count', q, 1); return s; }

// onSnapshot(target, [options], onNext | observer, [onError], [onComplete])
export function onSnapshot(target, ...args) {
  const i = args.findIndex(a => typeof a === 'function' || typeof a?.next === 'function');
  if (i >= 0) {
    const isDoc = target?.type === 'document';
    let first = true;
    const count = s => {
      try {
        if (!fromServer(s) || s.metadata.hasPendingWrites) return;
        if (isDoc) { add(first ? 'live open (max)' : 'live change', target, 1); first = false; return; }
        if (first) { add('live open (max)', target, Math.max(1, s.size)); first = false; return; }
        add('live change', target, s.docChanges().length);
      } catch (_) { /* never break a page over the meter */ }
    };
    const a = args[i];
    args[i] = typeof a === 'function'
      ? s => { count(s); return a(s); }
      : { next: s => { count(s); a.next?.(s); }, error: e => a.error?.(e), complete: () => a.complete?.() };
  }
  return fs.onSnapshot(target, ...args);
}

const sum = by => {
  const m = new Map();
  for (const r of rows.values()) m.set(r[by], (m.get(r[by]) || 0) + r.reads);
  return [...m].sort((a, b) => b[1] - a[1]).map(([k, reads]) => ({ [by]: k, reads }));
};
function reads() {
  console.table([...rows.values()].sort((a, b) => b.reads - a.reads));
  console.info(`[reads] total ${total} server reads (dev read meter, approximate).`);
  return total;
}
reads.byCollection = () => { console.table(sum('collection')); return total; };
reads.byPage = () => { console.table(sum('page')); return total; };
reads.reset = () => { rows.clear(); total = 0; nextNote = 500; console.info('[reads] counting from 0 again'); };
if (typeof window !== 'undefined') window.reads = reads;
console.info('[reads] Dev read meter on. Type reads() in the console for the table.');
