// One place that starts Firebase. Everything imports from here.
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, terminate, clearIndexedDbPersistence, doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { firebaseConfig } from '../firebase-config.js';
import { PRESETS } from './access.js';

export const configMissing = firebaseConfig.apiKey.startsWith('PASTE');

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Offline cache (persistent, shared by every tab): documents read or written are kept in this browser profile
// (IndexedDB). Pages read finished data from it first (completed statements, month summaries that are still current:
// see summary-data.js readMonthDoc and Month-end's cachedStatement), which saves free-plan reads. Because the copy stays
// in the browser profile, Log out deletes it (logOut below), so the next person on a shared computer starts empty.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true
});

// Roles that can sign in. Each sees only the pages in its sidebar (nav.js) and its route list (router.js).
export const ALLOWED_ROLES = ['director', 'finance', 'it', 'hr', 'operations', 'procurement', 'marketing'];   // every role signs in (Khairul 21 Oct)
export const ROLE_LABEL = { director: 'Director', finance: 'Finance', it: 'IT', operations: 'Operations', hr: 'HR', procurement: 'Procurement', marketing: 'Marketing' };

// Roles made on the Roles page (Director only), kept in roles/{id}. Built-in roles can also have their usual pages changed there.
// loadRoleRegistry() copies them into ROLE_LABEL, ALLOWED_ROLES and PRESETS (lib/access.js), so the rest of the app reads them as before.
// Runs once after sign-in; the Roles page runs it again after a save. If the roles collection can't be read (rules not published yet), the built-in roles work as before.
export const BUILTIN_ROLES = ['director', 'finance', 'it', 'operations', 'hr', 'procurement', 'marketing'];
export const CUSTOM_ROLES = {};   // id -> { name, description, color, active }
const ORIGINAL_PRESETS = JSON.parse(JSON.stringify(PRESETS));
let registry = null;
export function loadRoleRegistry(force = false) {
  if (registry && !force) return registry;
  registry = (async () => {
    try {
      const snap = await getDocs(collection(db, 'roles'));
      for (const id of BUILTIN_ROLES) if (id !== 'director') PRESETS[id] = ORIGINAL_PRESETS[id];
      for (const id of Object.keys(CUSTOM_ROLES)) { delete CUSTOM_ROLES[id]; delete ROLE_LABEL[id]; delete PRESETS[id]; }
      for (let i = ALLOWED_ROLES.length - 1; i >= 0; i--) if (!BUILTIN_ROLES.includes(ALLOWED_ROLES[i])) ALLOWED_ROLES.splice(i, 1);
      snap.forEach(d => {
        const r = d.data(), id = d.id;
        if (BUILTIN_ROLES.includes(id)) { if (id !== 'director' && Array.isArray(r.perms)) PRESETS[id] = r.perms; return; }
        CUSTOM_ROLES[id] = { name: r.name || id, description: r.description || '', color: r.color || '', active: r.active !== false };
        ROLE_LABEL[id] = r.name || id;
        PRESETS[id] = Array.isArray(r.perms) ? r.perms : [];
        if (r.active !== false) ALLOWED_ROLES.push(id);
      });
    } catch (e) { console.warn('Could not read the roles (publish the latest security rules):', e.code || e.message); }
  })();
  return registry;
}

// A person's role lives on their staff record, users/{uid} (set on the Staff accounts page).
// The security rules read the same record, so the role here and in the rules always match.
// perms = the pages ticked on Staff accounts (lib/access.js), or null = their role's usual pages. Turned off = none.
export async function profileOf(user) {
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) return { role: null, perms: [], name: user.email };
    const p = snap.data();
    const active = p.active !== false;
    await loadRoleRegistry();
    return {
      role: active ? (p.role || null) : null,
      perms: !active ? [] : Array.isArray(p.perms) ? p.perms : null,
      name: p.displayName || user.email,
      active
    };
  } catch (_) {
    return { role: null, perms: [], name: user.email };
  }
}

// Resolves once with { user, role, perms, name } (user = null when signed out).
export function whoAmI() {
  return new Promise(resolve => {
    const stop = onAuthStateChanged(auth, async user => {
      stop();
      if (!user) return resolve({ user: null, role: null, perms: [] });
      resolve({ user, ...(await profileOf(user)) });
    });
  });
}

// Log out also clears the offline cache: Firestore is stopped first (the cache can only be cleared then), the saved
// copy is deleted from this browser profile, and the page reloads so Firestore starts again empty for the next person.
// If another tab still holds the cache open, clearing fails; signing out still happens, and the copy is cleared at the
// next Log out with one tab.
export async function logOut() {
  await signOut(auth);
  try { indexedDB.deleteDatabase('wb-cache'); } catch (e) { /* no browser storage */ }   // lib/cache.js copies
  try { await terminate(db); await clearIndexedDbPersistence(db); }
  catch (e) { console.warn('Could not clear the offline copy (another Widebed tab is open?):', e.code || e.message); }
  location.replace('/');
}