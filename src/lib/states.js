// lib/states.js (12 Nov 2026, state security Phase 1): the Malaysian states on staff accounts and properties.
// - users/{uid}.states: the states a staff member works in (several allowed). Directors need none: they see every state.
// - properties/{id}.state (top level, used by the rules and queries) and info.state (the form) always hold the same value.
// A short code or a name only has to be unique inside one state, and new property ids never overwrite another state's.
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase.js';

export const STATES = ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
  'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya'];

const key = s => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');
// Other ways people write a state (files, old data) -> the name in STATES
const ALIASES = {
  kl: 'W.P. Kuala Lumpur', kualalumpur: 'W.P. Kuala Lumpur', wpkualalumpur: 'W.P. Kuala Lumpur', wilayahpersekutuankualalumpur: 'W.P. Kuala Lumpur',
  labuan: 'W.P. Labuan', wplabuan: 'W.P. Labuan', putrajaya: 'W.P. Putrajaya', wpputrajaya: 'W.P. Putrajaya',
  penang: 'Pulau Pinang', pinang: 'Pulau Pinang', malacca: 'Melaka', ns: 'Negeri Sembilan', nsembilan: 'Negeri Sembilan', jb: 'Johor', johorbahru: 'Johor'
};
const BY_KEY = Object.fromEntries(STATES.map(s => [key(s), s]));
// "kuala lumpur" / "KL" / "W.P. Kuala Lumpur" -> 'W.P. Kuala Lumpur'; '' when it is not a state ("Wilayah Persekutuan" alone is not enough)
export const normState = v => BY_KEY[key(v)] || ALIASES[key(v)] || '';

// A property's state: the top-level field, else the form's info.state (older properties). '' = not set yet.
export const stateOf = p => (p ? normState(p.state) || normState(p.info?.state) : '');
// A staff member's states as saved on users/{uid} (always an array of names from STATES)
export const statesOf = u => (Array.isArray(u?.states) ? u.states.map(normState).filter(Boolean) : []);
export const isDirectorRole = r => r === 'director';
// The states a signed-in person may give a property, lead or listing. Every state for everyone since 12 Nov 2026:
// access is by property now (users/{uid}.properties, lib/property-scope.js), so a state no longer limits anyone.
export const stateChoices = () => STATES;
// "Johor, Melaka" / "All states" / "No state yet"
export const statesText = u => (isDirectorRole(u?.role) ? 'All states' : statesOf(u).join(', ') || 'No state yet');
// Short label for a state chip: "KL" instead of "W.P. Kuala Lumpur"
export const shortState = s => ({ 'W.P. Kuala Lumpur': 'KL', 'W.P. Labuan': 'Labuan', 'W.P. Putrajaya': 'Putrajaya', 'Negeri Sembilan': 'N. Sembilan' }[s] || s);

const nk = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');   // same as Portfolio's slug

// Why a new (or renamed) property can't be saved: the same state already has this code or name. '' = fine.
// A property with no state yet blocks the same code or name too: it may be the same building, so its state is set first.
// exceptId: the property being edited.
export function clashIn(properties, { name, code, state }, exceptId = null) {
  const st = normState(state);
  for (const p of properties || []) {
    if (p.id === exceptId) continue;
    const ps = stateOf(p), same = (code && nk(p.code) === nk(code)) || (name && nk(p.name) === nk(name));
    if (!same) continue;
    const what = code && nk(p.code) === nk(code) ? `the code ${String(code).toUpperCase()}` : `the name ${name}`;
    if (!ps) return `${p.name} (${p.code || p.id}) has no state yet and already uses ${what}. A Director sets its state first (Properties > Set them now).`;
    if (ps === st) return `${p.name} (${p.code || p.id}) in ${ps} already uses ${what}. Choose it instead, or use another ${code && nk(p.code) === nk(code) ? 'code' : 'name'}.`;
  }
  return '';
}

// Is a property id used already? A refusal from the rules also counts as used (it belongs to a state you can't see).
async function idTaken(id) {
  try { return (await getDoc(doc(db, 'properties', id))).exists(); }
  catch (e) { if (e.code === 'permission-denied') return true; throw e; }
}
// A new property's id: slug(name); if that is taken, name-state; then name-state-2, -3 ... Existing ids never change.
// alsoTaken: ids picked earlier in the same upload, not saved yet.
export async function newPropertyId(name, state, alsoTaken = new Set()) {
  const base = slug(name), st = slug(normState(state) || state || 'x');
  if (!base) throw new Error('The property name has no letters or numbers.');
  const tries = [base, `${base}-${st}`];
  for (let n = 2; n < 50; n++) tries.push(`${base}-${st}-${n}`);
  for (const id of tries) if (!alsoTaken.has(id) && !(await idTaken(id))) return id;
  throw new Error(`Could not find a free id for ${name}.`);
}

// The fields a new property is saved with: state at the top (rules and queries) and in info (the form).
export function propertyFields({ name, code, info = {}, state }) {
  const st = normState(state);
  return { name, code, state: st, info: { address: '', city: '', ezeeAccount: '', ezeeName: '', ...info, state: st } };
}

// The property picker's label: "Name (CODE)", plus " · State" when the same code is used in another state too.
export function propertyLabel(p, all = []) {
  const base = `${p.name} (${p.code || p.id})`;
  const twin = all.some(x => x.id !== p.id && nk(x.code) === nk(p.code) && stateOf(x) !== stateOf(p));
  return twin && stateOf(p) ? `${base} · ${shortState(stateOf(p))}` : base;
}

// eZee upload: the properties a building in the file can be. eZee name first (exact), then code or name.
// account: the eZee account number of the property picked on the page; when several match and one shares it, that one wins.
// Returns a list: one item = a match, several = ask, none = a new property.
export function ezeeCandidates(properties, { code, building, account }) {
  const byEzee = properties.filter(p => building && (nk(p.ezeeName) === nk(building) || nk(p.info?.ezeeName) === nk(building)));
  if (byEzee.length === 1) return byEzee;
  let list = byEzee.length ? byEzee : properties.filter(p => (code && nk(p.code) === nk(code)) || (building && nk(p.name) === nk(building)));
  if (list.length > 1 && account) {
    const same = list.filter(p => nk(p.info?.ezeeAccount) === nk(account));
    if (same.length === 1) list = same;
  }
  return list;
}

// ---------- Stamping records with their property's state (12 Nov 2026, state security Phase 2) ----------
// Every property-linked record carries a top-level `state` copied from its property (owners, tenants and eZee upload
// records carry `states`, a list). Child records (terms, private parts, replies, rate versions) don't: the rules read
// their parent's. The properties' states are remembered as they are read (loadProperties / watchProperties), so most
// writes add the state without another read.
const known = new Map();
export function rememberStates(list) { for (const p of list || []) if (p?.id) known.set(p.id, stateOf(p)); }
export function forgetState(propertyId) { known.delete(propertyId); }
// The state of a property already read on this page, '' when it has none, undefined when it was not read yet
export const knownState = propertyId => (propertyId && known.has(propertyId) ? known.get(propertyId) : undefined);
// { state } to spread into a new record, or {} when the property's state is not known (the Stamp tool fills it in later)
export const stateTag = propertyId => (knownState(propertyId) ? { state: knownState(propertyId) } : {});
// The state of a property, reading it when it was not read yet. '' = none (or not allowed to read it).
export async function stateFor(propertyId) {
  if (!propertyId) return '';
  const k = knownState(propertyId);
  if (k !== undefined) return k;
  try {
    const s = await getDoc(doc(db, 'properties', propertyId));
    const st = s.exists() ? stateOf(s.data()) : '';
    known.set(propertyId, st);
    return st;
  } catch (e) { return ''; }
}
// The record with its property's state added: withState(propertyId, { ... })
export async function withState(propertyId, data) {
  const state = await stateFor(propertyId);
  return state ? { ...data, state } : data;
}
// The states of several properties, for records linked to more than one (eZee upload records): ['Johor', 'Melaka']
export async function statesFor(propertyIds) {
  const list = await Promise.all([...new Set((propertyIds || []).filter(Boolean))].map(stateFor));
  return [...new Set(list.filter(Boolean))].sort();
}
