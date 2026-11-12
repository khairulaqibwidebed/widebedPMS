// lib/shared-rates.js (12 Nov 2026, Khairul): ONE set of fees and rates for every property, on Portfolio > Fees & Rates.
//
// Stored in sharedRates/{effectiveFrom}_{ms}: the same shape as a property's rate version (properties/{id}/rateVersions):
//   { effectiveFrom, ota, earlyCheckInToOwner, tourismTaxPerNight, arrangements: { [id]: arrangement | null }, reason, ... }
// Add-only, like rate versions: every change is a new document from the month picked.
//
// How a property's rates are worked out (mergeVersions), for a month:
//   - no shared version in force that month: the property's own rate version, unchanged (months before the shared set
//     started keep their old numbers)
//   - otherwise OTA commissions, early check-in and Tourism Tax come from the shared version, and the arrangements are the
//     property's own list with the shared list on top (same id: the shared one wins; null in the shared list = deleted).
//     Pool Sharing stays per property: when the property has its own copy of a Pool arrangement, its Net Rental # % wins.
//   - each unit still picks one arrangement, and a unit's own % (Units tab) still wins over the arrangement.
// The property tabs (Fees & rates, OTA commissions) stay for now and still save on the property; once a shared version is
// in force they only count for Pool Net Rental # % and for arrangements that are not on the shared list.
//
// Until the rules allow sharedRates (see HANDOFF), the read is refused and every property works as before.
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase.js';
import { cached, clearCache, TTL } from './cache.js';
import { arrangementsOf, feeType } from './fee-types.js';

const KEY = 'sharedRates';
const stampMs = t => (t?.toMillis ? t.toMillis() : 0);

// Every shared version (oldest first). [] when there are none or the rules don't allow the read yet.
export function loadSharedVersions() {
  return cached(KEY, TTL.mid, async () => {
    try {
      const snap = await getDocs(collection(db, 'sharedRates'));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.effectiveFrom || '').localeCompare(b.effectiveFrom || '') || stampMs(a.createdAt) - stampMs(b.createdAt));
    } catch (e) {
      if (e?.code !== 'permission-denied') console.warn('Could not read the shared fees and rates:', e?.code || e?.message);
      return [];
    }
  });
}
export const forgetShared = () => clearCache(KEY);

// Same rule as finance-data.js latestVersion (copied: finance-data imports this file).
function latest(versions, month) {
  return (versions || []).filter(v => (v.effectiveFrom || '') <= month)
    .sort((a, b) => (b.effectiveFrom || '').localeCompare(a.effectiveFrom || '') || stampMs(b.createdAt) - stampMs(a.createdAt))[0] || null;
}

// The shared list without deleted entries (null)
export const sharedList = v => Object.fromEntries(Object.entries(v?.arrangements || {}).filter(([, a]) => a));

// One property's rate version combined with the shared one in force the same month.
export function combine(own, shared) {
  if (!shared) return own;
  const mine = arrangementsOf(own), list = { ...mine };
  for (const [id, a] of Object.entries(shared.arrangements || {})) {
    if (!a) { delete list[id]; continue; }
    const p = mine[id];
    // Pool Sharing: the Net Rental # % is the property's own (Khairul 12 Nov 2026)
    list[id] = feeType(a.type).id === 'pool' && p && p.netRentalPct != null ? { ...a, netRentalPct: p.netRentalPct } : a;
  }
  return {
    ...(own || {}), id: own?.id || shared.id, effectiveFrom: own && own.effectiveFrom > shared.effectiveFrom ? own.effectiveFrom : shared.effectiveFrom,
    ota: shared.ota || own?.ota, earlyCheckInToOwner: shared.earlyCheckInToOwner ?? own?.earlyCheckInToOwner,
    tourismTaxPerNight: shared.tourismTaxPerNight ?? own?.tourismTaxPerNight, arrangements: list,
    shared: true, sharedFrom: shared.effectiveFrom, sharedId: shared.id
  };
}

// A property's rate versions with the shared set worked in: one version per month where either list changes.
// Returns the property's own list unchanged when there is no shared version.
export function mergeVersions(own, shared) {
  if (!shared || !shared.length) return own || [];
  const months = [...new Set([...(own || []), ...shared].map(v => v.effectiveFrom || ''))].sort();
  return months.map(m => {
    const s = latest(shared, m), o = latest(own, m);
    if (!s) return o ? { ...o, effectiveFrom: m } : null;
    return { ...combine(o, s), effectiveFrom: m, createdAt: null };
  }).filter(Boolean);
}

// The property's own versions -> merged versions (reads the shared set, cached)
export async function withShared(own) { return mergeVersions(own, await loadSharedVersions()); }

// ---------- Build shared set from properties (Director, one time) ----------
// sources = [{ id, name, code, active, version }] (each property's own rate version in force for the month).
// Collects every arrangement (by id), every OTA channel, early check-in and Tourism Tax, each with its different values
// ("variants") and the properties that use each one, most used first. The page shows a pick wherever there is more than one.
// Pool Sharing's Net Rental # % is not compared: it stays per property.
const r6 = v => Math.round(Number(v || 0) * 1e6) / 1e6;
const arrSig = a => [String(a.name || '').trim().toLowerCase(), a.type || '', a.section || 'short', r6(a.servicePct), r6(a.utilityPct), r6(a.sstPct)].join('|');
const otaSig = v => [v.payout, r6(v.commissionPct), ...(v.payout === 'gross' ? [r6(v.paymentFeePct), r6(v.sstPct ?? 0.08)] : [])].join('|');
function add(map, sig, value, src) {
  if (!map.has(sig)) map.set(sig, { value, props: [] });
  map.get(sig).props.push({ id: src.id, name: src.name, code: src.code, active: src.active });
}
const ranked = map => [...map.values()].sort((a, b) => b.props.length - a.props.length);
export function planShared(sources, defaultOta) {
  const arr = new Map(), ota = Object.fromEntries(Object.keys(defaultOta).map(k => [k, new Map()])), early = new Map(), tax = new Map();
  for (const src of sources) {
    const v = src.version;
    for (const [id, a] of Object.entries(arrangementsOf(v))) {
      if (!arr.has(id)) arr.set(id, new Map());
      add(arr.get(id), arrSig(a), a, src);
    }
    for (const [k, d] of Object.entries(defaultOta)) { const o = { ...d, ...(v?.ota?.[k] || {}) }; add(ota[k], otaSig(o), o, src); }
    const e = v ? v.earlyCheckInToOwner !== false : true; add(early, String(e), e, src);
    const t = Number(v?.tourismTaxPerNight ?? 10); add(tax, String(t), t, src);
  }
  const order = { short: 0, mid: 1, long: 2 };
  return {
    arrangements: [...arr.entries()].map(([id, m]) => ({ id, variants: ranked(m) }))
      .sort((x, y) => (order[x.variants[0].value.section] ?? 3) - (order[y.variants[0].value.section] ?? 3)
        || String(x.variants[0].value.name).localeCompare(String(y.variants[0].value.name), 'en', { numeric: true })),
    ota: Object.entries(defaultOta).map(([key, d]) => ({ key, label: d.label, variants: ranked(ota[key]) })),
    early: ranked(early), tax: ranked(tax)
  };
}
